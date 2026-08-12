/**
 * SET-01 data export — PRD §16.1, `15_DATA_INVENTORY.md` §8.
 *
 * The export claims to be the person's copy of their data. Until 2026-08-12 it returned the
 * account fields, notification preferences, a *summary* of the candidate profile and company
 * memberships — and none of the professional content the person actually wrote. A portability
 * request answered with that would have been answered wrongly, and nothing would have failed.
 *
 * These tests pin the two halves that matter: everything the person wrote is present, and nothing
 * another party wrote ABOUT them leaks in.
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../../src/modules/candidates/candidateAnswer.model.js';
import {
  Experience,
  EducationEntry,
  Credential,
  EvidenceItem,
} from '../../src/modules/candidates/profileEntry.model.js';
import { Note } from '../../src/modules/notes/note.model.js';
import { Company } from '../../src/modules/companies/company.model.js';

let server;
let baseUrl;

const SUBJECT = 'export-subject@example.com';
const ALL_EMAILS = [SUBJECT];
const PASSWORD = 'Password123';
const COMPANY = 'Export Test Academy';

const jsonPost = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

let subject;
let profile;
let company;

before(async () => {
  await connectDatabase();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function removeFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } }).select('_id');
  const userIds = users.map((u) => u._id);
  const profiles = await CandidateProfile.find({ userId: { $in: userIds } }).select('_id');
  const profileIds = profiles.map((p) => p._id);

  await Promise.all([
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
    CandidateAnswer.deleteMany({ candidateId: { $in: profileIds } }),
    Experience.deleteMany({ candidateId: { $in: profileIds } }),
    EducationEntry.deleteMany({ candidateId: { $in: profileIds } }),
    Credential.deleteMany({ candidateId: { $in: profileIds } }),
    EvidenceItem.deleteMany({ candidateId: { $in: profileIds } }),
    Note.deleteMany({ candidateId: { $in: profileIds } }),
    CandidateProfile.deleteMany({ userId: { $in: userIds } }),
  ]);
  await Company.deleteMany({ name: COMPANY });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await removeFixtures();
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  await removeFixtures();

  await jsonPost('/api/auth/signup', { email: SUBJECT });
  const user = await User.findOne({ email: SUBJECT });

  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
    email: SUBJECT,
    expiresAt: new Date(Date.now() + 60_000),
  });
  const verified = await jsonPost('/api/auth/verify-email', { token: raw });
  const { setupToken } = (await verified.json()).data;
  const set = await jsonPost('/api/auth/set-password', {
    token: setupToken,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  subject = { user, accessToken: (await set.json()).data.accessToken };

  profile = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    publishedAt: new Date(),
    headline: 'IB physics teacher',
    summary: 'Ten years of senior-school physics.',
  });

  await Promise.all([
    CandidateAnswer.create({
      candidateId: profile._id,
      questionKey: 'teaching_style',
      value: 'Socratic',
      bankVersion: 1,
    }),
    Experience.create({
      candidateId: profile._id,
      role: 'Physics teacher',
      organization: 'Cedar Hill School',
      startDate: '2016-01',
    }),
    EducationEntry.create({ candidateId: profile._id, institution: 'IIT Madras', qualification: 'BSc' }),
    Credential.create({ candidateId: profile._id, name: 'CELTA', issuer: 'Cambridge' }),
    EvidenceItem.create({
      candidateId: profile._id,
      title: 'Kinematics lesson',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      provider: 'youtube',
    }),
  ]);

  company = await Company.create({
    name: COMPANY,
    slug: 'export-test-academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
    status: 'published',
  });
});

async function exportData() {
  const res = await fetch(`${baseUrl}/api/me/settings/export`, {
    headers: { Authorization: `Bearer ${subject.accessToken}` },
  });
  assert.equal(res.status, 200);
  return { res, body: JSON.parse(await res.text()) };
}

describe('GET /api/me/settings/export', () => {
  test('is delivered as a downloadable file', async () => {
    const { res } = await exportData();
    assert.match(res.headers.get('content-disposition') ?? '', /attachment/);
  });

  test('includes the account and membership layers', async () => {
    const { body } = await exportData();
    assert.equal(body.account.email, SUBJECT);
    assert.ok(body.exportedAt);
    assert.ok(Array.isArray(body.companyMemberships));
  });

  test('includes EVERY piece of professional content the person wrote', async () => {
    const { body } = await exportData();

    assert.equal(body.questionAnswers.length, 1, 'question-bank answers');
    assert.equal(body.experiences.length, 1, 'experience entries');
    assert.equal(body.educationEntries.length, 1, 'education entries');
    assert.equal(body.credentials.length, 1, 'credentials');
    assert.equal(body.portfolioItems.length, 1, 'portfolio media');

    assert.equal(body.experiences[0].organization, 'Cedar Hill School');
    assert.equal(body.credentials[0].name, 'CELTA');
    assert.equal(body.portfolioItems[0].title, 'Kinematics lesson');
    assert.equal(body.questionAnswers[0].value, 'Socratic');
  });

  test('includes interests and correspondence', async () => {
    const { body } = await exportData();
    assert.ok(Array.isArray(body.expressionsOfInterest));
    assert.ok(Array.isArray(body.conversations));
    assert.ok(Array.isArray(body.savedCompanies));
  });

  test('SECURITY: never includes recruiter notes written about the person', async () => {
    await Note.create({
      companyId: company._id,
      candidateId: profile._id,
      authorUserId: subject.user._id,
      body: 'Internal assessment that must never reach the candidate.',
    });

    const { res, body } = await exportData();
    const raw = JSON.stringify(body);

    // PRD §11.2 keeps internal notes structurally separate from anything candidate-facing.
    assert.ok(!raw.includes('Internal assessment'), 'recruiter notes must not appear in an export');
    assert.equal(res.status, 200);
  });

  test('a user with no candidate profile still gets a well-formed file', async () => {
    await CandidateProfile.deleteOne({ _id: profile._id });

    const { body } = await exportData();
    assert.equal(body.candidateProfile, null);
    assert.deepEqual(body.experiences, []);
    assert.deepEqual(body.credentials, []);
    assert.deepEqual(body.conversations, []);
  });

  test('SECURITY: refuses an unauthenticated request', async () => {
    const res = await fetch(`${baseUrl}/api/me/settings/export`);
    assert.equal(res.status, 401);
  });
});
