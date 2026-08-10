/**
 * REC-05 / REC-16 hiring intents — PRD §7.5, 05_DATABASE_SCHEMA.md §7.
 *
 * A hiring intent is deliberately NOT a job posting. PRD §7.5 is explicit that no job description
 * is required: a company activates hiring with role categories, employment types and delivery
 * modes alone. `description` exists and stays optional — requiring it would turn this into the
 * job-postings feature that ADR-016 lists as unscheduled (D-03).
 *
 * Only `active` intents accept new role-specific interest (PRD §21.5), and closing an intent
 * PRESERVES its pipeline entries and analytics (PRD §11.4) — closing is a state change, never a
 * delete.
 */

import { HIRING_INTENT_STATUS, INTENT_ACCEPTS_INTEREST } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { HiringIntent } from './hiringIntent.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/auditEvent.model.js';

/** Wire shape. Mongo ids and internals never reach the client raw. */
function present(intent) {
  return {
    id: String(intent._id),
    title: intent.title ?? null,
    status: intent.status,
    roleCategories: intent.roleCategories ?? [],
    specializations: {
      subjects: intent.specializations?.subjects ?? [],
      tests: intent.specializations?.tests ?? [],
      gradeBands: intent.specializations?.gradeBands ?? [],
      curricula: intent.specializations?.curricula ?? [],
    },
    employmentTypes: intent.employmentTypes ?? [],
    deliveryModes: intent.deliveryModes ?? [],
    locations: (intent.locations ?? []).map((location) => ({
      country: location.country ?? null,
      region: location.region ?? null,
      city: location.city ?? null,
      timezones: location.timezones ?? [],
      relocationExpected: Boolean(location.relocationExpected),
    })),
    experienceLevels: intent.experienceLevels ?? [],
    minYears: intent.minYears ?? null,
    availability: {
      type: intent.availability?.type ?? null,
      targetStartMonth: intent.availability?.targetStartMonth ?? null,
    },
    compensation: {
      min: intent.compensation?.min ?? null,
      max: intent.compensation?.max ?? null,
      currency: intent.compensation?.currency ?? null,
      period: intent.compensation?.period ?? null,
      visibility: intent.compensation?.visibility ?? 'hidden',
    },
    description: intent.description ?? null,
    interestQuestions: (intent.interestQuestions ?? []).map((question) => ({
      prompt: question.prompt,
      required: Boolean(question.required),
    })),
    /** Drives the candidate-facing CTA and the REC-16 badge without re-deriving the rule. */
    acceptsInterest: INTENT_ACCEPTS_INTEREST.includes(intent.status),
    closedAt: intent.closedAt ?? null,
    closedReason: intent.closedReason ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

/** Every intent for a company, newest first. Archived included — REC-16 can filter client-side. */
export async function listHiringIntents(companyId) {
  const intents = await HiringIntent.find({ companyId }).sort({ createdAt: -1 });
  return { intents: intents.map(present) };
}

/**
 * The intents a candidate may express role-specific interest in (PRD §8.7).
 *
 * Active only. A paused or closed intent must not appear as a choice, because submitting against
 * it would be refused at the next step — offering it would be an invitation to a dead end.
 */
export async function listOpenIntents(companyId) {
  const intents = await HiringIntent.find({
    companyId,
    status: { $in: INTENT_ACCEPTS_INTEREST },
  }).sort({ createdAt: -1 });

  return intents.map(present);
}

export async function getHiringIntent(companyId, intentId) {
  const intent = await HiringIntent.findOne({ _id: intentId, companyId });
  if (!intent) throw ApiError.notFound('That hiring intent does not exist.');
  return present(intent);
}

/** Fields a caller may write. Status moves through its own endpoint so transitions stay auditable. */
const WRITABLE = [
  'title',
  'roleCategories',
  'specializations',
  'employmentTypes',
  'deliveryModes',
  'locations',
  'experienceLevels',
  'minYears',
  'availability',
  'compensation',
  'description',
  'interestQuestions',
];

function applyWritable(intent, values) {
  for (const field of WRITABLE) {
    if (field in values) intent[field] = values[field];
  }
}

export async function createHiringIntent(companyId, actorUserId, values) {
  const intent = new HiringIntent({ companyId, status: HIRING_INTENT_STATUS.DRAFT });
  applyWritable(intent, values);
  await intent.save();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.HIRING_INTENT_CREATED,
    targetType: AUDIT_TARGET_TYPES.HIRING_INTENT,
    targetId: intent._id,
  });

  return present(intent);
}

export async function updateHiringIntent(companyId, intentId, actorUserId, values) {
  const intent = await HiringIntent.findOne({ _id: intentId, companyId });
  if (!intent) throw ApiError.notFound('That hiring intent does not exist.');

  applyWritable(intent, values);
  await intent.save();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.HIRING_INTENT_UPDATED,
    targetType: AUDIT_TARGET_TYPES.HIRING_INTENT,
    targetId: intent._id,
  });

  return present(intent);
}

/**
 * Which status changes are legal.
 *
 * Archived is terminal: PRD §11.4 requires closing to preserve pipeline entries and analytics, and
 * reopening an archived intent would resurrect a hiring context that recruiters have stopped
 * treating as live. Closed → active is allowed, because "we are hiring for this again" is a real
 * and common event and the entry's history is what makes it safe.
 */
const STATUS_TRANSITIONS = Object.freeze({
  [HIRING_INTENT_STATUS.DRAFT]: [HIRING_INTENT_STATUS.ACTIVE, HIRING_INTENT_STATUS.ARCHIVED],
  [HIRING_INTENT_STATUS.ACTIVE]: [
    HIRING_INTENT_STATUS.PAUSED,
    HIRING_INTENT_STATUS.CLOSED,
    HIRING_INTENT_STATUS.ARCHIVED,
  ],
  [HIRING_INTENT_STATUS.PAUSED]: [
    HIRING_INTENT_STATUS.ACTIVE,
    HIRING_INTENT_STATUS.CLOSED,
    HIRING_INTENT_STATUS.ARCHIVED,
  ],
  [HIRING_INTENT_STATUS.CLOSED]: [HIRING_INTENT_STATUS.ACTIVE, HIRING_INTENT_STATUS.ARCHIVED],
  [HIRING_INTENT_STATUS.ARCHIVED]: [],
});

/**
 * Activating requires the minimum PRD §7.5 declaration — and nothing more.
 *
 * This is the whole point of the feature: a company may go live on hiring without writing a job
 * description. The check exists so an EMPTY intent cannot be activated, not to smuggle in a
 * job-posting requirement.
 */
function assertActivatable(intent) {
  const missing = [];
  if (!intent.roleCategories?.length) missing.push('at least one role category');
  if (!intent.employmentTypes?.length) missing.push('at least one employment type');
  if (!intent.deliveryModes?.length) missing.push('at least one delivery mode');

  if (missing.length > 0) {
    throw ApiError.validation('This intent cannot be activated yet.', {
      status: `Add ${missing.join(', ')} before activating.`,
    });
  }
}

export async function changeHiringIntentStatus(
  companyId,
  intentId,
  actorUserId,
  status,
  reason = null,
) {
  const intent = await HiringIntent.findOne({ _id: intentId, companyId });
  if (!intent) throw ApiError.notFound('That hiring intent does not exist.');

  if (intent.status === status) return present(intent);

  const allowed = STATUS_TRANSITIONS[intent.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.validation('That status change is not allowed.', {
      status: `An intent that is ${intent.status} cannot become ${status}.`,
    });
  }

  if (status === HIRING_INTENT_STATUS.ACTIVE) assertActivatable(intent);

  intent.status = status;

  if (status === HIRING_INTENT_STATUS.CLOSED || status === HIRING_INTENT_STATUS.ARCHIVED) {
    intent.closedAt = new Date();
    intent.closedReason = reason ?? null;
  } else {
    // Reopening clears the closure, so a reactivated intent does not read as still closed.
    intent.closedAt = null;
    intent.closedReason = null;
  }

  await intent.save();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.HIRING_INTENT_STATUS_CHANGED,
    targetType: AUDIT_TARGET_TYPES.HIRING_INTENT,
    targetId: intent._id,
    metadata: { status, ...(reason ? { reason } : {}) },
  });

  return present(intent);
}

/**
 * Whether this company is currently hiring — the PRD §7.5 "hiring toggle".
 *
 * Derived from the intents rather than stored as a second flag on the company. One source of
 * truth: a stored boolean would eventually disagree with the intents it is meant to summarise,
 * and the public page and the candidate CTA both read this.
 */
export async function isCompanyHiring(companyId) {
  const count = await HiringIntent.countDocuments({
    companyId,
    status: { $in: INTENT_ACCEPTS_INTEREST },
  });
  return count > 0;
}
