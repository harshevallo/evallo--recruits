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

    /*
     * Structured fields the profile builder writes (CAN-02, PRD §8.3 sections 1–3).
     * These are first-class fields rather than answers because talent search will filter on them
     * (ADR-010) — an answer document cannot be indexed usefully.
     */
    targetRoles: [String],
    subjects: [String],
    learnerSegments: [String],
    employmentTypes: [String],
    deliveryModes: [String],
    availability: String,
    yearsExperience: Number,

    /** Question-bank version the profile was last edited under (ADR-007). */
    bankVersion: Number,

    publishedAt: Date,
    lastActiveAt: Date,

    /**
     * Set when account deletion is processed (16_RETENTION_POLICY.md §3).
     *
     * The row is emptied and marked `archived` rather than removed, so every interest,
     * conversation and pipeline entry that references it stays valid — and `archived` is already
     * refused by `candidateAccess.service`, so the privacy outcome comes from the existing
     * authority rather than from a second rule. `05_DATABASE_SCHEMA.md` §2: soft delete is
     * anonymisation, not removal.
     */
    deletedAt: Date,
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
    learnerSegments: this.learnerSegments ?? [],
    employmentTypes: this.employmentTypes ?? [],
    deliveryModes: this.deliveryModes ?? [],
    availability: this.availability ?? null,
    yearsExperience: this.yearsExperience ?? null,
    publishedAt: this.publishedAt ?? null,
    createdAt: this.createdAt,
  };
};

/**
 * The recruiter-facing rendering (PRD §8.8), used by BOTH the CAN-03 preview and — later — the
 * recruiter's candidate viewer.
 *
 * One function deliberately serves both, because PRD §8.8 requires that "the candidate preview
 * must show the exact same rendering and privacy state". Two code paths would drift, and the
 * drift would be a privacy defect: the candidate would be shown a profile that is not what
 * recruiters actually see.
 *
 * PRD §8.8 fixes the header contents: photo, name, headline, location/time zone, languages,
 * open-to-work status, role types, primary expertise, years of experience. Photo, location and
 * languages belong to the PERSONAL layer on `users` (05_DATABASE_SCHEMA §2), so the caller passes
 * them in rather than this document duplicating them.
 *
 * @param {{ name?, photoUrl?, location?, languages?, email?, contactRevealed? }} viewer
 */
candidateProfileSchema.methods.toRecruiterView = function toRecruiterView(viewer = {}) {
  return {
    header: {
      name: viewer.name ?? null,
      photoUrl: viewer.photoUrl ?? null,
      location: viewer.location ?? null,
      languages: viewer.languages ?? [],
      headline: this.headline ?? null,
      status: this.status,
      targetRoles: this.targetRoles ?? [],
      yearsExperience: this.yearsExperience ?? null,
      availability: this.availability ?? null,
      deliveryModes: this.deliveryModes ?? [],
      employmentTypes: this.employmentTypes ?? [],
    },
    introduction: this.summary ?? null,
    expertise: {
      subjects: this.subjects ?? [],
      learnerSegments: this.learnerSegments ?? [],
    },
    /*
     * The evidence layer (experience, education, credentials, scores, media, references) lives in
     * its own collections per ADR-008 and is not built yet. Reported as empty rather than omitted,
     * so the preview shows the same "no evidence yet" state a recruiter would see.
     */
    evidence: {
      experience: [],
      education: [],
      credentials: [],
      media: [],
      references: [],
    },
    /**
     * Contact is revealed only when the candidate's own rule allows it — never merely because
     * the viewer holds a recruiter role (PRD §7.10, §4.3).
     */
    contact: viewer.contactRevealed ? { email: viewer.email ?? null } : null,
  };
};

export const CandidateProfile = mongoose.model('CandidateProfile', candidateProfileSchema);
