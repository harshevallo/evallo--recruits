/**
 * `experiences` and `educationEntries` — the first two collections of the evidence layer
 * (ADR-008, PRD §8.3 sections 4–5, 05_DATABASE_SCHEMA §8).
 *
 * Separate collections rather than arrays on `candidateProfiles`, because ADR-008's reason is
 * per-ITEM state: each entry carries its own `visibility` and `verificationStatus`, and an
 * embedded array cannot be indexed, verified, or selectively hidden one element at a time. A
 * candidate who wants one role hidden from recruiters while the rest stay visible is the case
 * that makes this structural rather than stylistic.
 *
 * Both shapes are near-identical, so they share a builder — but they stay two collections, since
 * "where did you work" and "where did you study" are verified by different issuers and will
 * diverge as verification lands (PRD §20.3 defers issuer verification to Phase 2).
 */

import mongoose from 'mongoose';
import {
  CANDIDATE_VISIBILITY,
  EVIDENCE_VERIFICATION,
  VIDEO_PROVIDERS,
  videoProviderFor,
} from '@evallo/shared';

/** Item visibility reuses the candidate's own vocabulary, so one concept has one set of words. */
const ITEM_VISIBILITY = Object.freeze([
  CANDIDATE_VISIBILITY.DISCOVERABLE,
  CANDIDATE_VISIBILITY.PRIVATE,
]);

/**
 * Fields every evidence entry carries.
 *
 * `current` is stored rather than inferred from a null `endDate`: "I still work here" and "I have
 * not filled in the end date yet" are different claims, and only the first should render as
 * "Present" on a recruiter's screen.
 */
function baseEntryFields() {
  return {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
      index: true,
    },

    startDate: { type: String, trim: true }, // YYYY-MM — month precision is all anyone supplies
    endDate: { type: String, trim: true },
    current: { type: Boolean, default: false },

    description: { type: String, trim: true, maxlength: 2000 },

    /** Per-item visibility (ADR-008). Discoverable by default — an entry hidden by accident is worse. */
    visibility: {
      type: String,
      enum: ITEM_VISIBILITY,
      default: CANDIDATE_VISIBILITY.DISCOVERABLE,
    },

    /**
     * Per-item verification (PRD §14.2). Nothing writes anything but `unverified` yet — issuer
     * verification is Phase 2 (PRD §20.3) — but the field exists so entries created now do not
     * need backfilling when it does.
     */
    verificationStatus: {
      type: String,
      enum: Object.values(EVIDENCE_VERIFICATION),
      default: EVIDENCE_VERIFICATION.UNVERIFIED,
    },

    /** Candidate-controlled ordering, so a profile is not stuck in insertion order. */
    sortOrder: { type: Number, default: 0 },
  };
}

/* ── experiences ──────────────────────────────────────────────────────────────────────────── */

const experienceSchema = new mongoose.Schema(
  {
    ...baseEntryFields(),
    role: { type: String, required: true, trim: true, maxlength: 160 },
    organization: { type: String, required: true, trim: true, maxlength: 160 },
    location: { type: String, trim: true, maxlength: 160 },
    /** PRD §8.3 "delivery model" for the role — how this particular job was taught. */
    deliveryMode: { type: String, trim: true },
    /** PRD §8.3 "quantified scale / outcomes" — the measurable claim, kept apart from prose. */
    outcome: { type: String, trim: true, maxlength: 400 },
  },
  { timestamps: true, collection: 'experiences' },
);

experienceSchema.index({ candidateId: 1, sortOrder: 1, startDate: -1 });

/* ── educationEntries ─────────────────────────────────────────────────────────────────────── */

const educationEntrySchema = new mongoose.Schema(
  {
    ...baseEntryFields(),
    institution: { type: String, required: true, trim: true, maxlength: 160 },
    qualification: { type: String, trim: true, maxlength: 160 },
    fieldOfStudy: { type: String, trim: true, maxlength: 160 },
  },
  { timestamps: true, collection: 'educationEntries' },
);

educationEntrySchema.index({ candidateId: 1, sortOrder: 1, startDate: -1 });

/* ── credentials ──────────────────────────────────────────────────────────────────────────── */

/**
 * PRD §8.3 section 5 — licences, certifications and standardised scores.
 *
 * Stores the CLAIM and its metadata, not a document. There is no file-storage infrastructure in
 * this API, so a "PDF uploaded" badge would be a lie; `documentUrl` accepts a link the candidate
 * already hosts, and the section says plainly that upload is not available yet.
 */
const credentialSchema = new mongoose.Schema(
  {
    ...baseEntryFields(),
    name: { type: String, required: true, trim: true, maxlength: 160 },
    credentialType: { type: String, trim: true, maxlength: 60 },
    issuer: { type: String, trim: true, maxlength: 160 },
    /** Free text: "1590 total (800 Math, 790 ERW)" or a licence number. */
    result: { type: String, trim: true, maxlength: 160 },
    documentUrl: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: 'credentials' },
);

credentialSchema.index({ candidateId: 1, sortOrder: 1, startDate: -1 });

/* ── evidenceItems (portfolio media) ──────────────────────────────────────────────────────── */

/**
 * PRD §8.3 section 9 — teaching videos, as EMBEDS.
 *
 * The reference offers YouTube/Vimeo URLs rather than file uploads, which is what makes this
 * section buildable today: a link needs no storage, no virus scanning and no CDN. `provider` is
 * derived on write so the allow-list (PRD §16.3 "embed provider allow-list") is enforced once,
 * server-side, rather than trusted from whatever the client sends.
 */
const evidenceItemSchema = new mongoose.Schema(
  {
    ...baseEntryFields(),
    title: { type: String, required: true, trim: true, maxlength: 160 },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    provider: { type: String, trim: true, maxlength: 40 },
    /** Which reference prompt this answers, e.g. "Concept explanation" (Appendix C). */
    prompt: { type: String, trim: true, maxlength: 80 },
  },
  { timestamps: true, collection: 'evidenceItems' },
);

evidenceItemSchema.index({ candidateId: 1, sortOrder: 1 });

export const Experience = mongoose.model('Experience', experienceSchema);
export const EducationEntry = mongoose.model('EducationEntry', educationEntrySchema);
export const Credential = mongoose.model('Credential', credentialSchema);
export const EvidenceItem = mongoose.model('EvidenceItem', evidenceItemSchema);

/** The two entry kinds the builder can render, and everything that differs between them. */
export const ENTRY_KINDS = Object.freeze({
  experience: {
    key: 'experience',
    model: Experience,
    /** Fields a caller may write. Anything else in the body is ignored, not trusted. */
    writable: [
      'role',
      'organization',
      'location',
      'deliveryMode',
      'startDate',
      'endDate',
      'current',
      'description',
      'outcome',
      'visibility',
      'sortOrder',
    ],
  },
  education: {
    key: 'education',
    model: EducationEntry,
    writable: [
      'institution',
      'qualification',
      'fieldOfStudy',
      'startDate',
      'endDate',
      'current',
      'description',
      'visibility',
      'sortOrder',
    ],
  },
  credential: {
    key: 'credential',
    model: Credential,
    writable: [
      'name',
      'credentialType',
      'issuer',
      'result',
      'documentUrl',
      'startDate',
      'endDate',
      'description',
      'visibility',
      'sortOrder',
    ],
  },
  media: {
    key: 'media',
    model: EvidenceItem,
    writable: ['title', 'url', 'prompt', 'description', 'visibility', 'sortOrder'],
  },
});

/**
 * Embed providers allowed for portfolio media (PRD §16.3).
 *
 * The list itself moved to `@evallo/shared` (`taxonomy/media.js`) once the BUILDER needed it too:
 * "Add video" stays disabled until the link would be accepted, and a second copy of the host list
 * in the client is precisely the drift ADR-009 exists to prevent — it shows up as a button enabled
 * for a link the server then rejects.
 *
 * These re-exports keep the existing server-side names working, so `providerFor` remains the one
 * function the write path and the validation schema both call.
 */
export const MEDIA_PROVIDERS = VIDEO_PROVIDERS;
export const providerFor = videoProviderFor;
