/**
 * conversations — CAN-09 (PRD §8.2, §11.2).
 *
 * A conversation is always between a CANDIDATE and a COMPANY, never two users: the company side
 * is a context, so a recruiter leaving does not orphan the thread and their replacement inherits
 * it (PRD §21.6). Messages live in their own collection because a thread grows unboundedly and an
 * embedded array would rewrite the whole document on every reply.
 *
 * ADR-024 reverses that first sentence — threads become candidate-to-one-employee — and corrects
 * its citation: §21.6 actually mandates a departing recruiter's *immediate loss* of message access,
 * not inheritance. Only `recruiterUserId` below has landed so far; the behaviour is unchanged.
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
    /**
     * The employee who owns this thread — ADR-024 step 1. **Nothing reads this yet.**
     *
     * Reserved, deliberately inert. ADR-024 moves messaging from one thread per
     * `{ candidateId, companyId }` to one per candidate-and-individual-employee, and the field has
     * to exist before the unique index can include it: an index built over a field no document
     * carries is the one ordering of that migration that cannot work.
     *
     * `null` means "shared company thread", which is every conversation today and every conversation
     * written before the behaviour change ships. That is why it is nullable rather than required —
     * 8 live threads predate it, and 2 of them have no determinable owner, so there is no backfill
     * to write. Legacy threads keep reading and replying exactly as they do now.
     */
    recruiterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** What started the thread. Today always an expression of interest. */
    interestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpressionOfInterest' },

    lastMessageAt: Date,
    lastMessagePreview: { type: String, maxlength: 200 },

    /**
     * Who wrote the last message, denormalised alongside the preview it belongs to.
     *
     * The candidate is talking to a PERSON at a company (PRD §11.2), and several recruiters can
     * share one thread, so the thread list has to be able to name them. Denormalised for the same
     * reason `lastMessagePreview` is: rendering a list of threads must not cost one query per row.
     *
     * Null on threads written before this existed, and on candidate-authored last messages — the
     * candidate does not need their own name read back to them.
     */
    lastMessageSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageSenderType: { type: String, default: null },

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

/**
 * One thread per candidate per company **per employee** — ADR-024 step 2.
 *
 * Was `{ candidateId, companyId }`. The third key is what will let Employee A and Employee B hold
 * separate threads with the same candidate; until step 3 writes a non-null `recruiterUserId`,
 * nothing can create that combination and the behaviour is identical to before.
 *
 * **Legacy threads are still protected.** MongoDB indexes a missing path and an explicit `null` as
 * the same value, so the 7 existing shared threads — some of which lack the path entirely — all key
 * as `(candidate, company, null)`. A second shared thread for one pair is still rejected, which is
 * the whole of the old index's guarantee.
 *
 * Widening a unique index is strictly permissive: every document legal under the two-key index is
 * legal under this one. That is why step 2 cannot fail on existing data, and why the migration
 * creates this index BEFORE dropping the old one rather than after.
 *
 * Mongoose does not drop indexes it no longer declares, and this project never calls
 * `syncIndexes()`. Editing this line alone would therefore leave the old two-key unique index in
 * place, silently forbidding the per-person threads step 3 exists to create. The drop lives in
 * `scripts/migrate-conversation-indexes.mjs` and must be run against every database.
 */
conversationSchema.index({ candidateId: 1, companyId: 1, recruiterUserId: 1 }, { unique: true });
conversationSchema.index({ candidateId: 1, lastMessageAt: -1 });
conversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
