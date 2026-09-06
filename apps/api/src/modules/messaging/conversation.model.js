/**
 * conversations — one private chat between exactly two people (PRD §11.2; ADR-025).
 *
 * ── The one rule ──────────────────────────────────────────────────────────────────────────────
 *
 * A conversation has TWO participants, both of them user accounts. Not a candidate and a company;
 * not a candidate and "whoever at the company answers". Two people — the same way a LinkedIn
 * message is between you and one other person, whichever employer either of you has today.
 *
 * That is why the key is the PAIR of user ids and nothing else. Two colleagues who each message
 * the same candidate hold two separate conversations, and neither can read the other's. A recruiter
 * who changes company keeps their own chats, because the chats were never the company's. The
 * company a conversation started through is recorded in `origin` as CONTEXT — "Ana, at Acme" — and
 * never as an owner or a reader.
 *
 * This supersedes the company-scoped thread (one per `{ candidateId, companyId }`) and the
 * per-employee thread ADR-024 layered onto it (`recruiterUserId`). Both encoded the company in the
 * key, and both were rejected on the call of 5 Sep 2026: "Chat is one to one. Two people should be
 * part of the same chat, not three."
 *
 * Messages live in their own collection because a thread grows unboundedly and an embedded array
 * would rewrite the whole document on every reply. Internal recruiter notes are deliberately NOT
 * here — they belong in a separate collection so leaking one into a candidate-visible payload is
 * structurally impossible rather than one serialisation bug away.
 *
 * ── Legacy rows ───────────────────────────────────────────────────────────────────────────────
 *
 * Documents written under the old shapes carry `candidateId` / `companyId` / `recruiterUserId` and
 * no `participants`. `scripts/migrate-conversations-to-direct.mjs` rewrites the ones whose two
 * people can be determined and marks the rest `legacy.unmigrated`. Nothing in this module queries
 * by a legacy field — and it must not: `strictQuery` is on, so a filter on a path this schema no
 * longer declares is silently dropped, and `find({ candidateId })` would become `find({})`.
 */

import mongoose from 'mongoose';
import { CONVERSATION_STATUS, MESSAGING_LIMITS } from '@evallo/shared';

export { CONVERSATION_STATUS };

/**
 * The two participants in a canonical order, so the same pair always produces the same key
 * whichever side started the conversation.
 */
export function sortedPair(a, b) {
  return [String(a), String(b)].sort();
}

/** `"<lower id>:<higher id>"` — the uniqueness key for a pair of people. */
export function pairKeyFor(a, b) {
  return sortedPair(a, b).join(':');
}

/**
 * One participant's own view of the conversation — theirs alone, never the other side's.
 *
 * Unread counts, mute and read position are PER PERSON: opening a thread clears my count and
 * nobody else's. There are always exactly two of these, one per participant.
 */
const memberStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    unread: { type: Number, default: 0, min: 0 },
    /** Muted threads stay fully readable; they only stop generating notifications (PRD §15). */
    mutedAt: { type: Date, default: null },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    /** Exactly two distinct user ids, stored in `sortedPair` order. */
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (value) =>
          Array.isArray(value) && value.length === 2 && String(value[0]) !== String(value[1]),
        message: 'A conversation is between exactly two different people.',
      },
    },

    /** `pairKeyFor(participants)`. Unique, so a pair of people can only ever hold one thread. */
    pairKey: { type: String, required: true },

    /** Who sent the first message. The other participant is the one whose answer `status` records. */
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /**
     * PRD §11.2 — "accept, decline, mute, report". The RECIPIENT's answer to a request.
     *
     * `pending` until they reply, accept or decline. Declining closes the thread to the starter
     * without deleting anything, because the content is a record (§16.3). Replying accepts.
     */
    status: {
      type: String,
      enum: Object.values(CONVERSATION_STATUS),
      default: CONVERSATION_STATUS.PENDING,
    },
    respondedAt: Date,

    /**
     * How the conversation began — context, never authority.
     *
     * A recruiter writing from talent search is writing as a person at a company about a role, and
     * PRD §11.2 requires that first message to identify the company. Recording the company lets
     * both inboxes show "Ana · Acme Tutoring" for as long as the thread lives, even after Ana moves
     * on. It grants Acme nothing: no colleague, owner or admin can read this thread through it.
     */
    origin: {
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateProfile', default: null },
      interestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExpressionOfInterest',
        default: null,
      },
    },

    members: {
      type: [memberStateSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: 'A conversation carries state for exactly two participants.',
      },
    },

    /* Denormalised so an inbox renders without one query per row. */
    lastMessageAt: Date,
    lastMessagePreview: { type: String, maxlength: MESSAGING_LIMITS.PREVIEW_LENGTH },
    lastMessageSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    messageCount: { type: Number, default: 0 },

    /**
     * PRD §8.2 "safety/reporting". Either participant may report. A reported thread is closed to
     * the person who was reported; the reporter keeps reading, because the content is the evidence.
     */
    reportedAt: Date,
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reportReason: { type: String, maxlength: MESSAGING_LIMITS.REPORT_REASON_MAX_LENGTH },

    /**
     * Set by the migration on a pre-ADR-025 row whose two people could not be determined. Such a
     * row has no `participants`, so no query in this module ever returns it; the flag exists so an
     * operator can find and review it.
     */
    legacy: {
      unmigrated: { type: Boolean, default: undefined },
      reason: { type: String, default: undefined },
    },
  },
  { timestamps: true, collection: 'conversations' },
);

/**
 * One conversation per pair of people.
 *
 * PARTIAL, on purpose: rows the migration could not convert have no `pairKey`, and a plain unique
 * index would let exactly one of them exist. (The old `{ candidateId, companyId, recruiterUserId }`
 * unique index is NOT declared here and is dropped by the migration — every new document would
 * otherwise index as `(null, null, null)` and the second one would be refused.)
 */
conversationSchema.index(
  { pairKey: 1 },
  { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } },
);

/** The inbox: "my conversations, newest activity first". Multikey over the two participants. */
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

/** The daily new-conversation cap (MESSAGING_LIMITS). */
conversationSchema.index({ startedBy: 1, createdAt: -1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
