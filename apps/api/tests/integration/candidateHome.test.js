/**
 * CAN-01 — candidate home.
 *
 * CAN-01 adds no endpoint: it is rendered from `GET /api/me/candidate-profile`, which now also
 * returns the completeness and pending actions derived from the profile. These tests pin that
 * contract, the capability gate, and the guarantee that an overview screen writes nothing.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const EMAIL = 'candidate-home@example.com';
const PASSWORD = 'Password123';

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

const authPost = (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });

/** Real AUTH-01 → AUTH-03 chain, so the account reaches CAN-01 exactly as a user would. */
async function onboard() {
  await jsonPost('/api/auth/signup', { email: EMAIL });

  const user = await User.findOne({ email: EMAIL });
  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
    email: EMAIL,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const verified = await jsonPost('/api/auth/verify-email', { token: raw });
  const { setupToken } = (await verified.json()).data;

  const res = await jsonPost('/api/auth/set-password', {
    token: setupToken,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  return { accessToken: (await res.json()).data.accessToken, userId: user._id };
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/** One cleanup used by BOTH hooks — an `after` that cleans less than `beforeEach` leaves orphans. */
async function cleanupFixtures() {
  const existing = await User.findOne({ email: EMAIL });
  if (existing) {
    await CandidateProfile.deleteMany({ userId: existing._id });
    await Session.deleteMany({ userId: existing._id });
    await VerificationToken.deleteMany({ userId: existing._id });
  }
  await User.deleteMany({ email: EMAIL });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('CAN-01 capability gate', () => {
  test('a user with no candidate profile gets 404, not an empty overview', async () => {
    const { accessToken } = await onboard();

    const res = await authGet('/api/me/candidate-profile', accessToken);
    assert.equal(res.status, 404);
  });

  test('rejects an unauthenticated request', async () => {
    const res = await fetch(`${baseUrl}/api/me/candidate-profile`);
    assert.equal(res.status, 401);
  });
});

describe('CAN-01 overview payload', () => {
  test('a brand-new candidate gets 0% completeness and every section listed', async () => {
    const { accessToken } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    const body = await (await authGet('/api/me/candidate-profile', accessToken)).json();
    const { profile, completeness } = body.data;

    assert.equal(profile.status, CANDIDATE_VISIBILITY.DRAFT, 'new profiles start as a draft');
    assert.equal(completeness.percent, 0);
    assert.equal(completeness.completed, 0);
    assert.ok(completeness.total > 0);
    assert.equal(completeness.sections.length, completeness.total);
    assert.ok(completeness.sections.every((s) => s.complete === false));
  });

  test('completeness reflects the sections actually filled in', async () => {
    const { accessToken, userId } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    await CandidateProfile.updateOne(
      { userId },
      { $set: { headline: 'IB Physics teacher', subjects: ['physics'] } },
    );

    const body = await (await authGet('/api/me/candidate-profile', accessToken)).json();
    const { completeness } = body.data;
    const byKey = Object.fromEntries(completeness.sections.map((s) => [s.key, s.complete]));

    assert.equal(completeness.completed, 2);
    assert.equal(byKey.headline, true);
    assert.equal(byKey.subjects, true);
    assert.equal(byKey.summary, false);
    assert.equal(byKey.targetRoles, false);
  });

  test('pending actions name the missing sections, and never a hidden score', async () => {
    const { accessToken } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    const body = await (await authGet('/api/me/candidate-profile', accessToken)).json();
    const { nextSteps } = body.data;

    // PRD §18.3: guidance from missing structured data, not opaque scoring.
    assert.ok(nextSteps.length > 0);
    assert.ok(nextSteps.every((s) => s.title && s.description && s.target));
    assert.ok(
      nextSteps.some((s) => s.key === 'choose-visibility'),
      'a draft profile is prompted to choose visibility',
    );
  });

  test('a fully filled, discoverable profile has nothing pending', async () => {
    const { accessToken, userId } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    await CandidateProfile.updateOne(
      { userId },
      {
        $set: {
          headline: 'IB Physics teacher',
          summary: 'Ten years teaching IB and A-level physics.',
          targetRoles: ['teacher'],
          subjects: ['physics'],
          status: CANDIDATE_VISIBILITY.DISCOVERABLE,
        },
      },
    );

    const body = await (await authGet('/api/me/candidate-profile', accessToken)).json();

    assert.equal(body.data.completeness.percent, 100);
    assert.deepEqual(body.data.nextSteps, []);
  });

  test('a paused profile is prompted to resume, not to pick a visibility', async () => {
    const { accessToken, userId } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});
    await CandidateProfile.updateOne(
      { userId },
      { $set: { status: CANDIDATE_VISIBILITY.PAUSED } },
    );

    const body = await (await authGet('/api/me/candidate-profile', accessToken)).json();
    const keys = body.data.nextSteps.map((s) => s.key);

    assert.ok(keys.includes('resume-visibility'));
    assert.ok(!keys.includes('choose-visibility'));
  });

  test('never leaks another user`s profile or internal fields', async () => {
    const { accessToken } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    const serialised = JSON.stringify(
      await (await authGet('/api/me/candidate-profile', accessToken)).json(),
    );

    assert.ok(!serialised.includes('userId'), 'owner view exposes no user id');
    assert.ok(!serialised.includes('blockedCompanyIds'));
  });
});

describe('CAN-01 creates nothing', () => {
  test('reading the overview repeatedly does not create or duplicate a profile', async () => {
    const { accessToken, userId } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    await authGet('/api/me/candidate-profile', accessToken);
    await authGet('/api/me/candidate-profile', accessToken);

    assert.equal(await CandidateProfile.countDocuments({ userId }), 1);
  });

  test('creating a profile is idempotent — 201 first, 200 after', async () => {
    const { accessToken, userId } = await onboard();

    const first = await authPost('/api/me/candidate-profile', accessToken, {});
    const second = await authPost('/api/me/candidate-profile', accessToken, {});

    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(await CandidateProfile.countDocuments({ userId }), 1);
  });

  test('the candidate capability does not grant a company one (ADR-001)', async () => {
    const { accessToken } = await onboard();
    await authPost('/api/me/candidate-profile', accessToken, {});

    const me = await (await authGet('/api/me', accessToken)).json();

    assert.equal(me.data.capabilities.hasCandidateProfile, true);
    assert.deepEqual(me.data.capabilities.companies, []);
    assert.ok(!('role' in me.data.user), 'still no global role');
  });
});
