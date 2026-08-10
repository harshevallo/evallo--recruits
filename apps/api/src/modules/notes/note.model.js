/**
 * notes — internal recruiter notes (PRD §11.2, §21.4, 05_DATABASE_SCHEMA.md §9).
 *
 * A SEPARATE COLLECTION FROM `messages`, and that is the entire point.
 *
 * PRD §21.4 requires that internal notes never reach candidates, and §11.2 repeats it. A `internal:
 * true` flag on messages would make that guarantee depend on every future query remembering to
 * filter — one forgotten `.find()` on a candidate-facing endpoint and private hiring commentary is
 * in someone's inbox. With separate collections the candidate surface has no code path that can
 * reach this data at all: the guarantee is structural, not vigilance.
 *
 * The same reasoning is why rejection notes live on the pipeline entry's `outcome` and are returned
 * only on company-scoped routes.
 */

import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    /** The candidate the note is about. Notes are per candidate, not per pipeline entry, so they
     *  survive an entry being closed and reopened — the history is about the person. */
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
      index: true,
    },

    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true, collection: 'notes' },
);

/** "Show me this company's notes on this candidate, newest first." */
noteSchema.index({ companyId: 1, candidateId: 1, createdAt: -1 });

export const Note = mongoose.model('Note', noteSchema);
