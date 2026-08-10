/**
 * pipelineEntries — REC-14, PRD §7.9, 05_DATABASE_SCHEMA.md §9.
 *
 * The lightweight recruiter workflow, not an ATS. PRD §20.1 puts "default pipeline, basic
 * assignment" in the MVP and Appendix D defers stage customisation, so the stages are the fixed
 * set in `@evallo/shared` and this collection stores position, not configuration.
 *
 * PRD §4.1 allows ONE active entry per candidate per company. That is enforced by a partial unique
 * index rather than a service-level check, because two recruiters adding the same candidate at the
 * same moment is exactly the race a check-then-write loses.
 */

import mongoose from 'mongoose';
import { PIPELINE_STAGES, PIPELINE_STAGE_ORDER, TERMINAL_PIPELINE_STAGES } from '@evallo/shared';

/**
 * How a candidate entered the pipeline.
 *
 * Kept because PRD §21.4 requires profile access to record its source, and "did they come to us or
 * did we find them" changes what outreach is appropriate: a sourced candidate has not asked to be
 * contacted, an interest has.
 */
export const PIPELINE_SOURCES = Object.freeze({
  INTEREST: 'interest',
  SEARCH: 'search',
  SHORTLIST: 'shortlist',
});

/** Reason codes for rejection. PRD §21.4: rejection requires a reason code. */
export const REJECTION_REASONS = Object.freeze({
  EXPERIENCE: 'experience_mismatch',
  SUBJECT: 'subject_mismatch',
  LOCATION: 'location_mismatch',
  AVAILABILITY: 'availability_mismatch',
  COMPENSATION: 'compensation_mismatch',
  CREDENTIALS: 'credentials_missing',
  ROLE_FILLED: 'role_filled',
  NO_RESPONSE: 'no_response',
  CANDIDATE_WITHDREW: 'candidate_withdrew',
  OTHER: 'other',
});

const stageHistorySchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...PIPELINE_STAGE_ORDER, null], default: null },
    to: { type: String, required: true, enum: PIPELINE_STAGE_ORDER },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Required when moving to `rejected` — enforced in the service, where the rule lives. */
    reasonCode: String,
    note: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const pipelineEntrySchema = new mongoose.Schema(
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

    stage: {
      type: String,
      required: true,
      enum: PIPELINE_STAGE_ORDER,
      default: PIPELINE_STAGES.SOURCED,
    },

    /** Basic assignment (PRD §20.1). One owner; a null owner is unassigned, not invalid. */
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    source: {
      type: String,
      required: true,
      enum: Object.values(PIPELINE_SOURCES),
      default: PIPELINE_SOURCES.SEARCH,
    },

    /** The interest that created this entry, when there was one. */
    interestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpressionOfInterest',
      default: null,
    },

    /**
     * Which hiring intents this entry is against.
     *
     * An array because PRD §21.4 says a candidate rejected for one intent may be retained for
     * another — that is only expressible if an entry can reference more than one.
     */
    roleIntentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HiringIntent' }],

    stageHistory: { type: [stageHistorySchema], default: [] },

    /** Free text the recruiter sets, e.g. "call Thursday". Not a task system. */
    nextAction: String,

    /** Stage-specific facts worth structuring, so they are not buried in notes. */
    interview: {
      scheduledFor: Date,
      interviewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      feedback: String,
    },

    outcome: {
      /** Set when the entry reaches `hired` — PRD §7.9's hired data. */
      roleTitle: String,
      startDate: String,
      /** Set when the entry reaches `rejected`. Never shown to the candidate verbatim. */
      rejectionReason: { type: String, enum: [...Object.values(REJECTION_REASONS), null] },
      rejectionNote: String,
    },

    /**
     * Whether the entry is still live.
     *
     * Derived from the stage on save rather than set by callers, so "active" cannot disagree with
     * the stage it summarises. It exists only to give the unique index something to filter on.
     */
    active: { type: Boolean, default: true },

    closedAt: Date,
  },
  { timestamps: true, collection: 'pipelineEntries' },
);

/**
 * One ACTIVE entry per candidate per company (PRD §4.1).
 *
 * Partial, so a candidate rejected once can be re-added later — which §21.4's "rejected for one
 * intent may be retained for another" requires.
 */
pipelineEntrySchema.index(
  { companyId: 1, candidateId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

/** Board and list queries. */
pipelineEntrySchema.index({ companyId: 1, stage: 1, updatedAt: -1 });
pipelineEntrySchema.index({ companyId: 1, ownerId: 1 });

pipelineEntrySchema.pre('save', function syncActive(next) {
  const terminal = TERMINAL_PIPELINE_STAGES.includes(this.stage);
  this.active = !terminal;
  if (terminal && !this.closedAt) this.closedAt = new Date();
  if (!terminal) this.closedAt = undefined;
  next();
});

export const PipelineEntry = mongoose.model('PipelineEntry', pipelineEntrySchema);
