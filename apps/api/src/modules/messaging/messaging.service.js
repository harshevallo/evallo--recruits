/**
 * CAN-09 messaging — candidate side (PRD §8.2, §11.2).
 *
 * A candidate may only ever reply within a thread a company started, and only where an active
 * access grant exists. That is not a UI convenience: unsolicited candidate-to-company messaging
 * would make the platform a cold-outreach channel, which PRD §11.2 does not describe and §16
 * would treat as a safety problem.
 */

import { ApiError } from '../../lib/ApiError.js';
import { Company, companyInitials } from '../companies/company.model.js';
import { User } from '../users/user.model.js';
import { Conversation, CANDIDATE_CONVERSATION_STATES } from './conversation.model.js';
import { Message, MESSAGE_SENDERS } from './message.model.js';

/** PRD §8.2 CAN-09 — the thread list. Empty until a company opens one (REC-15). */
export async function listConversations(profile) {
  const conversations = await Conversation.find({ candidateId: profile._id })
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  if (conversations.length === 0) return [];

  const companies = await Company.find({
    _id: { $in: conversations.map((c) => c.companyId) },
  })
    .select('name slug logoUrl')
    .lean();

  const companyById = new Map(companies.map((c) => [String(c._id), c]));

  /*
   * Who wrote last, by name.
   *
   * A candidate is talking to a PERSON at a company, not to the company itself — and several
   * recruiters may share one thread, so "Company XYZ" alone leaves them unable to tell who they are
   * replying to. Name only: the recruiter's email is never exposed here, and the company context is
   * kept alongside rather than replaced.
   */
  const senderIds = [
    ...new Set(
      [
        ...conversations
          .filter(
            (c) => c.lastMessageSenderType === MESSAGE_SENDERS.COMPANY && c.lastMessageSenderId,
          )
          .map((c) => String(c.lastMessageSenderId)),

        /*
         * The thread's OWNER, resolved in the same query — ADR-024.
         *
         * `lastMessageFrom` cannot title a thread: it is null whenever the candidate wrote last, so
         * the heading would flip between a person's name and nothing as the conversation went back
         * and forth. `recruiterUserId` does not move, which is what makes a stable title possible.
         */
        ...conversations.filter((c) => c.recruiterUserId).map((c) => String(c.recruiterUserId)),
      ],
    ),
  ];

  const senders = senderIds.length
    ? await User.find({ _id: { $in: senderIds } }).select('name').lean()
    : [];
  const senderById = new Map(senders.map((user) => [String(user._id), user]));

  return conversations.map((conversation) => {
    const company = companyById.get(String(conversation.companyId));
    const lastSender =
      conversation.lastMessageSenderType === MESSAGE_SENDERS.COMPANY
        ? senderById.get(String(conversation.lastMessageSenderId))
        : null;

    return {
      id: String(conversation.id ?? conversation._id),
      company: company
        ? {
            name: company.name,
            slug: company.slug,
            logoUrl: company.logoUrl ?? null,
            initials: companyInitials(company.name),
          }
        : null,
      /**
       * The person this thread is with — the title the candidate reads (ADR-024).
       *
       * Null on legacy shared threads, which have no one owner. The UI falls back to the company
       * name there rather than inventing a person, so an old thread stays honest about having been
       * a conversation with a company.
       */
      recruiter: conversation.recruiterUserId
        ? { name: senderById.get(String(conversation.recruiterUserId))?.name ?? null }
        : null,

      /** The individual recruiter who wrote last, when that was the company side. */
      lastMessageFrom: lastSender?.name ?? null,
      lastMessageAt: conversation.lastMessageAt ?? null,
      lastMessagePreview: conversation.lastMessagePreview ?? null,
      unread: conversation.candidateUnread ?? 0,
      state: conversation.candidateState ?? CANDIDATE_CONVERSATION_STATES.PENDING,
      muted: Boolean(conversation.mutedAt),
      reported: Boolean(conversation.reportedAt),
    };
  });
}

/** Loads a thread the caller owns, or fails. Ownership is checked here, never in a controller. */
async function ownedConversation(profile, conversationId) {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    candidateId: profile._id,
  });

  if (!conversation) throw ApiError.notFound('Conversation not found.');
  return conversation;
}

/**
 * A thread and its messages. Opening it clears the candidate's unread count and stamps `readAt`
 * on the company's messages — the read receipt is per side, so this never touches the company's.
 */
export async function getConversation(profile, conversationId) {
  const conversation = await ownedConversation(profile, conversationId);

  const [company, messages] = await Promise.all([
    Company.findById(conversation.companyId).select('name slug logoUrl').lean(),
    Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 }).lean(),
  ]);

  if (conversation.candidateUnread > 0) {
    await Promise.all([
      Conversation.updateOne({ _id: conversation._id }, { $set: { candidateUnread: 0 } }),
      Message.updateMany(
        {
          conversationId: conversation._id,
          senderType: MESSAGE_SENDERS.COMPANY,
          readAt: null,
        },
        { $set: { readAt: new Date() } },
      ),
    ]);
  }

  /*
   * The recruiters who wrote in this thread, by name.
   *
   * A candidate is corresponding with people, and several recruiters at one company can share a
   * thread, so each company message carries the name of whoever sent it. NAME ONLY — no id and no
   * email: the candidate needs to know who they are talking to, not how to reach them outside the
   * platform, which stays governed by their own contact rules.
   */
  const companySenderIds = [
    ...new Set(
      [
        ...messages
          .filter(
            (message) => message.senderType === MESSAGE_SENDERS.COMPANY && message.senderUserId,
          )
          .map((message) => String(message.senderUserId)),

        /* The owner, so the heading names the person even before they have written (ADR-024). */
        ...(conversation.recruiterUserId ? [String(conversation.recruiterUserId)] : []),
      ],
    ),
  ];

  const senders = companySenderIds.length
    ? await User.find({ _id: { $in: companySenderIds } }).select('name').lean()
    : [];
  const senderById = new Map(senders.map((user) => [String(user._id), user]));

  return {
    id: String(conversation._id),
    company: company
      ? {
          name: company.name,
          slug: company.slug,
          logoUrl: company.logoUrl ?? null,
          initials: companyInitials(company.name),
        }
      : null,

    /** The person this thread is with; null on a legacy shared thread (ADR-024). */
    recruiter: conversation.recruiterUserId
      ? { name: senderById.get(String(conversation.recruiterUserId))?.name ?? null }
      : null,

    state: conversation.candidateState ?? CANDIDATE_CONVERSATION_STATES.PENDING,
    muted: Boolean(conversation.mutedAt),
    reported: Boolean(conversation.reportedAt),
    messages: messages.map((message) => {
      const fromCompany = message.senderType === MESSAGE_SENDERS.COMPANY;
      return {
        id: String(message._id),
        mine: message.senderType === MESSAGE_SENDERS.CANDIDATE,
        /** The individual who wrote it, when it came from the company side. */
        senderName: fromCompany
          ? (senderById.get(String(message.senderUserId))?.name ?? null)
          : null,
        body: message.body,
        attachments: message.attachments ?? [],
        sentAt: message.createdAt,
      };
    }),
  };
}

/**
 * PRD §11.2 — accept or decline a company-initiated conversation.
 *
 * Declining is not deletion: the thread and its messages remain, because they are the record a
 * moderation or audit review would need (§16.3). It simply stops the candidate being drawn back
 * into a conversation they have ended.
 */
export async function respondToConversation(profile, conversationId, accepted) {
  const conversation = await ownedConversation(profile, conversationId);

  conversation.candidateState = accepted
    ? CANDIDATE_CONVERSATION_STATES.ACCEPTED
    : CANDIDATE_CONVERSATION_STATES.DECLINED;
  conversation.candidateRespondedAt = new Date();

  // Declining implies the candidate does not want further prompting about it.
  if (!accepted && !conversation.mutedAt) conversation.mutedAt = new Date();

  await conversation.save();

  return { state: conversation.candidateState, muted: Boolean(conversation.mutedAt) };
}

/**
 * PRD §11.2 — mute. Idempotent toggle; a muted thread stays fully readable and only stops
 * generating notifications, so nothing is hidden from the candidate.
 */
export async function setConversationMuted(profile, conversationId, muted) {
  const conversation = await ownedConversation(profile, conversationId);

  conversation.mutedAt = muted ? (conversation.mutedAt ?? new Date()) : null;
  await conversation.save();

  return { muted: Boolean(conversation.mutedAt) };
}

/** Replies within an existing thread. Starting one is the company's action, not the candidate's. */
export async function replyToConversation(profile, user, conversationId, body) {
  const conversation = await ownedConversation(profile, conversationId);

  // A declined conversation is closed to further candidate replies (PRD §11.2).
  if (conversation.candidateState === CANDIDATE_CONVERSATION_STATES.DECLINED) {
    throw ApiError.validation('You declined this conversation.', {
      body: 'Accept it again before replying.',
    });
  }

  /*
   * Replying is itself acceptance — asking someone to click "accept" before a message they have
   * already written would be ceremony, and PRD §11.2 only requires that the choice exist.
   */
  if (conversation.candidateState === CANDIDATE_CONVERSATION_STATES.PENDING) {
    conversation.candidateState = CANDIDATE_CONVERSATION_STATES.ACCEPTED;
    conversation.candidateRespondedAt = new Date();
    await conversation.save();
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderType: MESSAGE_SENDERS.CANDIDATE,
    senderUserId: user._id,
    body,
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: body.slice(0, 200),
        lastMessageSenderId: user._id,
        lastMessageSenderType: MESSAGE_SENDERS.CANDIDATE,
      },
      $inc: { companyUnread: 1 },
    },
  );

  return {
    id: String(message._id),
    mine: true,
    body: message.body,
    attachments: [],
    sentAt: message.createdAt,
  };
}

/**
 * PRD §8.2 CAN-09 "safety/reporting".
 *
 * Reporting flags the thread for moderation; it does not delete it, because the content is the
 * evidence (PRD §16.3). Blocking the company outright is a separate CAN-04 control.
 */
export async function reportConversation(profile, conversationId, reason) {
  const conversation = await ownedConversation(profile, conversationId);

  conversation.reportedAt = new Date();
  conversation.reportReason = reason;
  await conversation.save();

  return { reported: true };
}
