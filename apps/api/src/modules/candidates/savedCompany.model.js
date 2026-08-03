/**
 * savedCompanies — CAN-06 "follow/save".
 *
 * The save ACTION belongs to CAN-06; the management screen is CAN-11 and is not in this
 * milestone. Kept as its own collection rather than an array on the profile so a shortlist can
 * grow without rewriting the profile document on every toggle.
 */

import mongoose from 'mongoose';

const savedCompanySchema = new mongoose.Schema(
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
    /** PRD §8.2 CAN-11 allows notes; captured now so saving does not need a later migration. */
    note: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: 'savedCompanies' },
);

/** Saving twice is the same save — the index makes a duplicate impossible under concurrency. */
savedCompanySchema.index({ candidateId: 1, companyId: 1 }, { unique: true });

export const SavedCompany = mongoose.model('SavedCompany', savedCompanySchema);
