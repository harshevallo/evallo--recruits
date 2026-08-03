/**
 * candidateProfiles — the candidate capability.
 *
 * A user IS a candidate because this document exists, not because a field says so. Creating it
 * grants nothing else and takes nothing away: the same person can simultaneously own companies
 * and recruit through them.
 *
 * Minimal for now — the full structured profile (experience, education, credentials, evidence,
 * answers, search facets) arrives with the profile-builder screens.
 */

import mongoose from 'mongoose';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';

const candidateProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    headline: { type: String, trim: true, maxlength: 200 },
    summary: { type: String, trim: true, maxlength: 2000 },

    /** Candidate-controlled discoverability. Constrains recruiters independently of their role. */
    status: {
      type: String,
      required: true,
      enum: Object.values(CANDIDATE_VISIBILITY),
      default: CANDIDATE_VISIBILITY.DRAFT,
    },

    /** Hidden by default — a recruiter must earn contact details, not merely hold a role. */
    contactVisibility: {
      type: String,
      enum: Object.values(CONTACT_VISIBILITY),
      default: CONTACT_VISIBILITY.HIDDEN,
    },

    /** Companies this candidate has blocked. Overrides any permission they hold. */
    blockedCompanyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],

    targetRoles: [String],
    subjects: [String],

    publishedAt: Date,
    lastActiveAt: Date,
  },
  { timestamps: true, collection: 'candidateProfiles' },
);

/** One active candidate profile per user. */
candidateProfileSchema.index({ userId: 1 }, { unique: true });
candidateProfileSchema.index({ status: 1, lastActiveAt: -1 });

candidateProfileSchema.methods.toOwnerView = function toOwnerView() {
  return {
    id: String(this._id),
    headline: this.headline ?? null,
    summary: this.summary ?? null,
    status: this.status,
    contactVisibility: this.contactVisibility,
    targetRoles: this.targetRoles ?? [],
    subjects: this.subjects ?? [],
    publishedAt: this.publishedAt ?? null,
    createdAt: this.createdAt,
  };
};

export const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);
