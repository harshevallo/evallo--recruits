/**
 * auditEvents — PRD §14.3, §16.1, §21.4.
 *
 * Append-only. Never updated, never deleted. Written by services only, never by a controller and
 * never by a client.
 *
 * PRD §21.4 makes this mandatory for candidate profile views: "Candidate profile access is logged
 * with company, user, timestamp, and source." §16.1 extends the same requirement to evidence
 * access, contact reveals and exports. It is a compliance record, not a debugging convenience —
 * which is why the write is not conditional on anything the caller passes.
 *
 * Shape follows 05_DATABASE_SCHEMA §10 exactly, so this collection arrives as specified rather
 * than as whatever the first caller happened to need.
 */

import mongoose from 'mongoose';

/** Actions recorded so far. Extended as the events PRD §16.1 lists are built. */
export const AUDIT_ACTIONS = Object.freeze({
  CANDIDATE_PROFILE_VIEWED: 'candidate_profile.viewed',
  CANDIDATE_CONTACT_REVEALED: 'candidate_contact.revealed',

  /** REC-16 hiring intents. Status changes are the auditable part — PRD §11.4. */
  HIRING_INTENT_CREATED: 'hiring_intent.created',
  HIRING_INTENT_UPDATED: 'hiring_intent.updated',
  HIRING_INTENT_STATUS_CHANGED: 'hiring_intent.status_changed',

  /**
   * REC-14 pipeline. PRD §21.4 requires stage changes to carry audit history, so every
   * transition is recorded here as well as on the entry's own stageHistory.
   */
  PIPELINE_ENTRY_CREATED: 'pipeline_entry.created',
  PIPELINE_STAGE_CHANGED: 'pipeline_entry.stage_changed',
  PIPELINE_ENTRY_ASSIGNED: 'pipeline_entry.assigned',

  /** Shortlisting is silent to the candidate (PRD §21.4) but still a company action. */
  CANDIDATE_SAVED: 'candidate.saved',
  CANDIDATE_UNSAVED: 'candidate.unsaved',

  NOTE_CREATED: 'note.created',
  NOTE_DELETED: 'note.deleted',
});

export const AUDIT_TARGET_TYPES = Object.freeze({
  CANDIDATE_PROFILE: 'candidateProfile',
  HIRING_INTENT: 'hiringIntent',
  PIPELINE_ENTRY: 'pipelineEntry',
  NOTE: 'note',
});

const auditEventSchema = new mongoose.Schema(
  {
    /** Who acted. Always a real user — there is no such thing as a company acting on its own. */
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * The company context the action was taken in.
     *
     * Separate from the actor because the same person may hold memberships at several companies,
     * and "which company saw this candidate" is the question §21.4 actually asks. Null for
     * actions taken on the personal surface.
     */
    actorCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },

    action: { type: String, required: true },

    targetType: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },

    /** Action-specific context. `source` lives here — §21.4 requires it for profile views. */
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    ip: String,
    userAgent: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auditEvents',
  },
);

/** "Who accessed this candidate?" — the subject-access question §16.1 must be able to answer. */
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

/** "What did this company do?" — the compliance-review question. */
auditEventSchema.index({ actorCompanyId: 1, createdAt: -1 });

export const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
