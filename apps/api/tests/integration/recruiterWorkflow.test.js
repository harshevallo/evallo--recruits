/**
 * REC-05/16 hiring intents · REC-14 pipeline and shortlist · notes · REC-15 company messaging.
 *
 * The behaviours pinned here are the ones PRD §21.4 and §11.4 make non-negotiable, because each
 * one is a rule a future refactor could quietly drop:
 *
 *   · only an ACTIVE intent accepts interest, and an empty intent cannot be activated (§7.5, §21.5)
 *   · closing an intent PRESERVES its pipeline entries (§11.4)
 *   · a stage change records who made it (§21.4 "with audit history")
 *   · rejecting REQUIRES a reason code; hiring requires the role (§21.4)
 *   · one ACTIVE pipeline entry per candidate per company (§4.1)
 *   · a candidate rejected once may be re-added (§21.4)
 *   · internal notes are unreachable from the candidate surface (§11.2, §21.4)
 *   · shortlist, pipeline, notes and messaging all refuse a candidate the company may not see (§16.1)
 *   · a second message continues the thread rather than forking it (05_DATABASE_SCHEMA §9)
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  HIRING_INTENT_STATUS,
  PIPELINE_STAGES,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { PipelineEntry } from '../../src/modules/pipeline/pipelineEntry.model.js';
import { SavedCandidate } from '../../src/modules/pipeline/savedCandidate.model.js';
import { Note } from '../../src/modules/notes/note.model.js';
import { Conversation } from '../../src/modules/messaging/conversation.model.js';
import { Message } from '../../src/modules/messaging/message.model.js';
import { AuditEvent } from '../../src/modules/audit/auditEvent.model.js';

let server;
let baseUrl;

const OWNER = 'rw-owner@example.com';
const VIEWER = 'rw-viewer@example.com';
const OUTSIDER = 'rw-outsider@example.com';
const CAND_OPEN = 'rw-cand-open@example.com';
const CAND_DRAFT = 'rw-cand-draft@example.com';
const PASSWORD = 'Password123';
const ALL_EMAILS = [OWNER, VIEWER, OUTSIDER, CAND_OPEN, CAND_DRAFT];

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

const authSend = (method) => (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const authPost = authSend('POST');
const authPatch = authSend('PATCH');
const authDelete = authSend('DELETE');

const bodyOf = async (res) => (await res.json()).data;
const errorOf = async (res) => (await res.json()).error;

async function onboard(email, patch = {}) {
  await jsonPost('/api/auth/signup', { email });

  const user = await User.findOne({ email });
  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const verified = await jsonPost('/api/auth/verify-email', { token: raw });
  const { setupToken } = (await verified.json()).data;
  const res = await jsonPost('/api/auth/set-password', {
    token: setupToken,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  if (Object.keys(patch).length) await User.findByIdAndUpdate(user._id, patch);

  return { accessToken: (await res.json()).data.accessToken, user };
}

/** A candidate at a given visibility. Draft is the fixture that must stay invisible. */
async function candidate(email, status) {
  const { accessToken, user } = await onboard(email, {
    name: 'Test Candidate',
    location: { country: 'IN', region: 'Bengaluru', timezone: 'Asia/Kolkata' },
  });

  const profile = await CandidateProfile.create({
    userId: user._id,
    status,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    publishedAt: status === CANDIDATE_VISIBILITY.DISCOVERABLE ? new Date() : null,
    headline: 'SAT maths tutor',
    targetRoles: ['test_prep_tutor'],
    subjects: ['mathematics'],
    yearsExperience: 8,
  });

  return { accessToken, user, profile };
}

let owner;
let viewerToken;
let outsiderToken;
let company;
let open;
let draft;

before(async () => {
  await connectDatabase();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  // Exact cleanup: this suite asserts on totals, so leftovers from a previous run would drift them.
  const users = await User.find({ email: { $in: ALL_EMAILS } }).select('_id');
  const userIds = users.map((u) => u._id);
  const profiles = await CandidateProfile.find({ userId: { $in: userIds } }).select('_id');
  const profileIds = profiles.map((p) => p._id);

  await Promise.all([
    PipelineEntry.deleteMany({ candidateId: { $in: profileIds } }),
    SavedCandidate.deleteMany({ candidateId: { $in: profileIds } }),
    Note.deleteMany({ candidateId: { $in: profileIds } }),
    Conversation.deleteMany({ candidateId: { $in: profileIds } }),
    AuditEvent.deleteMany({ actorUserId: { $in: userIds } }),
    CandidateProfile.deleteMany({ userId: { $in: userIds } }),
    CompanyMember.deleteMany({ userId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
  ]);
  await Company.deleteMany({ name: 'Workflow Academy' });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });

  owner = await onboard(OWNER);
  const created = await authPost('/api/companies', owner.accessToken, {
    name: 'Workflow Academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  company = await bodyOf(created);

  const viewer = await onboard(VIEWER);
  viewerToken = viewer.accessToken;
  await CompanyMember.create({
    companyId: company.id,
    userId: viewer.user._id,
    role: COMPANY_ROLES.VIEWER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });

  outsiderToken = (await onboard(OUTSIDER)).accessToken;

  open = await candidate(CAND_OPEN, CANDIDATE_VISIBILITY.DISCOVERABLE);
  draft = await candidate(CAND_DRAFT, CANDIDATE_VISIBILITY.DRAFT);
});

/* ── hiring intents ─────────────────────────────────────────────────────────────────────────── */

describe('REC-16 hiring intents (PRD §7.5)', () => {
  test('a hiring intent needs no description — role, engagement and delivery are enough', async () => {
    const res = await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
      roleCategories: ['test_prep_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });
    assert.equal(res.status, 201);

    const { intent } = await bodyOf(res);
    assert.equal(intent.status, HIRING_INTENT_STATUS.DRAFT);
    assert.equal(intent.description, null);

    const activated = await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.ACTIVE },
    );
    assert.equal(activated.status, 200);
    assert.equal((await bodyOf(activated)).intent.status, HIRING_INTENT_STATUS.ACTIVE);
  });

  test('only an active intent accepts interest', async () => {
    const { intent } = await bodyOf(
      await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
        roleCategories: ['test_prep_tutor'],
        employmentTypes: ['part_time'],
        deliveryModes: ['remote'],
      }),
    );

    assert.equal(intent.acceptsInterest, false, 'a draft must not accept interest');

    const active = await bodyOf(
      await authPatch(
        `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
        owner.accessToken,
        { status: HIRING_INTENT_STATUS.ACTIVE },
      ),
    );
    assert.equal(active.intent.acceptsInterest, true);

    const paused = await bodyOf(
      await authPatch(
        `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
        owner.accessToken,
        { status: HIRING_INTENT_STATUS.PAUSED },
      ),
    );
    assert.equal(paused.intent.acceptsInterest, false, 'a paused intent stops accepting interest');
  });

  test('an under-declared intent cannot be activated, and archived is terminal', async () => {
    /*
     * `roleCategories` is required by the model at creation, so the half-finished draft this tests
     * is one that HAS roles but has not yet said how it engages people or where they work.
     */
    const bare = await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
      title: 'Nothing declared',
    });
    assert.equal(bare.status, 400, 'an intent with no role category is refused outright');

    const { intent } = await bodyOf(
      await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
        title: 'Roles only',
        roleCategories: ['test_prep_tutor'],
      }),
    );

    const refused = await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.ACTIVE },
    );
    assert.equal(refused.status, 400);
    assert.match((await errorOf(refused)).details.status, /employment type|delivery mode/);

    await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.ARCHIVED },
    );

    const reopen = await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.ACTIVE },
    );
    assert.equal(reopen.status, 400, 'archived is terminal');
  });

  test('at most three interest questions — PRD §7.5 is a hard cap', async () => {
    const res = await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
      roleCategories: ['test_prep_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
      interestQuestions: [{ prompt: 'a' }, { prompt: 'b' }, { prompt: 'c' }, { prompt: 'd' }],
    });
    assert.equal(res.status, 400);
  });

  test('a viewer may read intents but not write them', async () => {
    assert.equal((await authGet(`/api/companies/${company.id}/hiring-intents`, viewerToken)).status, 200);

    const refused = await authPost(`/api/companies/${company.id}/hiring-intents`, viewerToken, {
      roleCategories: ['test_prep_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });
    assert.equal(refused.status, 403);
  });

  test('closing an intent preserves its pipeline entries — PRD §11.4', async () => {
    const { intent } = await bodyOf(
      await authPost(`/api/companies/${company.id}/hiring-intents`, owner.accessToken, {
        roleCategories: ['test_prep_tutor'],
        employmentTypes: ['part_time'],
        deliveryModes: ['remote'],
      }),
    );
    await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.ACTIVE },
    );

    await authPost(`/api/companies/${company.id}/pipeline`, owner.accessToken, {
      candidateId: String(open.profile._id),
      roleIntentIds: [intent.id],
    });

    await authPatch(
      `/api/companies/${company.id}/hiring-intents/${intent.id}/status`,
      owner.accessToken,
      { status: HIRING_INTENT_STATUS.CLOSED, reason: 'Filled' },
    );

    const board = await bodyOf(await authGet(`/api/companies/${company.id}/pipeline`, owner.accessToken));
    assert.equal(board.total, 1, 'the entry survives its intent closing');
  });
});

/* ── shortlist ──────────────────────────────────────────────────────────────────────────────── */

describe('Shortlist (PRD §21.4)', () => {
  test('saving is idempotent and never creates a second row', async () => {
    const first = await authPost(`/api/companies/${company.id}/saved-candidates`, owner.accessToken, {
      candidateId: String(open.profile._id),
    });
    assert.equal(first.status, 201);

    await authPost(`/api/companies/${company.id}/saved-candidates`, owner.accessToken, {
      candidateId: String(open.profile._id),
    });

    const list = await bodyOf(
      await authGet(`/api/companies/${company.id}/saved-candidates`, owner.accessToken),
    );
    assert.equal(list.saved.length, 1);
    assert.equal(await SavedCandidate.countDocuments({ companyId: company.id }), 1);
  });

  test('unsaving removes it', async () => {
    await authPost(`/api/companies/${company.id}/saved-candidates`, owner.accessToken, {
      candidateId: String(open.profile._id),
    });
    await authDelete(
      `/api/companies/${company.id}/saved-candidates/${open.profile._id}`,
      owner.accessToken,
    );

    const list = await bodyOf(
      await authGet(`/api/companies/${company.id}/saved-candidates`, owner.accessToken),
    );
    assert.equal(list.saved.length, 0);
  });

  test('a candidate the company cannot see cannot be saved', async () => {
    const res = await authPost(`/api/companies/${company.id}/saved-candidates`, owner.accessToken, {
      candidateId: String(draft.profile._id),
    });
    assert.equal(res.status, 404, 'absent and forbidden are indistinguishable — PRD §16.1');
    assert.equal(await SavedCandidate.countDocuments({ companyId: company.id }), 0);
  });

  test('an outsider cannot save into a company they do not belong to', async () => {
    const res = await authPost(`/api/companies/${company.id}/saved-candidates`, outsiderToken, {
      candidateId: String(open.profile._id),
    });
    assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
  });
});

/* ── pipeline ───────────────────────────────────────────────────────────────────────────────── */

describe('REC-14 pipeline (PRD §7.9, §21.4)', () => {
  const add = () =>
    authPost(`/api/companies/${company.id}/pipeline`, owner.accessToken, {
      candidateId: String(open.profile._id),
    });

  test('adding records the opening stage in history', async () => {
    const { entry } = await bodyOf(await add());
    assert.equal(entry.stage, PIPELINE_STAGES.SOURCED);
    assert.equal(entry.stageHistory.length, 1);
    assert.equal(entry.stageHistory[0].to, PIPELINE_STAGES.SOURCED);
  });

  test('one active entry per candidate per company — PRD §4.1', async () => {
    const first = await bodyOf(await add());
    const second = await bodyOf(await add());

    assert.equal(second.entry.id, first.entry.id, 'the same entry comes back, not a duplicate');
    assert.equal(
      await PipelineEntry.countDocuments({ companyId: company.id, active: true }),
      1,
    );
  });

  test('a stage change records who made it', async () => {
    const { entry } = await bodyOf(await add());
    const moved = await bodyOf(
      await authPatch(
        `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
        owner.accessToken,
        { stage: PIPELINE_STAGES.REVIEWING },
      ),
    );

    assert.equal(moved.entry.stage, PIPELINE_STAGES.REVIEWING);
    assert.equal(moved.entry.stageHistory.length, 2);

    const last = moved.entry.stageHistory[1];
    assert.equal(last.from, PIPELINE_STAGES.SOURCED);
    assert.equal(last.actorUserId, String(owner.user._id));

    const audited = await AuditEvent.countDocuments({
      actorCompanyId: company.id,
      action: 'pipeline_entry.stage_changed',
    });
    assert.equal(audited, 1, 'PRD §21.4 requires the change to be auditable');
  });

  test('rejecting requires a reason code', async () => {
    const { entry } = await bodyOf(await add());

    const refused = await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      owner.accessToken,
      { stage: PIPELINE_STAGES.REJECTED },
    );
    assert.equal(refused.status, 400);
    assert.ok((await errorOf(refused)).details.reasonCode);

    const accepted = await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      owner.accessToken,
      { stage: PIPELINE_STAGES.REJECTED, reasonCode: 'role_filled', note: 'internal only' },
    );
    assert.equal(accepted.status, 200);

    const { entry: rejected } = await bodyOf(accepted);
    assert.equal(rejected.outcome.rejectionReason, 'role_filled');
    assert.equal(rejected.active, false, 'rejection closes the entry');
  });

  test('recording a hire requires the role', async () => {
    const { entry } = await bodyOf(await add());

    const refused = await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      owner.accessToken,
      { stage: PIPELINE_STAGES.HIRED },
    );
    assert.equal(refused.status, 400);

    const hired = await bodyOf(
      await authPatch(
        `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
        owner.accessToken,
        {
          stage: PIPELINE_STAGES.HIRED,
          outcome: { roleTitle: 'SAT maths tutor', startDate: '2026-09' },
        },
      ),
    );
    assert.equal(hired.entry.outcome.roleTitle, 'SAT maths tutor');
    assert.equal(hired.entry.active, false);
  });

  test('a rejected candidate can be added again — PRD §21.4', async () => {
    const { entry } = await bodyOf(await add());
    await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      owner.accessToken,
      { stage: PIPELINE_STAGES.REJECTED, reasonCode: 'role_filled' },
    );

    const again = await add();
    assert.equal(again.status, 201);
    assert.notEqual((await bodyOf(again)).entry.id, entry.id, 'a fresh entry, not the closed one');
  });

  test('closed entries are hidden from the board unless asked for', async () => {
    const { entry } = await bodyOf(await add());
    await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      owner.accessToken,
      { stage: PIPELINE_STAGES.REJECTED, reasonCode: 'no_response' },
    );

    const live = await bodyOf(await authGet(`/api/companies/${company.id}/pipeline`, owner.accessToken));
    assert.equal(live.total, 0);

    const all = await bodyOf(
      await authGet(`/api/companies/${company.id}/pipeline?includeClosed=true`, owner.accessToken),
    );
    assert.equal(all.total, 1);
  });

  test('next action and interview detail persist', async () => {
    const { entry } = await bodyOf(await add());
    const saved = await bodyOf(
      await authPatch(`/api/companies/${company.id}/pipeline/${entry.id}`, owner.accessToken, {
        nextAction: 'Call Thursday',
        interview: { feedback: 'Strong on diagnostics' },
      }),
    );

    assert.equal(saved.entry.nextAction, 'Call Thursday');
    assert.equal(saved.entry.interview.feedback, 'Strong on diagnostics');

    const reread = await bodyOf(
      await authGet(`/api/companies/${company.id}/pipeline/${entry.id}`, owner.accessToken),
    );
    assert.equal(reread.entry.nextAction, 'Call Thursday', 'it survives a re-read');
  });

  test('assignment must be an active member of this company', async () => {
    const { entry } = await bodyOf(await add());

    const refused = await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/owner`,
      owner.accessToken,
      { ownerId: String((await User.findOne({ email: OUTSIDER }))._id) },
    );
    assert.equal(refused.status, 400);

    const assigned = await bodyOf(
      await authPatch(
        `/api/companies/${company.id}/pipeline/${entry.id}/owner`,
        owner.accessToken,
        { ownerId: String((await User.findOne({ email: VIEWER }))._id) },
      ),
    );
    assert.equal(assigned.entry.ownerId, String((await User.findOne({ email: VIEWER }))._id));
  });

  test('an invisible candidate cannot be added', async () => {
    const res = await authPost(`/api/companies/${company.id}/pipeline`, owner.accessToken, {
      candidateId: String(draft.profile._id),
    });
    assert.equal(res.status, 404);
  });

  test('a viewer cannot move anyone through the pipeline', async () => {
    const { entry } = await bodyOf(await add());
    const refused = await authPatch(
      `/api/companies/${company.id}/pipeline/${entry.id}/stage`,
      viewerToken,
      { stage: PIPELINE_STAGES.REVIEWING },
    );
    assert.equal(refused.status, 403);
  });
});

/* ── notes ──────────────────────────────────────────────────────────────────────────────────── */

describe('Internal notes (PRD §11.2, §21.4)', () => {
  test('notes are stored apart from messages and never reach the candidate surface', async () => {
    const created = await authPost(
      `/api/companies/${company.id}/candidates/${open.profile._id}/notes`,
      owner.accessToken,
      { body: 'Internal: negotiate rate' },
    );
    assert.equal(created.status, 201);

    // Structural, not filtered: the note is not a message at all.
    assert.equal(await Message.countDocuments({ body: /negotiate rate/ }), 0);
    assert.equal(await Note.countDocuments({ companyId: company.id }), 1);

    // The candidate's own surfaces must not contain it anywhere.
    const conversations = await authGet('/api/me/conversations', open.accessToken);
    assert.ok(!JSON.stringify(await conversations.json()).includes('negotiate rate'));

    const preview = await authGet('/api/me/candidate-profile/preview', open.accessToken);
    assert.ok(!JSON.stringify(await preview.json()).includes('negotiate rate'));
  });

  test('an empty note is refused', async () => {
    const res = await authPost(
      `/api/companies/${company.id}/candidates/${open.profile._id}/notes`,
      owner.accessToken,
      { body: '   ' },
    );
    assert.equal(res.status, 400);
  });

  test('only the author may remove a note', async () => {
    const { note } = await bodyOf(
      await authPost(
        `/api/companies/${company.id}/candidates/${open.profile._id}/notes`,
        owner.accessToken,
        { body: 'Owner wrote this' },
      ),
    );

    // The viewer holds no note:write at all, so it cannot even attempt the delete.
    assert.equal(
      (await authDelete(`/api/companies/${company.id}/notes/${note.id}`, viewerToken)).status,
      403,
    );

    assert.equal(
      (await authDelete(`/api/companies/${company.id}/notes/${note.id}`, owner.accessToken)).status,
      200,
    );
    assert.equal(await Note.countDocuments({ companyId: company.id }), 0);
  });

  test('notes cannot be written about an invisible candidate', async () => {
    const res = await authPost(
      `/api/companies/${company.id}/candidates/${draft.profile._id}/notes`,
      owner.accessToken,
      { body: 'Should not exist' },
    );
    assert.equal(res.status, 404);
    assert.equal(await Note.countDocuments({ companyId: company.id }), 0);
  });
});

/* ── company messaging ──────────────────────────────────────────────────────────────────────── */

describe('REC-15 company messaging (PRD §11.2)', () => {
  test('a second message continues the thread rather than forking it', async () => {
    const first = await authPost(`/api/companies/${company.id}/conversations`, owner.accessToken, {
      candidateId: String(open.profile._id),
      body: 'Hello from Workflow Academy about our SAT role.',
    });
    assert.equal(first.status, 201);
    const { conversationId } = await bodyOf(first);

    const second = await bodyOf(
      await authPost(`/api/companies/${company.id}/conversations`, owner.accessToken, {
        candidateId: String(open.profile._id),
        body: 'Following up.',
      }),
    );
    assert.equal(second.conversationId, conversationId);
    assert.equal(await Conversation.countDocuments({ companyId: company.id }), 1);

    const thread = await bodyOf(
      await authGet(`/api/companies/${company.id}/conversations/${conversationId}`, owner.accessToken),
    );
    assert.equal(thread.messages.length, 2);
    assert.ok(thread.messages.every((message) => message.mine));
  });

  test('the candidate receives it and can reply, and unread counts are per side', async () => {
    const { conversationId } = await bodyOf(
      await authPost(`/api/companies/${company.id}/conversations`, owner.accessToken, {
        candidateId: String(open.profile._id),
        body: 'Are you available for evenings?',
      }),
    );

    const candidateList = await bodyOf(await authGet('/api/me/conversations', open.accessToken));
    assert.equal(candidateList.length, 1);
    assert.equal(candidateList[0].unread, 1, 'the candidate has one unread');

    await authPost(`/api/me/conversations/${conversationId}/messages`, open.accessToken, {
      body: 'Yes, Tuesdays and Thursdays.',
    });

    const companyList = await bodyOf(
      await authGet(`/api/companies/${company.id}/conversations`, owner.accessToken),
    );
    assert.equal(companyList.conversations[0].unread, 1, 'now the company has one unread');
    assert.equal(companyList.conversations[0].candidateState, 'accepted', 'replying accepts');

    // Opening it clears only the company's count.
    await authGet(`/api/companies/${company.id}/conversations/${conversationId}`, owner.accessToken);
    const after = await bodyOf(
      await authGet(`/api/companies/${company.id}/conversations`, owner.accessToken),
    );
    assert.equal(after.conversations[0].unread, 0);
  });

  test('an invisible candidate cannot be messaged', async () => {
    const res = await authPost(`/api/companies/${company.id}/conversations`, owner.accessToken, {
      candidateId: String(draft.profile._id),
      body: 'Hello?',
    });
    assert.equal(res.status, 404);
    assert.equal(await Conversation.countDocuments({ companyId: company.id }), 0);
  });

  test('a viewer cannot send, and an outsider cannot read the thread', async () => {
    const { conversationId } = await bodyOf(
      await authPost(`/api/companies/${company.id}/conversations`, owner.accessToken, {
        candidateId: String(open.profile._id),
        body: 'Opening message.',
      }),
    );

    assert.equal(
      (
        await authPost(
          `/api/companies/${company.id}/conversations/${conversationId}/messages`,
          viewerToken,
          { body: 'I should not be able to send this' },
        )
      ).status,
      403,
    );

    const outsider = await authGet(
      `/api/companies/${company.id}/conversations/${conversationId}`,
      outsiderToken,
    );
    assert.ok(outsider.status === 403 || outsider.status === 404, `got ${outsider.status}`);
  });
});
