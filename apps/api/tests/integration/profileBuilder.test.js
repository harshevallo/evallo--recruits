/**
 * CAN-02 — profile builder.
 *
 * The builder is driven by the question bank (ADR-007), so these tests pin the behaviours that
 * configuration cannot express on its own: section navigation data, partial saves, validation,
 * role-gated questions, and where each answer is stored.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_BANK_VERSION } from '../../src/modules/question-bank/questionBank.definition.js';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../../src/modules/candidates/candidateAnswer.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const EMAIL = 'builder-test@example.com';
const PASSWORD = 'Password123';

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
    body: JSON.stringify(body ?? {}),
  });

const authPost = authSend('POST');
const authPatch = authSend('PATCH');

async function onboardCandidate() {
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

  const accessToken = (await res.json()).data.accessToken;
  await authPost('/api/me/candidate-profile', accessToken, {});

  return { accessToken, userId: user._id };
}

const sectionByKey = (builder, key) => builder.sections.find((s) => s.key === key);

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/** One cleanup used by BOTH hooks — an `after` that cleans less than `beforeEach` leaves orphans. */
async function cleanupFixtures() {
  const existing = await User.findOne({ email: EMAIL });
  if (existing) {
    const profile = await CandidateProfile.findOne({ userId: existing._id });
    if (profile) await CandidateAnswer.deleteMany({ candidateId: profile._id });
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

describe('CAN-02 builder state', () => {
  test('returns ordered sections with questions, options and completion', async () => {
    const { accessToken } = await onboardCandidate();
    const body = await (await authGet('/api/me/candidate-profile/builder', accessToken)).json();
    const builder = body.data;

    assert.ok(builder.bankVersion >= 1, 'answers are stamped with a bank version (ADR-007)');
    assert.ok(builder.sections.length >= 3);

    const orders = builder.sections.map((s) => s.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'sections are ordered');

    const identity = sectionByKey(builder, 'professional_identity');
    assert.equal(identity.answered, 0);
    assert.equal(identity.complete, false);
    assert.ok(identity.questions.length > 0);

    const roles = sectionByKey(builder, 'role_preferences');
    const targetRoles = roles.questions.find((q) => q.key === 'targetRoles');
    assert.equal(targetRoles.type, 'multi_select');
    assert.ok(targetRoles.options.length > 0, 'select options are resolved server-side');
  });

  test('names what blocks publication instead of scoring it (PRD §8.5)', async () => {
    const { accessToken } = await onboardCandidate();
    const body = await (await authGet('/api/me/candidate-profile/builder', accessToken)).json();

    assert.ok(body.data.publishBlockers.length > 0);
    assert.ok(body.data.publishBlockers.every((b) => typeof b === 'string' && b.length > 0));
  });

  test('requires authentication and a candidate profile', async () => {
    assert.equal((await fetch(`${baseUrl}/api/me/candidate-profile/builder`)).status, 401);

    // Signed in, but no candidate profile yet.
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
    const token = (await res.json()).data.accessToken;

    assert.equal((await authGet('/api/me/candidate-profile/builder', token)).status, 404);
  });
});

describe('CAN-02 saving', () => {
  test('a partial section saves — drafts are never blocked (PRD §8.3)', async () => {
    const { accessToken } = await onboardCandidate();

    const res = await authPatch(
      '/api/me/candidate-profile/sections/professional_identity',
      accessToken,
      { values: { headline: 'IB Physics teacher' } },
    );
    const builder = (await res.json()).data;

    assert.equal(res.status, 200);
    const identity = sectionByKey(builder, 'professional_identity');
    assert.equal(identity.answered, 1);
    assert.equal(identity.complete, false, 'partial, but saved');
  });

  test('profile-backed answers land on the profile, others in candidateAnswers', async () => {
    const { accessToken, userId } = await onboardCandidate();

    await authPatch('/api/me/candidate-profile/sections/professional_identity', accessToken, {
      values: { headline: 'IB Physics teacher', summary: 'Ten years of IB physics.', pronouns: 'she/her' },
    });

    const profile = await CandidateProfile.findOne({ userId });
    assert.equal(profile.headline, 'IB Physics teacher', 'searchable field on the profile');
    assert.equal(profile.summary, 'Ten years of IB physics.');
    assert.equal(profile.bankVersion, QUESTION_BANK_VERSION);

    const answer = await CandidateAnswer.findOne({
      candidateId: profile._id,
      questionKey: 'pronouns',
    });
    assert.equal(answer.value, 'she/her');
    assert.equal(answer.bankVersion, QUESTION_BANK_VERSION, 'answers stay interpretable across rewordings');
  });

  test('re-answering updates in place rather than appending', async () => {
    const { accessToken, userId } = await onboardCandidate();
    const path = '/api/me/candidate-profile/sections/professional_identity';

    await authPatch(path, accessToken, { values: { pronouns: 'she/her' } });
    await authPatch(path, accessToken, { values: { pronouns: 'they/them' } });

    const profile = await CandidateProfile.findOne({ userId });
    const answers = await CandidateAnswer.find({ candidateId: profile._id, questionKey: 'pronouns' });

    assert.equal(answers.length, 1);
    assert.equal(answers[0].value, 'they/them');
  });

  test('rejects an out-of-vocabulary choice, keyed by question', async () => {
    const { accessToken } = await onboardCandidate();

    const res = await authPatch('/api/me/candidate-profile/sections/role_preferences', accessToken, {
      values: { targetRoles: ['not_a_real_role'] },
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(body.error.details.targetRoles, 'error binds to the field');
  });

  test('rejects text over the configured maximum', async () => {
    const { accessToken } = await onboardCandidate();

    const res = await authPatch(
      '/api/me/candidate-profile/sections/professional_identity',
      accessToken,
      { values: { headline: 'x'.repeat(300) } },
    );

    assert.equal(res.status, 400);
  });

  test('a section never half-saves when one answer is invalid', async () => {
    const { accessToken, userId } = await onboardCandidate();

    await authPatch('/api/me/candidate-profile/sections/professional_identity', accessToken, {
      values: { headline: 'Valid headline', summary: 's'.repeat(3000) },
    });

    const profile = await CandidateProfile.findOne({ userId });
    assert.ok(!profile.headline, 'the valid answer was not written either');
  });

  test('rejects an unknown section', async () => {
    const { accessToken } = await onboardCandidate();
    const res = await authPatch('/api/me/candidate-profile/sections/nope', accessToken, {
      values: {},
    });
    assert.equal(res.status, 404);
  });
});

describe('CAN-02 personal-layer answers (PRD §8.5, schema §2)', () => {
  test('country, region and languages are written to the USER, not the candidate profile', async () => {
    const { accessToken, userId } = await onboardCandidate();

    await authPatch('/api/me/candidate-profile/sections/professional_identity', accessToken, {
      values: { country: 'IN', region: 'Bengaluru, Karnataka', languages: ['en', 'hi'] },
    });

    const user = await User.findById(userId);
    assert.equal(user.location.country, 'IN', 'nested dot-path write');
    assert.equal(user.location.region, 'Bengaluru, Karnataka');
    assert.deepEqual([...user.languages], ['en', 'hi']);

    const profile = await CandidateProfile.findOne({ userId });
    assert.ok(!profile.get('location'), 'personal layer is NOT duplicated onto the profile');
    assert.ok(!profile.get('languages'));
  });

  test('reads personal-layer values back into the builder', async () => {
    const { accessToken } = await onboardCandidate();

    await authPatch('/api/me/candidate-profile/sections/professional_identity', accessToken, {
      values: { country: 'GB' },
    });

    const body = await (await authGet('/api/me/candidate-profile/builder', accessToken)).json();
    const identity = sectionByKey(body.data, 'professional_identity');
    const country = identity.questions.find((q) => q.key === 'country');

    assert.equal(country.value, 'GB');
    assert.ok(country.options.some((o) => o.value === 'GB'));
  });

  test('country and timezone block publication until answered (PRD §8.5)', async () => {
    const { accessToken } = await onboardCandidate();
    const body = await (await authGet('/api/me/candidate-profile/builder', accessToken)).json();

    assert.ok(
      body.data.publishBlockers.some((b) => /based/i.test(b)),
      'country is required for publication',
    );
    assert.ok(
      body.data.publishBlockers.some((b) => /time zone/i.test(b)),
      'time zone is required for publication',
    );
  });

  test('rejects a country outside the vocabulary', async () => {
    const { accessToken } = await onboardCandidate();
    const res = await authPatch(
      '/api/me/candidate-profile/sections/professional_identity',
      accessToken,
      { values: { country: 'ZZ' } },
    );
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.details.country);
  });
});

describe('CAN-02 location conditionality (Appendix C)', () => {
  test('the on-site question is hidden until on-site or hybrid is chosen', async () => {
    const { accessToken } = await onboardCandidate();

    let body = await (await authGet('/api/me/candidate-profile/builder', accessToken)).json();
    let roles = sectionByKey(body.data, 'role_preferences');
    assert.ok(
      !roles.questions.some((q) => q.key === 'onsiteCity'),
      'remote-only candidates are not asked commuting questions',
    );

    const res = await authPatch('/api/me/candidate-profile/sections/role_preferences', accessToken, {
      values: { deliveryModes: ['on_site'] },
    });
    roles = sectionByKey((await res.json()).data, 'role_preferences');

    assert.ok(roles.questions.some((q) => q.key === 'onsiteCity'), 'revealed by the choice');
  });
});

describe('CAN-02 role-gated questions (PRD §20.2)', () => {
  test('a role-specific question appears only once its role is selected', async () => {
    const { accessToken } = await onboardCandidate();

    let builder = (await (await authGet('/api/me/candidate-profile/builder', accessToken)).json()).data;
    let expertise = sectionByKey(builder, 'teaching_expertise');
    assert.ok(!expertise.questions.some((q) => q.key === 'testsPrepared'), 'hidden by default');

    const res = await authPatch('/api/me/candidate-profile/sections/role_preferences', accessToken, {
      values: { targetRoles: ['test_prep_tutor'] },
    });
    builder = (await res.json()).data;
    expertise = sectionByKey(builder, 'teaching_expertise');

    assert.ok(
      expertise.questions.some((q) => q.key === 'testsPrepared'),
      'revealed by the role choice, in the same response',
    );
  });

  test('completing every visible question marks the section complete', async () => {
    const { accessToken } = await onboardCandidate();

    const res = await authPatch('/api/me/candidate-profile/sections/professional_identity', accessToken, {
      values: {
        fullName: 'Asha Menon',
        headline: 'IB Physics teacher',
        summary: 'Ten years teaching IB and A-level physics.',
        pronouns: 'she/her',
        country: 'IN',
        region: 'Bengaluru',
        timezone: 'Asia/Kolkata',
        languages: ['en'],
      },
    });
    const identity = sectionByKey((await res.json()).data, 'professional_identity');

    assert.equal(identity.complete, true);
    assert.deepEqual(identity.missingForPublish, []);
  });
});
