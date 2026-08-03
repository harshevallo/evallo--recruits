/**
 * accessGrants — how a PRIVATE candidate shares with one company without becoming globally
 * discoverable (PRD §4.3, §21.3; 05_DATABASE_SCHEMA §9).
 *
 * This is read by authorization layer 4 (ADR-006 §6.2): a company may reach a non-discoverable
 * candidate only if an active grant exists. Withdrawing interest withdraws the grant, which is
 * what makes "access persists until withdrawn" enforceable rather than aspirational.
 */

import mongoose from 'mongoose';

const accessGrantSchema = new mongoose.Schema(
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
    /** What created the grant. Today always an expression of interest (PRD §8.7 step 7). */
    source: { type: String, default: 'interest' },
    /** Exactly what the company may see, shown to the candidate before they consent. */
    scope: { type: String, default: 'profile_and_message' },

    grantedAt: { type: Date, required: true, default: Date.now },
    withdrawnAt: Date,
  },
  { timestamps: true, collection: 'accessGrants' },
);

accessGrantSchema.index({ candidateId: 1, companyId: 1 });
accessGrantSchema.index({ companyId: 1, withdrawnAt: 1 });

export const AccessGrant = mongoose.model('AccessGrant', accessGrantSchema);
