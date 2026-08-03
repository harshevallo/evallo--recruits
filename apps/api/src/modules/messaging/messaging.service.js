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
import { Conversation } from './conversation.model.js';
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

  return conversations.map((conversation) => {
    const company = companyById.get(String(conversation.companyId));
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
      lastMessageAt: conversation.lastMessageAt ?? null,
      lastMessagePreview: conversation.lastMessagePreview ?? null,
      unread: conversation.candidateUnread ?? 0,
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
    reported: Boolean(conversation.reportedAt),
    messages: messages.map((message) => ({
      id: String(message._id),
      /** `mine` rather than a raw sender id — the client never needs to know who replied. */
      mine: message.senderType === MESSAGE_SENDERS.CANDIDATE,
      body: message.body,
      attachments: message.attachments ?? [],
      sentAt: message.createdAt,
    })),
  };
}

/** Replies within an existing thread. Starting one is the company's action, not the candidate's. */
export async function replyToConversation(profile, user, conversationId, body) {
  const conversation = await ownedConversation(profile, conversationId);

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
