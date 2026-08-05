/**
 * conversations — CAN-09 (PRD §8.2, §11.2).
 *
 * A conversation is always between a CANDIDATE and a COMPANY, never two users: the company side
 * is a context, so a recruiter leaving does not orphan the thread and their replacement inherits
 * it (PRD §21.6). Messages live in their own collection because a thread grows unboundedly and an
 * embedded array would rewrite the whole document on every reply.
 *
 * Internal recruiter notes are deliberately NOT here — they belong in a separate collection so
 * leaking one into a candidate-visible payload is structurally impossible rather than one
 * serialisation bug away.
 */

import mongoose from 'mongoose';

/** PRD §11.2 candidate-side conversation states. */
export const CANDIDATE_CONVERSATION_STATES = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
});

const conversationSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    /** What started the thread. Today always an expression of interest. */
    interestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpressionOfInterest' },

    lastMessageAt: Date,
    lastMessagePreview: { type: String, maxlength: 200 },

    /** Unread counts are per side, so one party's read state never affects the other's. */
    candidateUnread: { type: Number, default: 0 },
    companyUnread: { type: Number, default: 0 },

    /**
     * PRD §11.2 — "Candidates can accept, decline, mute, report, or block a company conversation."
     *
     * `pending` until the candidate responds to a company-initiated thread. Declining closes the
     * thread to further candidate replies without deleting it, because the content is a record.
     */
    candidateState: {
      type: String,
      enum: Object.values(CANDIDATE_CONVERSATION_STATES),
      default: CANDIDATE_CONVERSATION_STATES.PENDING,
    },
    candidateRespondedAt: Date,

    /** Muted threads stay readable; they simply stop generating notifications (PRD §15). */
    mutedAt: Date,

    /** PRD §8.2 CAN-09 — "safety/reporting". */
    reportedAt: Date,
    reportReason: { type: String, maxlength: 500 },
  },
  { timestamps: true, collection: 'conversations' },
);

/** One thread per candidate per company — a reply continues it rather than starting another. */
conversationSchema.index({ candidateId: 1, companyId: 1 }, { unique: true });
conversationSchema.index({ candidateId: 1, lastMessageAt: -1 });
conversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
