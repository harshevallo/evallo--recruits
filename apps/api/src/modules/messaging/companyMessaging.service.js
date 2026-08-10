/**
 * REC-15 messaging — company side (PRD §7.6, §11.2).
 *
 * The mirror of `messaging.service.js`. The same `conversations` and `messages` rows, read from the
 * other end: unread counts, read receipts and acceptance state are all per side, so nothing here
 * touches the candidate's.
 *
 * A conversation is between a candidate and a COMPANY, never two users (05_DATABASE_SCHEMA §9), so
 * any member with the permission inherits the thread — PRD §21.6 requires a departing recruiter's
 * replacement to pick it up rather than the thread being orphaned.
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

/** The company's thread list, newest activity first. */
export async function listCompanyConversations(companyId) {
  const conversations = await Conversation.find({ companyId })
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
        candidateState: conversation.candidateState ?? CANDIDATE_CONVERSATION_STATES.PENDING,
        reported: Boolean(conversation.reportedAt),
        createdAt: conversation.createdAt,
      };
    }),
  );

  const list = rows.filter(Boolean);
  return { conversations: list, unreadTotal: list.reduce((sum, row) => sum + row.unread, 0) };
}

/** Loads a thread belonging to this company, or fails. Ownership is checked here, not upstream. */
async function companyConversation(companyId, conversationId) {
  const conversation = await Conversation.findOne({ _id: conversationId, companyId });
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  return conversation;
}

/**
 * A thread and its messages. Opening it clears the COMPANY's unread count and stamps `readAt` on
 * the candidate's messages — never on the company's own.
 */
export async function getCompanyConversation(companyId, conversationId) {
  const conversation = await companyConversation(companyId, conversationId);

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
 * Sends a message, opening the thread if this is the first one.
 *
 * Upsert-shaped because 05_DATABASE_SCHEMA §9 makes `{ candidateId, companyId }` unique: a second
 * "start conversation" must continue the existing thread rather than fail or fork it.
 */
export async function sendCompanyMessage(companyId, actorUserId, { candidateId, body, interestId }) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) throw ApiError.notFound('Candidate not found.');

  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  let conversation = await Conversation.findOne({ candidateId, companyId });

  if (!conversation) {
    conversation = await Conversation.create({
      candidateId,
      companyId,
      interestId: interestId ?? null,
    });
  }

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

/** Replies inside a thread the company already has. */
export async function replyAsCompany(companyId, actorUserId, conversationId, body) {
  const conversation = await companyConversation(companyId, conversationId);
  return sendCompanyMessage(companyId, actorUserId, {
    candidateId: conversation.candidateId,
    body,
  });
}
