/**
 * Direct messaging — one service, both directions (PRD §8.2, §7.6, §11.2; ADR-025).
 *
 * There used to be two services over the same rows: a candidate side that could only reply, and a
 * company side that could only start. Both are gone. A conversation is between two PEOPLE, either
 * of whom may start it, and everything here is written from one point of view — "me, and the other
 * person" — because that is the only point of view a participant has.
 *
 * ── What "mine" means ─────────────────────────────────────────────────────────────────────────
 *
 * Every read is scoped by `participants: me`. A conversation I am not in is reported as absent,
 * never as forbidden, because a 403 would confirm that two named people are talking. There is no
 * company-level read: owners and admins see their own chats and nobody else's. "Chat private" admits
 * no membership-tier exception.
 *
 * ── Request → conversation ────────────────────────────────────────────────────────────────────
 *
 * The first message from a stranger is a REQUEST (`status: pending`). The recipient may accept,
 * decline, or simply reply — replying is acceptance, since asking someone to click "accept" before
 * a message they have already written would be ceremony. Until they do, the starter may send only a
 * few messages (`MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP`). Who may start one, and how many,
 * is decided in `messagingPolicy.js`.
 *
 * Unread counts, mute and read receipts are per PERSON. Opening a thread clears my count and stamps
 * `readAt` on the other person's messages — never on my own.
 */

import { MESSAGING_LIMITS } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { Company, companyInitials } from '../companies/company.model.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/auditEvent.model.js';
import { Conversation, CONVERSATION_STATUS, pairKeyFor, sortedPair } from './conversation.model.js';
import { Message } from './message.model.js';
import {
  assertSenderEligible,
  assertRecipientEligible,
  assertNewConversationAllowance,
  assertSendRate,
  blockedBetween,
  closedReasonFor,
  closedError,
  resolveOrigin,
  CLOSED_REASONS,
} from './messagingPolicy.js';

/* ── Participants ─────────────────────────────────────────────────────────────────────────────── */

const same = (a, b) => String(a) === String(b);

function otherParticipantId(conversation, me) {
  return conversation.participants.find((id) => !same(id, me)) ?? null;
}

function memberStateOf(conversation, userId) {
  return (conversation.members ?? []).find((member) => same(member.userId, userId)) ?? {};
}

/** Loads a conversation I am part of, or fails as if it did not exist. */
async function ownedConversation(userId, conversationId) {
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  return conversation;
}

/* ── Rendering ───────────────────────────────────────────────────────────────────────────────── */

function initialsOf(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * The other person, as a conversation shows them: name and photo only.
 *
 * No email, no id, no phone. What the other person needs is to recognise who they are talking to —
 * not a way to reach them off-platform, which stays governed by their own contact rules.
 */
function personView(user) {
  return {
    name: user?.name ?? null,
    photoUrl: user?.profilePicture ?? null,
    initials: initialsOf(user?.name) || null,
  };
}

function companyView(company) {
  if (!company) return null;
  return {
    id: String(company._id),
    name: company.name,
    slug: company.slug,
    logoUrl: company.logoUrl ?? null,
    initials: companyInitials(company.name),
  };
}

async function usersById(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const users = unique.length
    ? await User.find({ _id: { $in: unique } }).select('name profilePicture').lean()
    : [];
  return new Map(users.map((user) => [String(user._id), user]));
}

async function companiesById(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const companies = unique.length
    ? await Company.find({ _id: { $in: unique } }).select('name slug logoUrl').lean()
    : [];
  return new Map(companies.map((company) => [String(company._id), company]));
}

/** One inbox row, from my side. */
function conversationView(conversation, me, users, companies) {
  const otherId = otherParticipantId(conversation, me);
  const mine = memberStateOf(conversation, me);
  const startedByMe = same(conversation.startedBy, me);
  const closedReason = closedReasonFor(conversation, me);

  return {
    id: String(conversation._id),
    other: personView(users.get(String(otherId))),
    /** Where the conversation began — context for the title line, never a reader. */
    company: companyView(companies.get(String(conversation.origin?.companyId ?? ''))),
    status: conversation.status ?? CONVERSATION_STATUS.PENDING,
    startedByMe,
    /** A request I have not answered yet — the thing an inbox badge should count. */
    isRequest: conversation.status === CONVERSATION_STATUS.PENDING && !startedByMe,
    respondedAt: conversation.respondedAt ?? null,
    unread: mine.unread ?? 0,
    muted: Boolean(mine.mutedAt),
    reported: Boolean(conversation.reportedAt),
    reportedByMe: Boolean(conversation.reportedAt) && same(conversation.reportedBy, me),
    /** Whether *I* can write into it right now, and if not, why. */
    closed: closedReason !== null,
    closedReason,
    lastMessageAt: conversation.lastMessageAt ?? null,
    lastMessagePreview: conversation.lastMessagePreview ?? null,
    lastMessageFromMe: Boolean(conversation.lastMessageSenderId) && same(conversation.lastMessageSenderId, me),
    messageCount: conversation.messageCount ?? 0,
    createdAt: conversation.createdAt,
  };
}

function messageView(message, me, users) {
  const mine = same(message.senderUserId, me);
  return {
    id: String(message._id),
    mine,
    senderName: users.get(String(message.senderUserId))?.name ?? null,
    body: message.body,
    attachments: message.attachments ?? [],
    sentAt: message.createdAt,
    /** Read receipts are for the author: "they have seen this". Never shown for their messages. */
    readAt: mine ? (message.readAt ?? null) : null,
  };
}

/* ── Reads ───────────────────────────────────────────────────────────────────────────────────── */

/** My inbox, newest activity first, with the two counts a badge needs. */
export async function listConversations(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  const [users, companies] = await Promise.all([
    usersById(conversations.map((c) => otherParticipantId(c, userId))),
    companiesById(conversations.map((c) => c.origin?.companyId)),
  ]);

  const rows = conversations.map((c) => conversationView(c, userId, users, companies));

  return {
    conversations: rows,
    unreadTotal: rows.reduce((sum, row) => sum + row.unread, 0),
    pendingRequests: rows.filter((row) => row.isRequest).length,
  };
}

/** The badge counts alone — what the workspace rails poll. */
export async function conversationSummary(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .select('members status startedBy')
    .lean();

  return conversations.reduce(
    (summary, conversation) => {
      summary.unreadTotal += memberStateOf(conversation, userId).unread ?? 0;
      if (
        conversation.status === CONVERSATION_STATUS.PENDING &&
        !same(conversation.startedBy, userId)
      ) {
        summary.pendingRequests += 1;
      }
      return summary;
    },
    { unreadTotal: 0, pendingRequests: 0 },
  );
}

/**
 * One conversation with its messages. Opening it marks it read FOR ME: my unread count goes to
 * zero and the other person's messages get a `readAt`. Their side is untouched.
 */
export async function getConversation(userId, conversationId) {
  const conversation = await ownedConversation(userId, conversationId);
  const otherId = otherParticipantId(conversation, userId);

  const [messages, users, companies] = await Promise.all([
    Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).lean(),
    usersById(conversation.participants),
    companiesById([conversation.origin?.companyId]),
  ]);

  const now = new Date();
  await Promise.all([
    Conversation.updateOne(
      { _id: conversation._id },
      { $set: { 'members.$[me].unread': 0, 'members.$[me].lastReadAt': now } },
      { arrayFilters: [{ 'me.userId': userId }] },
    ),
    Message.updateMany(
      { conversationId: conversation._id, senderUserId: otherId, readAt: null },
      { $set: { readAt: now } },
    ),
  ]);

  const view = conversationView(conversation.toObject(), userId, users, companies);

  return {
    conversation: { ...view, unread: 0 },
    messages: messages.map((message) => messageView(message, userId, users)),
    you: personView(users.get(String(userId))),
    limits: {
      pendingRequestMessageCap: MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP,
      bodyMaxLength: MESSAGING_LIMITS.BODY_MAX_LENGTH,
    },
  };
}

/* ── Writes ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Appends a message to a conversation the caller has already been authorised to write into, and
 * keeps the denormalised fields in step: preview, counts, the other person's unread, and the
 * request state — a recipient who writes back has accepted.
 */
async function appendMessage(conversation, sender, body, context) {
  const otherId = otherParticipantId(conversation, sender._id);
  const startedByMe = same(conversation.startedBy, sender._id);

  const message = await Message.create({
    conversationId: conversation._id,
    senderUserId: sender._id,
    body,
  });

  const update = {
    $set: {
      lastMessageAt: message.createdAt,
      lastMessagePreview: body.slice(0, MESSAGING_LIMITS.PREVIEW_LENGTH),
      lastMessageSenderId: sender._id,
    },
    $inc: { messageCount: 1, 'members.$[them].unread': 1 },
  };

  let status = conversation.status;
  if (!startedByMe && status !== CONVERSATION_STATUS.ACCEPTED) {
    status = CONVERSATION_STATUS.ACCEPTED;
    update.$set.status = status;
    update.$set.respondedAt = message.createdAt;
  }

  await Conversation.updateOne({ _id: conversation._id }, update, {
    arrayFilters: [{ 'them.userId': otherId }],
  });

  recordAuditEvent({
    actorUserId: sender._id,
    actorCompanyId: conversation.origin?.companyId ?? null,
    action: AUDIT_ACTIONS.MESSAGE_SENT,
    targetType: AUDIT_TARGET_TYPES.CONVERSATION,
    targetId: conversation._id,
    /* Never the body. */
    metadata: { length: body.length },
    ...context,
  });

  return {
    conversationId: String(conversation._id),
    status,
    message: {
      id: String(message._id),
      mine: true,
      senderName: sender.name ?? null,
      body: message.body,
      attachments: [],
      sentAt: message.createdAt,
      readAt: null,
    },
  };
}

/** Writes into an existing conversation after every closure rule has had its say. */
async function sendInto(conversation, sender, body, context) {
  assertSenderEligible(sender);

  const reason = closedReasonFor(conversation, sender._id);
  if (reason) throw closedError(reason);

  const otherId = otherParticipantId(conversation, sender._id);
  if (await blockedBetween(sender._id, otherId)) throw closedError(CLOSED_REASONS.BLOCKED);

  await assertSendRate(sender._id);

  return appendMessage(conversation, sender, body, context);
}

/**
 * Whoever the message is for: a person by user id, or a candidate by profile id — the recruiter
 * surfaces know candidates by profile, and it is not their business to learn the account id.
 */
async function resolveRecipient({ recipientUserId, candidateId }) {
  if (candidateId) {
    const profile = await CandidateProfile.findById(candidateId).select('userId').lean();
    if (!profile) throw ApiError.notFound('Candidate not found.');
    const user = await User.findById(profile.userId).lean();
    if (!user) throw ApiError.notFound('Candidate not found.');
    return user;
  }

  const user = await User.findById(recipientUserId).lean();
  if (!user) throw ApiError.notFound('That person cannot be messaged.');
  return user;
}

/**
 * Starts a conversation with someone — or, if the two of you already have one, continues it.
 *
 * Idempotent on the PAIR: a second "Message" from a search result, or from the other direction,
 * lands in the same thread. That is the whole point of keying on people rather than on context.
 *
 * @param {object} sender  The signed-in user document (lean)
 * @param {object} input   { recipientUserId | candidateId, companyId?, interestId?, body }
 * @param {object} [context]  { ip, userAgent } for the audit record
 */
export async function startConversation(sender, input, context = {}) {
  assertSenderEligible(sender);

  const recipient = await resolveRecipient(input);
  if (same(recipient._id, sender._id)) {
    throw ApiError.validation('You cannot message yourself.', {
      recipientUserId: 'Choose someone else.',
    });
  }
  assertRecipientEligible(recipient);

  const pairKey = pairKeyFor(sender._id, recipient._id);

  const existing = await Conversation.findOne({ pairKey });
  if (existing) {
    return { ...(await sendInto(existing, sender, input.body, context)), created: false };
  }

  const origin = await resolveOrigin({ sender, recipient, companyId: input.companyId });

  /* A NEW conversation with someone who has blocked you (or whom you blocked) does not exist. */
  if (await blockedBetween(sender._id, recipient._id)) {
    throw ApiError.notFound('That person cannot be messaged.');
  }

  await assertNewConversationAllowance(sender._id);
  await assertSendRate(sender._id);

  let conversation;
  try {
    conversation = await Conversation.create({
      participants: sortedPair(sender._id, recipient._id),
      pairKey,
      startedBy: sender._id,
      status: CONVERSATION_STATUS.PENDING,
      origin: { ...origin, interestId: input.interestId ?? null },
      members: [{ userId: sender._id }, { userId: recipient._id }],
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;

    /* Two first messages crossed in flight — the other one won; continue it. */
    const raced = await Conversation.findOne({ pairKey });
    if (raced) return { ...(await sendInto(raced, sender, input.body, context)), created: false };

    /*
     * A duplicate key with no pair to blame means the collection still carries a pre-ADR-025
     * unique index, under which every new document keys as (null, null, null). Say so plainly:
     * the fix is operational, not a retry.
     */
    throw ApiError.internal(
      'Messaging is temporarily unavailable. The conversations collection needs the ADR-025 migration.',
      error,
    );
  }

  recordAuditEvent({
    actorUserId: sender._id,
    actorCompanyId: origin.companyId ?? null,
    action: AUDIT_ACTIONS.CONVERSATION_STARTED,
    targetType: AUDIT_TARGET_TYPES.CONVERSATION,
    targetId: conversation._id,
    metadata: { via: input.companyId ? 'company' : 'public_team' },
    ...context,
  });

  return { ...(await appendMessage(conversation, sender, input.body, context)), created: true };
}

/** Sends into a conversation I am part of. */
export async function sendMessage(sender, conversationId, body, context = {}) {
  const conversation = await ownedConversation(sender._id, conversationId);
  return sendInto(conversation, sender, body, context);
}

/**
 * PRD §11.2 — accept or decline a request. Only the person who RECEIVED it can answer; the
 * starter made their choice by writing.
 *
 * Declining is not deletion: the messages remain, because they are the record a moderation or
 * audit review would need (§16.3). It closes the thread to the starter and mutes it for the
 * decliner, who can reopen it later by accepting or simply writing back.
 */
export async function respondToRequest(userId, conversationId, accepted) {
  const conversation = await ownedConversation(userId, conversationId);

  if (same(conversation.startedBy, userId)) {
    throw ApiError.validation('You started this conversation; only the other person can accept or decline it.');
  }

  conversation.status = accepted ? CONVERSATION_STATUS.ACCEPTED : CONVERSATION_STATUS.DECLINED;
  conversation.respondedAt = new Date();

  const mine = conversation.members.find((member) => same(member.userId, userId));
  if (!accepted && mine && !mine.mutedAt) mine.mutedAt = new Date();

  await conversation.save();

  return { status: conversation.status, muted: Boolean(mine?.mutedAt) };
}

/** PRD §11.2 — mute. Idempotent, per person; the thread stays fully readable. */
export async function setConversationMuted(userId, conversationId, muted) {
  const conversation = await ownedConversation(userId, conversationId);

  const mine = conversation.members.find((member) => same(member.userId, userId));
  if (mine) mine.mutedAt = muted ? (mine.mutedAt ?? new Date()) : null;
  await conversation.save();

  return { muted: Boolean(mine?.mutedAt) };
}

/**
 * PRD §8.2 "safety/reporting". Flags the thread for moderation and closes it to the other person;
 * nothing is deleted, because the content is the evidence (§16.3).
 */
export async function reportConversation(userId, conversationId, reason) {
  const conversation = await ownedConversation(userId, conversationId);

  conversation.reportedAt = new Date();
  conversation.reportedBy = userId;
  conversation.reportReason = reason;
  await conversation.save();

  return { reported: true };
}

/* ── Export ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * My conversations for the SET-01 data export (PRD §16.1).
 *
 * The other person is not named. Putting a third party's name into a file the exporter downloads,
 * keeps and may forward is a privacy decision about that person, not an export-formatting choice
 * (ADR-024 recorded the same reasoning); the company context is enough to identify the thread.
 */
export async function exportConversationsForUser(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ createdAt: 1 })
    .lean();
  if (conversations.length === 0) return [];

  const [messages, companies] = await Promise.all([
    Message.find({ conversationId: { $in: conversations.map((c) => c._id) } })
      .sort({ createdAt: 1 })
      .lean(),
    companiesById(conversations.map((c) => c.origin?.companyId)),
  ]);

  return conversations.map((conversation) => {
    const company = companies.get(String(conversation.origin?.companyId ?? ''));
    return {
      company: company?.name ?? null,
      slug: company?.slug ?? null,
      startedAt: conversation.createdAt,
      startedByMe: same(conversation.startedBy, userId),
      status: conversation.status,
      messages: messages
        .filter((message) => same(message.conversationId, conversation._id))
        .map((message) => ({
          from: same(message.senderUserId, userId) ? 'me' : 'them',
          body: message.body,
          sentAt: message.createdAt,
        })),
    };
  });
}
