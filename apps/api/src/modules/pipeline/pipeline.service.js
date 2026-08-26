/**
 * REC-14 pipeline and shortlist — PRD §7.9, §11.4, §21.4.
 *
 * Two records, one authorization rule. Adding a candidate to a pipeline or a shortlist is an
 * access-bearing act, so both go through `resolveCandidateAccess` first: a recruiter who cannot
 * VIEW a candidate must not be able to file them either. Without that check the shortlist becomes
 * a way to keep a reference to someone who has since gone private.
 *
 * PRD §21.4's rules that shape this file:
 *   · stage changes carry audit history          → stageHistory + auditEvents, both written
 *   · rejection requires a reason code           → enforced here, not in the model
 *   · candidates are NOT notified when saved     → no notification on save, deliberately
 *   · rejected for one intent, retained for another → entries are per-candidate, reopenable
 */

import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_LABELS,
  TERMINAL_PIPELINE_STAGES,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { resolveCandidateAccess } from '../candidates/candidateAccess.service.js';
import { User } from '../users/user.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '../audit/auditEvent.model.js';
import { PipelineEntry, PIPELINE_SOURCES, REJECTION_REASONS } from './pipelineEntry.model.js';
import { SavedCandidate } from './savedCandidate.model.js';

/**
 * The candidate summary a recruiter sees on a pipeline card or shortlist row.
 *
 * Deliberately thin, and built from the SAME recruiter view CAN-03 and REC-13 use, so a card can
 * never show a field the profile screen would have withheld.
 */
async function candidateCard(profile, companyId) {
  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) return null;

  const user = await User.findById(profile.userId)
    .select('name profilePicture location')
    .lean();

  return {
    id: String(profile._id),
    name: user?.name ?? null,
    headline: profile.headline ?? null,
    photoUrl: user?.profilePicture ?? null,
    location: user?.location
      ? {
          country: user.location.country ?? null,
          region: user.location.region ?? null,
          timezone: user.location.timezone ?? null,
        }
      : null,
    targetRoles: profile.targetRoles ?? [],
    subjects: profile.subjects ?? [],
    yearsExperience: profile.yearsExperience ?? null,
    status: profile.status,
  };
}

function presentEntry(entry, candidate, owner) {
  return {
    id: String(entry._id),
    stage: entry.stage,
    stageLabel: PIPELINE_STAGE_LABELS[entry.stage] ?? entry.stage,
    source: entry.source,
    active: entry.active,
    nextAction: entry.nextAction ?? null,
    ownerId: entry.ownerId ? String(entry.ownerId) : null,
    owner: owner ? { id: String(owner._id), name: owner.name ?? null } : null,
    interestId: entry.interestId ? String(entry.interestId) : null,
    roleIntentIds: (entry.roleIntentIds ?? []).map(String),
    interview: {
      scheduledFor: entry.interview?.scheduledFor ?? null,
      interviewerUserId: entry.interview?.interviewerUserId
        ? String(entry.interview.interviewerUserId)
        : null,
      feedback: entry.interview?.feedback ?? null,
    },
    outcome: {
      roleTitle: entry.outcome?.roleTitle ?? null,
      startDate: entry.outcome?.startDate ?? null,
      rejectionReason: entry.outcome?.rejectionReason ?? null,
      // rejectionNote is INTERNAL. It is returned to the company surface only, never candidate-side.
      rejectionNote: entry.outcome?.rejectionNote ?? null,
    },
    stageHistory: (entry.stageHistory ?? []).map((row) => ({
      from: row.from ?? null,
      to: row.to,
      toLabel: PIPELINE_STAGE_LABELS[row.to] ?? row.to,
      actorUserId: String(row.actorUserId),
      reasonCode: row.reasonCode ?? null,
      note: row.note ?? null,
      at: row.at,
    })),
    candidate,
    closedAt: entry.closedAt ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/** Hydrates candidate + owner for a set of entries, dropping any the company may no longer see. */
async function hydrate(entries, companyId) {
  const profiles = await CandidateProfile.find({
    _id: { $in: entries.map((entry) => entry.candidateId) },
  });
  const byId = new Map(profiles.map((profile) => [String(profile._id), profile]));

  const ownerIds = entries.map((entry) => entry.ownerId).filter(Boolean);
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } }).select('name').lean()
    : [];
  const ownersById = new Map(owners.map((owner) => [String(owner._id), owner]));

  const rows = await Promise.all(
    entries.map(async (entry) => {
      const profile = byId.get(String(entry.candidateId));
      if (!profile) return null;

      const candidate = await candidateCard(profile, companyId);
      // A candidate who has since gone private disappears from the board rather than leaking a
      // stale card. The ENTRY is retained — §11.4 requires history to survive.
      if (!candidate) return null;

      return presentEntry(entry, candidate, ownersById.get(String(entry.ownerId)) ?? null);
    }),
  );

  return rows.filter(Boolean);
}

/**
 * The board — every stage, in PRD §7.9 order, each with its entries.
 *
 * Empty stages are returned as empty columns rather than omitted, so the board renders the whole
 * workflow and a recruiter can see that "Offer" exists and is empty.
 */
export async function getPipeline(companyId, { includeClosed = false } = {}) {
  const query = { companyId };
  if (!includeClosed) query.active = true;

  const entries = await PipelineEntry.find(query).sort({ updatedAt: -1 });
  const rows = await hydrate(entries, companyId);

  const byStage = new Map(PIPELINE_STAGE_ORDER.map((stage) => [stage, []]));
  for (const row of rows) byStage.get(row.stage)?.push(row);

  return {
    stages: PIPELINE_STAGE_ORDER.map((stage) => ({
      key: stage,
      label: PIPELINE_STAGE_LABELS[stage],
      terminal: TERMINAL_PIPELINE_STAGES.includes(stage),
      entries: byStage.get(stage) ?? [],
    })),
    total: rows.length,
    reasonCodes: Object.entries(REJECTION_REASONS).map(([, value]) => value),
  };
}

/**
 * REC-14 — everyone this company has hired.
 *
 * ── Why this is its own read and not a board filter ─────────────────────────────────────
 *
 * `getPipeline` answers "what needs work?", so it defaults to `active: true` and a hired candidate
 * correctly drops out of it — they are not work any more. That left the hire itself reachable only
 * by ticking "Show closed" on the board, which is a filter on live work, not a record of outcomes.
 * The two questions want different shapes: the board wants columns, this wants a dated list with
 * the facts a hire is reported on.
 *
 * Everything here is derived from what the board already stores. No new field was added to the
 * model: `outcome.roleTitle` and `outcome.startDate` are captured when the stage is set, and
 * `stageHistory` already records the actor and the timestamp of every move.
 *
 * ── Where `hiredAt` and `hiredBy` come from ─────────────────────────────────────────
 *
 * From the LAST `to: 'hired'` row in `stageHistory`, not from `closedAt` or `updatedAt`. Both of
 * those move for reasons that are not the hire — an owner reassignment or an edited next action
 * bumps `updatedAt`, and an entry moved out of `hired` and back again would have a `closedAt` from
 * the wrong moment. The history row is the only record of when the decision was actually made.
 */
export async function getHires(companyId) {
  const entries = await PipelineEntry.find({
    companyId,
    stage: PIPELINE_STAGES.HIRED,
  }).sort({ closedAt: -1 });

  /* Same hydration as the board, so a candidate who has gone private disappears here too. */
  const rows = await hydrate(entries, companyId);

  /** The moment of hire, and who recorded it. */
  const decisionFor = (row) => {
    const hires = (row.stageHistory ?? []).filter((step) => step.to === PIPELINE_STAGES.HIRED);
    return hires.length > 0 ? hires[hires.length - 1] : null;
  };

  /* One query for every actor name, rather than one per row. */
  const actorIds = [...new Set(rows.map((row) => decisionFor(row)?.actorUserId).filter(Boolean))];
  const actors = actorIds.length
    ? await User.find({ _id: { $in: actorIds } }).select('name').lean()
    : [];
  const actorsById = new Map(actors.map((actor) => [String(actor._id), actor.name ?? null]));

  const hires = rows.map((row) => {
    const decision = decisionFor(row);
    return {
      id: row.id,
      candidate: row.candidate,
      roleTitle: row.outcome.roleTitle,
      startDate: row.outcome.startDate,
      /* Null only for data written before stage history existed — the client renders a dash. */
      hiredAt: decision?.at ?? row.closedAt ?? null,
      hiredBy: decision?.actorUserId
        ? { id: decision.actorUserId, name: actorsById.get(decision.actorUserId) ?? null }
        : null,
      owner: row.owner,
      source: row.source,
      /* How long the whole process took, for the one metric a pilot actually reports on. */
      daysToHire:
        decision?.at && row.createdAt
          ? Math.max(0, Math.round((new Date(decision.at) - new Date(row.createdAt)) / 86_400_000))
          : null,
    };
  });

  /* Newest first. Sorted on the derived date, since `closedAt` only approximates it. */
  hires.sort((a, b) => new Date(b.hiredAt ?? 0) - new Date(a.hiredAt ?? 0));

  return { hires, total: hires.length };
}

export async function getPipelineEntry(companyId, entryId) {
  const entry = await PipelineEntry.findOne({ _id: entryId, companyId });
  if (!entry) throw ApiError.notFound('That pipeline entry does not exist.');

  const rows = await hydrate([entry], companyId);
  if (rows.length === 0) throw ApiError.notFound('That pipeline entry does not exist.');
  return rows[0];
}

/**
 * Adds a candidate to the pipeline.
 *
 * Idempotent by design: if an active entry already exists it is RETURNED rather than duplicated,
 * because PRD §4.1 allows only one and a recruiter clicking twice should not get an error about a
 * state they wanted anyway.
 */
export async function addToPipeline(
  companyId,
  actorUserId,
  { candidateId, stage, source = PIPELINE_SOURCES.SEARCH, interestId = null, roleIntentIds = [] },
) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) throw ApiError.notFound('Candidate not found.');

  // The same refusal the viewer gives, for the same reason (PRD §16.1): absent and forbidden
  // are indistinguishable.
  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  const existing = await PipelineEntry.findOne({ companyId, candidateId, active: true });
  if (existing) return getPipelineEntry(companyId, existing._id);

  const initialStage =
    stage && PIPELINE_STAGE_ORDER.includes(stage)
      ? stage
      : source === PIPELINE_SOURCES.INTEREST
        ? PIPELINE_STAGES.NEW_INTEREST
        : PIPELINE_STAGES.SOURCED;

  if (TERMINAL_PIPELINE_STAGES.includes(initialStage)) {
    throw ApiError.validation('A candidate cannot be added directly to a closing stage.', {
      stage: `Add them to an open stage first, then move them to ${PIPELINE_STAGE_LABELS[initialStage]}.`,
    });
  }

  const entry = await PipelineEntry.create({
    companyId,
    candidateId,
    stage: initialStage,
    source,
    interestId,
    roleIntentIds,
    ownerId: actorUserId,
    stageHistory: [{ from: null, to: initialStage, actorUserId }],
  });

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.PIPELINE_ENTRY_CREATED,
    targetType: AUDIT_TARGET_TYPES.PIPELINE_ENTRY,
    targetId: entry._id,
    metadata: { candidateId: String(candidateId), stage: initialStage, source },
  });

  return getPipelineEntry(companyId, entry._id);
}

/**
 * Moves an entry to another stage.
 *
 * Any stage may follow any other. That is deliberate: real hiring goes backwards ("re-screen after
 * a gap"), skips forward, and reopens. What the PRD actually requires is not a state machine but a
 * RECORD — §21.4 asks for audit history and a reason code on rejection, both enforced here.
 */
export async function changeStage(
  companyId,
  entryId,
  actorUserId,
  { stage, reasonCode = null, note = null, outcome = {} },
) {
  if (!PIPELINE_STAGE_ORDER.includes(stage)) {
    throw ApiError.validation('That is not a pipeline stage.', { stage: 'Unknown stage.' });
  }

  const entry = await PipelineEntry.findOne({ _id: entryId, companyId });
  if (!entry) throw ApiError.notFound('That pipeline entry does not exist.');

  if (stage === PIPELINE_STAGES.REJECTED && !reasonCode) {
    throw ApiError.validation('A rejection needs a reason.', {
      reasonCode: 'Choose a reason before rejecting.',
    });
  }

  if (reasonCode && !Object.values(REJECTION_REASONS).includes(reasonCode)) {
    throw ApiError.validation('That is not a valid reason.', { reasonCode: 'Unknown reason.' });
  }

  if (stage === PIPELINE_STAGES.HIRED && !outcome.roleTitle) {
    throw ApiError.validation('Recording a hire needs the role.', {
      roleTitle: 'Add the role they were hired into.',
    });
  }

  const from = entry.stage;

  /*
   * Reopening a closed entry. The unique index only covers active entries, so a second active
   * entry for the same candidate could exist by now — refuse rather than violate §4.1.
   */
  if (!entry.active && !TERMINAL_PIPELINE_STAGES.includes(stage)) {
    const live = await PipelineEntry.findOne({
      companyId,
      candidateId: entry.candidateId,
      active: true,
      _id: { $ne: entry._id },
    });
    if (live) {
      throw ApiError.conflict('This candidate already has an active pipeline entry.', {
        stage: 'Close the other entry before reopening this one.',
      });
    }
  }

  entry.stage = stage;
  entry.stageHistory.push({ from, to: stage, actorUserId, reasonCode, note });

  if (stage === PIPELINE_STAGES.REJECTED) {
    entry.outcome = {
      ...(entry.outcome ?? {}),
      rejectionReason: reasonCode,
      rejectionNote: note ?? null,
    };
  }

  if (stage === PIPELINE_STAGES.HIRED) {
    entry.outcome = {
      ...(entry.outcome ?? {}),
      roleTitle: outcome.roleTitle,
      startDate: outcome.startDate ?? null,
    };
  }

  await entry.save();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.PIPELINE_STAGE_CHANGED,
    targetType: AUDIT_TARGET_TYPES.PIPELINE_ENTRY,
    targetId: entry._id,
    metadata: { from, to: stage, ...(reasonCode ? { reasonCode } : {}) },
  });

  return getPipelineEntry(companyId, entry._id);
}

/** Basic assignment (PRD §20.1). Null clears it — unassigned is a legitimate state. */
export async function assignEntry(companyId, entryId, actorUserId, ownerId) {
  const entry = await PipelineEntry.findOne({ _id: entryId, companyId });
  if (!entry) throw ApiError.notFound('That pipeline entry does not exist.');

  if (ownerId) {
    // The owner must be a member of THIS company; assigning to an outsider would grant an
    // implicit foothold in a company they do not belong to.
    const { CompanyMember } = await import('../memberships/companyMember.model.js');
    const member = await CompanyMember.findOne({
      companyId,
      userId: ownerId,
      status: 'active',
    });
    if (!member) {
      throw ApiError.validation('That person is not a member of this company.', {
        ownerId: 'Choose an active team member.',
      });
    }
  }

  entry.ownerId = ownerId ?? null;
  await entry.save();

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.PIPELINE_ENTRY_ASSIGNED,
    targetType: AUDIT_TARGET_TYPES.PIPELINE_ENTRY,
    targetId: entry._id,
    metadata: { ownerId: ownerId ? String(ownerId) : null },
  });

  return getPipelineEntry(companyId, entry._id);
}

/** Stage-local details: next action, interview facts. Not a stage change, so no history row. */
export async function updateEntryDetails(companyId, entryId, values) {
  const entry = await PipelineEntry.findOne({ _id: entryId, companyId });
  if (!entry) throw ApiError.notFound('That pipeline entry does not exist.');

  if ('nextAction' in values) entry.nextAction = values.nextAction;

  if (values.interview) {
    entry.interview = {
      scheduledFor: values.interview.scheduledFor ?? entry.interview?.scheduledFor ?? null,
      interviewerUserId:
        values.interview.interviewerUserId ?? entry.interview?.interviewerUserId ?? null,
      feedback: values.interview.feedback ?? entry.interview?.feedback ?? null,
    };
  }

  await entry.save();
  return getPipelineEntry(companyId, entry._id);
}

/* ── Shortlist ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Saving a candidate.
 *
 * Separate from the pipeline on purpose. "Save for later" and "enter our hiring workflow" are
 * different commitments, and PRD §21.4 says a candidate is NOT notified when merely saved — which
 * is only a safe promise if saving is its own record with no workflow side effects.
 */
export async function saveCandidate(companyId, actorUserId, candidateId) {
  const profile = await CandidateProfile.findById(candidateId);
  if (!profile) throw ApiError.notFound('Candidate not found.');

  const access = await resolveCandidateAccess(profile, companyId);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  await SavedCandidate.updateOne(
    { companyId, candidateId },
    { $setOnInsert: { companyId, candidateId, savedByUserId: actorUserId } },
    { upsert: true },
  );

  recordAuditEvent({
    actorCompanyId: companyId,
    actorUserId,
    action: AUDIT_ACTIONS.CANDIDATE_SAVED,
    targetType: AUDIT_TARGET_TYPES.CANDIDATE_PROFILE,
    targetId: profile._id,
  });

  return { saved: true };
}

export async function unsaveCandidate(companyId, actorUserId, candidateId) {
  const result = await SavedCandidate.deleteOne({ companyId, candidateId });

  if (result.deletedCount > 0) {
    recordAuditEvent({
      actorCompanyId: companyId,
      actorUserId,
      action: AUDIT_ACTIONS.CANDIDATE_UNSAVED,
      targetType: AUDIT_TARGET_TYPES.CANDIDATE_PROFILE,
      targetId: candidateId,
    });
  }

  return { saved: false };
}

/** The shortlist. Rows whose candidate is no longer visible are dropped, not shown as blanks. */
export async function listSavedCandidates(companyId) {
  const saved = await SavedCandidate.find({ companyId }).sort({ createdAt: -1 });

  const profiles = await CandidateProfile.find({
    _id: { $in: saved.map((row) => row.candidateId) },
  });
  const byId = new Map(profiles.map((profile) => [String(profile._id), profile]));

  const activeEntries = await PipelineEntry.find({
    companyId,
    candidateId: { $in: saved.map((row) => row.candidateId) },
    active: true,
  }).select('candidateId stage');
  const inPipeline = new Map(
    activeEntries.map((entry) => [String(entry.candidateId), entry.stage]),
  );

  const rows = await Promise.all(
    saved.map(async (row) => {
      const profile = byId.get(String(row.candidateId));
      if (!profile) return null;

      const candidate = await candidateCard(profile, companyId);
      if (!candidate) return null;

      return {
        id: String(row._id),
        savedAt: row.createdAt,
        candidate,
        /** Lets the shortlist show "already in Reviewing" instead of offering a duplicate add. */
        pipelineStage: inPipeline.get(String(row.candidateId)) ?? null,
      };
    }),
  );

  return { saved: rows.filter(Boolean) };
}

/** Which of these candidates this company has saved — for search-result star states. */
export async function savedCandidateIds(companyId, candidateIds) {
  if (!candidateIds?.length) return new Set();
  const rows = await SavedCandidate.find({ companyId, candidateId: { $in: candidateIds } })
    .select('candidateId')
    .lean();
  return new Set(rows.map((row) => String(row.candidateId)));
}

/** Which of these candidates already sit in an active pipeline entry. */
export async function pipelineStagesFor(companyId, candidateIds) {
  if (!candidateIds?.length) return new Map();
  const rows = await PipelineEntry.find({
    companyId,
    candidateId: { $in: candidateIds },
    active: true,
  })
    .select('candidateId stage')
    .lean();
  return new Map(rows.map((row) => [String(row.candidateId), row.stage]));
}
