/**
 * savedCandidates — the recruiter shortlist (PRD §7.6, §21.4).
 *
 * Company-scoped, not user-scoped: PRD §21.6 requires a recruiter's replacement to inherit their
 * work, so a shortlist belongs to the company and `savedByUserId` records only who added the row.
 * A departing recruiter's shortlist therefore survives them.
 *
 * Deliberately separate from `pipelineEntries`. Saving a candidate is silent — PRD §21.4: "Candidates
 * are not notified when simply saved to a shortlist" — while entering a pipeline is a workflow act.
 * One collection with a flag would make that promise a serialisation detail instead of a structure.
 */

import mongoose from 'mongoose';

const savedCandidateSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
      index: true,
    },

    /** Who saved it. Attribution only — it never gates who may see or remove the row. */
    savedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true, collection: 'savedCandidates' },
);

/** Saving twice is the same shortlist, not two rows. */
savedCandidateSchema.index({ companyId: 1, candidateId: 1 }, { unique: true });

export const SavedCandidate = mongoose.model('SavedCandidate', savedCandidateSchema);
