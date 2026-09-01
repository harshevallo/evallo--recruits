/**
 * REC-15 messaging — company side (PRD §7.6, §11.2).
 *
 * The mirror of `messaging.service.js`. The same `conversations` and `messages` rows, read from the
 * other end: unread counts, read receipts and acceptance state are all per side, so nothing here
 * touches the candidate's.
 *
 * ── Threads belong to a PERSON, not the company — ADR-024 step 3 ──────────────────────────────
 *
 * A thread is between the candidate and one employee. Two colleagues messaging the same candidate
 * open two separate threads, and neither can read the other's. `recruiterUserId` is the owner;
 * `null` means a legacy shared thread, from before this existed, which every member may still read
 * and reply to because it genuinely was shared.
 *
 * Two rules that are easy to get subtly wrong, and are load-bearing:
 *
 *   1. **A colleague's thread is reported as ABSENT, not forbidden.** A 403 would confirm that a
 *      named candidate is in conversation with a named teammate, which is the privacy this step
 *      exists to create.
 *   2. **Replying to a legacy shared thread does not adopt it.** `replyAsCompany` continues the
 *      thread it resolved, in place, and never re-derives one from the candidate id — otherwise a
 *      reply would miss the shared thread (whose owner is null, not the sender) and silently fork a
 *      second one, while the team quietly lost sight of a thread they used to share.
 *
 * Opening a thread is how a company starts contact, so this is also where PRD §11.2's "a first
 * message to a merely-discoverable candidate clearly identifies the company and role context" is
 * enforced: the opener carries the company name and, when there is one, the role it is about.
 */

import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { resolveCandidateAccess } from '../candidates/candidateAccess.service.js';
import { User } from '../users/user.model.js';
import { Conversation, CANDIDATE_CONVERSATION_STATES } from './conversation.model.js';
import { Message, MESSAGE_SENDERS } from './message.model.js';

/** The candidate identity a recruiter sees on a thread — name and headline only. */
async function candidateSummary(candidateId, companyId) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) return null;

  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) return null;

  const user = await User.findById(profile.userId).select('name profilePicture').lean();

  return {
    id: String(profile._id),
    name: user?.name ?? null,
    headline: profile.headline ?? null,
    photoUrl: user?.profilePicture ?? null,
  };
}

/**
 * The threads one member may touch: their own, plus every legacy shared thread.
 *
 * `recruiterUserId: null` also matches documents written before the field existed — MongoDB treats
 * a missing path and an explicit null as the same value — so no backfill is needed for legacy rows
 * to keep behaving as they always have.
 */
function visibleToMember(actorUserId) {
  return { $or: [{ recruiterUserId: null }, { recruiterUserId: actorUserId }] };
}

/** This member's thread list, newest activity first. */
export async function listCompanyConversations(companyId, actorUserId) {
  const conversations = await Conversation.find({ companyId, ...visibleToMember(actorUserId) })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  const rows = await Promise.all(
    conversations.map(async (conversation) => {
      const candidate = await candidateSummary(conversation.candidateId, companyId);
      // A candidate who has withdrawn visibility drops off the list rather than leaking a name.
      if (!candidate) return null;

      return {
        id: String(conversation._id),
        candidate,
        lastMessageAt: conversation.lastMessageAt ?? null,
        lastMessagePreview: conversation.lastMessagePreview ?? null,
        /** Which side wrote last, so the list can show "You:" vs the candidate's name. */
        lastMessageFromCompany:
          conversation.lastMessageSenderType === MESSAGE_SENDERS.COMPANY ? true : false,
        unread: conversation.companyUnread ?? 0,
        /**
         * A legacy thread with no owner, which the whole team can still read (ADR-024).
         *
         * Surfaced because the difference is invisible otherwise: a recruiter should know which of
         * their threads a colleague can also see, and not assume the new privacy applies to one
         * that predates it.
         */
        shared: conversation.recruiterUserId == null,
        candidateState: conversation.candidateState ?? CANDIDATE_CONVERSATION_STATES.PENDING,
        reported: Boolean(conversation.reportedAt),
        createdAt: conversation.createdAt,
      };
    }),
  );

  const list = rows.filter(Boolean);
  return { conversations: list, unreadTotal: list.reduce((sum, row) => sum + row.unread, 0) };
}

/**
 * Loads a thread this member may touch, or fails. Ownership is checked here, not upstream.
 *
 * A thread owned by a colleague produces the same 404 as one that does not exist. That is
 * deliberate: distinguishing them would tell a recruiter that a named candidate is talking to a
 * named teammate, which is exactly what a private thread must not reveal.
 */
async function companyConversation(companyId, conversationId, actorUserId) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    companyId,
    ...visibleToMember(actorUserId),
  });
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  return conversation;
}

/**
 * A thread and its messages. Opening it clears the COMPANY's unread count and stamps `readAt` on
 * the candidate's messages — never on the company's own.
 */
export async function getCompanyConversation(companyId, conversationId, actorUserId) {
  const conversation = await companyConversation(companyId, conversationId, actorUserId);

  const candidate = await candidateSummary(conversation.candidateId, companyId);
  if (!candidate) throw ApiError.notFound('Conversation not found.');

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .lean();

  if ((conversation.companyUnread ?? 0) > 0) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { companyUnread: 0 } });
  }

  await Message.updateMany(
    { conversationId: conversation._id, senderType: MESSAGE_SENDERS.CANDIDATE, readAt: null },
    { $set: { readAt: new Date() } },
  );

  /* Which teammate wrote each message. One query for the thread, not one per message. */
  const teammateIds = [
    ...new Set(
      messages
        .filter((message) => message.senderType === MESSAGE_SENDERS.COMPANY && message.senderUserId)
        .map((message) => String(message.senderUserId)),
    ),
  ];

  const teammates = teammateIds.length
    ? await User.find({ _id: { $in: teammateIds } }).select('name').lean()
    : [];
  const senderById = new Map(teammates.map((user) => [String(user._id), user]));

  return {
    conversation: {
      id: String(conversation._id),
      candidate,
      candidateState: conversation.candidateState ?? CANDIDATE_CONVERSATION_STATES.PENDING,
      reported: Boolean(conversation.reportedAt),
      /** Declining closes the thread to the candidate; the company should see why replies stopped. */
      candidateRespondedAt: conversation.candidateRespondedAt ?? null,
      createdAt: conversation.createdAt,
    },
    messages: messages.map((message) => {
      const fromCompany = message.senderType === MESSAGE_SENDERS.COMPANY;
      return {
        id: String(message._id),
        /*
         * `mine` is "my company's", not "my user's" — the thread belongs to the company, so a
         * teammate's message is still on our side of the conversation. `senderName` is what
         * distinguishes which teammate, which matters precisely because the thread is shared.
         */
        mine: fromCompany,
        senderName: fromCompany
          ? (senderById.get(String(message.senderUserId))?.name ?? null)
          : candidate.name,
        body: message.body,
        attachments: [],
        sentAt: message.createdAt,
        readAt: message.readAt ?? null,
      };
    }),
  };
}

/**
 * Appends a message to a thread already resolved and authorized by the caller.
 *
 * Split out so replying never re-derives the thread from the candidate id. `recruiterUserId` is
 * deliberately not written here: a legacy shared thread stays shared no matter who replies.
 */
async function appendCompanyMessage(conversation, actorUserId, body) {
  if (conversation.reportedAt) {
    throw ApiError.forbidden('This conversation has been reported and is closed to new messages.');
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderType: MESSAGE_SENDERS.COMPANY,
    senderUserId: actorUserId,
    body,
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: body.slice(0, 200),
        lastMessageSenderId: actorUserId,
        lastMessageSenderType: MESSAGE_SENDERS.COMPANY,
      },
      $inc: { candidateUnread: 1 },
    },
  );

  return {
    conversationId: String(conversation._id),
    message: {
      id: String(message._id),
      mine: true,
      body: message.body,
      attachments: [],
      sentAt: message.createdAt,
      readAt: null,
    },
  };
}

/**
 * Sends a message, opening the thread if this sender has not written to this candidate before.
 *
 * Keyed on the SENDER as well as the candidate and company (ADR-024), so two colleagues messaging
 * one candidate get one thread each rather than sharing.
 *
 * A legacy shared thread is deliberately not matched here. Adopting it — quietly stamping the
 * first replier as its owner — would privatise, with no consent and no undo, a thread the whole
 * team could previously read. Continuing one is done through `replyAsCompany`, from the thread
 * itself.
 */
export async function sendCompanyMessage(companyId, actorUserId, { candidateId, body, interestId }) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) throw ApiError.notFound('Candidate not found.');

  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  let conversation = await Conversation.findOne({
    candidateId,
    companyId,
    recruiterUserId: actorUserId,
  });

  if (!conversation) {
    conversation = await Conversation.create({
      candidateId,
      companyId,
      recruiterUserId: actorUserId,
      interestId: interestId ?? null,
    });
  }

  return appendCompanyMessage(conversation, actorUserId, body);
}

/**
 * Replies inside a thread this member may touch.
 *
 * Continues the resolved thread in place. It must NOT route through `sendCompanyMessage`: that
 * looks a thread up by sender, so replying to a shared thread (owner `null`) would miss it and
 * silently open a second one.
 */
export async function replyAsCompany(companyId, actorUserId, conversationId, body) {
  const conversation = await companyConversation(companyId, conversationId, actorUserId);
  return appendCompanyMessage(conversation, actorUserId, body);
}
