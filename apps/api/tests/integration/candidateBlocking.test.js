/**
 * CAN-04 — blocking a company (PRD §4.3, §16.1).
 *
 * The endpoints existed and were correct; nothing in the product could reach the block one, so the
 * behaviour behind it had never been exercised end to end. These tests pin BOTH halves:
 *
 *   1. the write path — block, block again, unblock, and the ways it must refuse
 *   2. the consequence — that `candidateAccess.service`, the single authority, then excludes the
 *      company from search, the viewer, the pipeline and messaging
 *
 * Point 2 matters more than point 1. A block that records itself but does not take effect is the
 * privacy defect PRD §16.1 exists to prevent, and it would look completely fine in the UI.
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { Conversation } from '../../src/modules/messaging/conversation.model.js';
import { Message } from '../../src/modules/messaging/message.model.js';

let server;
let baseUrl;

const CANDIDATE = 'blk-candidate@example.com';
const OWNER_A = 'blk-owner-a@example.com';
const OWNER_B = 'blk-owner-b@example.com';
const ALL_EMAILS = [CANDIDATE, OWNER_A, OWNER_B];
const PASSWORD = 'Password123';
const COMPANY_A = 'Blocked Academy';
const COMPANY_B = 'Allowed Academy';

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
const authDelete = authSend('DELETE');

const bodyOf = async (res) => (await res.json()).data;

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

let candidate;
let profile;
let ownerA;
let ownerB;
let companyA;
let companyB;

before(async () => {
  await connectDatabase();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/**
 * Removes this suite's fixtures. Run before EACH test for isolation, and again after the LAST
 * one — otherwise the two published companies survive in the shared `evallo-recruit` database
 * and show up in the public company directory, which is a real product surface.
 */
async function removeFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } }).select('_id');
  const userIds = users.map((u) => u._id);
  const profiles = await CandidateProfile.find({ userId: { $in: userIds } }).select('_id');
  const profileIds = profiles.map((p) => p._id);

  const conversations = await Conversation.find({ candidateId: { $in: profileIds } }).select('_id');

  await Promise.all([
    Message.deleteMany({ conversationId: { $in: conversations.map((c) => c._id) } }),
    Conversation.deleteMany({ candidateId: { $in: profileIds } }),
    CandidateProfile.deleteMany({ userId: { $in: userIds } }),
    CompanyMember.deleteMany({ userId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
  ]);
  await Company.deleteMany({ name: { $in: [COMPANY_A, COMPANY_B] } });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await removeFixtures();
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  await removeFixtures();

  candidate = await onboard(CANDIDATE, {
    name: 'Blocked Candidate',
    location: { country: 'IN', region: 'Bengaluru', timezone: 'Asia/Kolkata' },
  });

  profile = await CandidateProfile.create({
    userId: candidate.user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    publishedAt: new Date(),
    headline: 'IB physics teacher',
    targetRoles: ['school_teacher'],
    subjects: ['physics'],
    yearsExperience: 9,
  });

  ownerA = await onboard(OWNER_A, { name: 'Owner A' });
  ownerB = await onboard(OWNER_B, { name: 'Owner B' });

  companyA = await bodyOf(
    await authPost('/api/companies', ownerA.accessToken, {
      name: COMPANY_A,
      organizationType: 'tutoring_center',
      location: { country: 'IN', city: 'Bengaluru' },
    }),
  );
  companyB = await bodyOf(
    await authPost('/api/companies', ownerB.accessToken, {
      name: COMPANY_B,
      organizationType: 'tutoring_center',
      location: { country: 'IN', city: 'Bengaluru' },
    }),
  );

  // Both companies must be published for the candidate-facing relationship endpoint to resolve.
  await Company.updateMany(
    { _id: { $in: [companyA.id, companyB.id] } },
    { $set: { status: 'published', publishedAt: new Date() } },
  );
});

/* ── the write path ─────────────────────────────────────────────────────────────────────────── */

describe('POST /api/me/candidate-profile/blocked-companies', () => {
  test('blocks a company and returns the refreshed list', async () => {
    const res = await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });

    assert.equal(res.status, 200);
    const blocked = await bodyOf(res);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].companyId, companyA.id);
    assert.equal(blocked[0].name, COMPANY_A);
    // The client renders from this payload, so the display fields must be present.
    assert.ok('slug' in blocked[0] && 'logoUrl' in blocked[0]);
  });

  test('is idempotent — blocking twice does not duplicate the entry', async () => {
    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });
    const second = await authPost(
      '/api/me/candidate-profile/blocked-companies',
      candidate.accessToken,
      { companyId: companyA.id },
    );

    assert.equal(second.status, 200);
    assert.equal((await bodyOf(second)).length, 1);

    const stored = await CandidateProfile.findById(profile._id).lean();
    assert.equal(stored.blockedCompanyIds.length, 1);
  });

  test('blocks several companies independently', async () => {
    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });
    const res = await authPost(
      '/api/me/candidate-profile/blocked-companies',
      candidate.accessToken,
      { companyId: companyB.id },
    );

    const blocked = await bodyOf(res);
    assert.equal(blocked.length, 2);
  });

  test('rejects a company id that does not exist', async () => {
    const res = await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: '0123456789abcdef01234567',
    });
    assert.equal(res.status, 404);
  });

  test('rejects a malformed company id with a field error', async () => {
    const res = await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: 'not-an-object-id',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  });

  test('rejects a missing company id', async () => {
    const res = await authPost(
      '/api/me/candidate-profile/blocked-companies',
      candidate.accessToken,
      {},
    );
    assert.equal(res.status, 400);
  });

  test('SECURITY: refuses an unauthenticated request', async () => {
    const res = await jsonPost('/api/me/candidate-profile/blocked-companies', {
      companyId: companyA.id,
    });
    assert.equal(res.status, 401);
  });

  test('a user with no candidate profile cannot block', async () => {
    const res = await authPost('/api/me/candidate-profile/blocked-companies', ownerB.accessToken, {
      companyId: companyA.id,
    });
    assert.ok(res.status >= 400, `expected a refusal, got ${res.status}`);
  });

  test("blocking a company the candidate is a member of is allowed — it is their own visibility", async () => {
    await CompanyMember.create({
      companyId: companyA.id,
      userId: candidate.user._id,
      role: COMPANY_ROLES.RECRUITER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      acceptedAt: new Date(),
    });

    const res = await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });
    assert.equal(res.status, 200);
  });
});

describe('DELETE /api/me/candidate-profile/blocked-companies/:companyId', () => {
  test('unblocks and returns the remaining list', async () => {
    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });
    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyB.id,
    });

    const res = await authDelete(
      `/api/me/candidate-profile/blocked-companies/${companyA.id}`,
      candidate.accessToken,
    );

    assert.equal(res.status, 200);
    const remaining = await bodyOf(res);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].companyId, companyB.id);
  });

  test('unblocking something that was never blocked is a no-op, not an error', async () => {
    const res = await authDelete(
      `/api/me/candidate-profile/blocked-companies/${companyA.id}`,
      candidate.accessToken,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await bodyOf(res), []);
  });

  test('SECURITY: refuses an unauthenticated request', async () => {
    const res = await fetch(
      `${baseUrl}/api/me/candidate-profile/blocked-companies/${companyA.id}`,
      { method: 'DELETE' },
    );
    assert.equal(res.status, 401);
  });
});

/* ── what a block actually does ─────────────────────────────────────────────────────────────── */

describe('a block takes effect through candidateAccess.service', () => {
  async function block(companyId) {
    const res = await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId,
    });
    assert.equal(res.status, 200);
  }

  test('the blocked company can no longer find the candidate in search', async () => {
    const before = await authGet(
      `/api/companies/${companyA.id}/search/candidates?limit=50`,
      ownerA.accessToken,
    );
    const beforeIds = (await bodyOf(before)).candidates.map((c) => c.id);
    assert.ok(beforeIds.includes(String(profile._id)), 'precondition: candidate is discoverable');

    await block(companyA.id);

    const after = await authGet(
      `/api/companies/${companyA.id}/search/candidates?limit=50`,
      ownerA.accessToken,
    );
    const afterIds = (await bodyOf(after)).candidates.map((c) => c.id);
    assert.ok(!afterIds.includes(String(profile._id)), 'blocked company still sees the candidate');
  });

  test('another company is unaffected', async () => {
    await block(companyA.id);

    const res = await authGet(
      `/api/companies/${companyB.id}/search/candidates?limit=50`,
      ownerB.accessToken,
    );
    const ids = (await bodyOf(res)).candidates.map((c) => c.id);
    assert.ok(ids.includes(String(profile._id)), 'a block must not affect other companies');
  });

  test('the blocked company cannot open the candidate viewer', async () => {
    await block(companyA.id);

    const res = await authGet(
      `/api/companies/${companyA.id}/candidates/${profile._id}`,
      ownerA.accessToken,
    );
    // Indistinguishable from "no such candidate" — PRD §16.1 forbids confirming existence.
    assert.equal(res.status, 404);
  });

  test('the blocked company cannot add the candidate to its pipeline', async () => {
    await block(companyA.id);

    const res = await authPost(`/api/companies/${companyA.id}/pipeline`, ownerA.accessToken, {
      candidateId: String(profile._id),
      stage: 'sourced',
    });
    assert.equal(res.status, 404);
  });

  test('the blocked company cannot start a conversation', async () => {
    await block(companyA.id);

    const res = await authPost(`/api/companies/${companyA.id}/conversations`, ownerA.accessToken, {
      candidateId: String(profile._id),
      body: 'Are you available?',
    });
    assert.equal(res.status, 404);
  });

  test('unblocking restores access', async () => {
    await block(companyA.id);
    await authDelete(
      `/api/me/candidate-profile/blocked-companies/${companyA.id}`,
      candidate.accessToken,
    );

    const res = await authGet(
      `/api/companies/${companyA.id}/candidates/${profile._id}`,
      ownerA.accessToken,
    );
    assert.equal(res.status, 200);
  });
});

/* ── the state the UI renders from ──────────────────────────────────────────────────────────── */

describe('GET /api/me/companies/:slug/relationship reports block state', () => {
  test('reports blocked:false before, and blocked:true after', async () => {
    const company = await Company.findById(companyA.id).lean();

    const before = await bodyOf(
      await authGet(`/api/me/companies/${company.slug}/relationship`, candidate.accessToken),
    );
    assert.equal(before.blocked, false);
    assert.equal(before.companyId, companyA.id);

    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });

    const after = await bodyOf(
      await authGet(`/api/me/companies/${company.slug}/relationship`, candidate.accessToken),
    );
    assert.equal(after.blocked, true);
  });
});

describe('GET /api/me/candidate-profile/visibility lists blocked companies', () => {
  test('the blocked company appears in the settings list', async () => {
    await authPost('/api/me/candidate-profile/blocked-companies', candidate.accessToken, {
      companyId: companyA.id,
    });

    const data = await bodyOf(
      await authGet('/api/me/candidate-profile/visibility', candidate.accessToken),
    );

    assert.equal(data.blockedCompanies.length, 1);
    // `companyId` is the key the settings pages unblock with — pinned, because using `id` here
    // silently produced a 400 on every unblock attempt.
    assert.equal(data.blockedCompanies[0].companyId, companyA.id);
    assert.equal(data.blockedCompanies[0].id, undefined);
  });
});
