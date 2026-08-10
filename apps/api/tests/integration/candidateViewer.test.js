/**
 * REC-13 candidate viewer.
 *
 * Two things are load-bearing here and nothing else comes close: that the recruiter view is
 * literally the CAN-03 rendering (PRD §8.8 requires the candidate's preview and the recruiter's
 * view to be the same thing), and that every refusal is a 404 rather than a 403 — a 403 would
 * confirm the existence of a person who has chosen not to be seen.
 *
 * The audit trail is tested because §21.4 makes it an acceptance criterion, and a compliance
 * record nobody asserts on is a compliance record that quietly stops being written.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  INTEREST_STATUS,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { AccessGrant } from '../../src/modules/interests/accessGrant.model.js';
import { ExpressionOfInterest } from '../../src/modules/interests/expressionOfInterest.model.js';
import { AuditEvent, AUDIT_ACTIONS } from '../../src/modules/audit/auditEvent.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'cv-owner@example.com';
const VIEWER = 'cv-viewer@example.com';
const STRANGER = 'cv-stranger@example.com';
const CAND = 'cv-cand@example.com';
const PASSWORD = 'Password123';

const ALL_EMAILS = [OWNER, VIEWER, STRANGER, CAND];

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

async function createCompany(token) {
  const res = await authPost('/api/companies', token, {
    name: 'Viewer Academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  return bodyOf(res);
}

async function addMember(companyId, email, role) {
  const { accessToken, user } = await onboard(email);
  await CompanyMember.create({
    companyId,
    userId: user._id,
    role,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });
  return { accessToken, user };
}

async function candidate(overrides = {}) {
  const { accessToken, user } = await onboard(CAND, {
    name: 'Nadia Khan',
    location: { country: 'IN', region: 'Kerala' },
    languages: ['en', 'ml'],
  });

  const profile = await CandidateProfile.create({
    userId: user._id,
    headline: 'Chemistry teacher, IB',
    summary: 'I teach IB chemistry to high-school students.',
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    targetRoles: ['school_teacher'],
    subjects: ['chemistry'],
    learnerSegments: ['high_school'],
    employmentTypes: ['full_time'],
    deliveryModes: ['on_site'],
    availability: 'immediately',
    yearsExperience: 9,
    publishedAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides,
  });

  return { accessToken, user, profile };
}

const view = (slug, id, token, qs = '') =>
  authGet(`/api/companies/${slug}/candidates/${id}${qs}`, token);

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function cleanupFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } })
    .select('_id')
    .lean();
  const ids = users.map((u) => u._id);

  const companies = await Company.find({ slug: /^viewer-academy/ })
    .select('_id')
    .lean();
  const companyIds = companies.map((c) => c._id);

  const profiles = await CandidateProfile.find({ userId: { $in: ids } })
    .select('_id')
    .lean();
  const profileIds = profiles.map((p) => p._id);

  await AuditEvent.deleteMany({
    $or: [{ actorCompanyId: { $in: companyIds } }, { targetId: { $in: profileIds } }],
  });
  await AccessGrant.deleteMany({
    $or: [{ candidateId: { $in: profileIds } }, { companyId: { $in: companyIds } }],
  });
  await ExpressionOfInterest.deleteMany({ companyId: { $in: companyIds } });
  await CandidateProfile.deleteMany({ userId: { $in: ids } });
  await CompanyMember.deleteMany({
    $or: [{ userId: { $in: ids } }, { companyId: { $in: companyIds } }],
  });
  await Session.deleteMany({ userId: { $in: ids } });
  await VerificationToken.deleteMany({ userId: { $in: ids } });
  await Company.deleteMany({ slug: /^viewer-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

/* ── the rendering is CAN-03's rendering ──────────────────────────────────────────────────── */

describe('REC-13 rendering', () => {
  test('the recruiter view is byte-identical to the candidate own CAN-03 preview', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: candToken, profile } = await candidate();

    const recruiterSees = (await bodyOf(await view(company.slug, profile._id, accessToken))).profile;
    const candidateSees = (
      await bodyOf(await authGet('/api/me/candidate-profile/preview', candToken))
    ).profile;

    /*
     * PRD §8.8: "The preview shows the exact same rendering and privacy state as the recruiter
     * view." Not a sample of fields — the whole object. If these can differ by one key, the
     * candidate is being shown a profile that is not the one recruiters actually get.
     */
    assert.deepEqual(recruiterSees, candidateSees);
  });

  test('every section the data model supports is present, and nothing private is', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    const body = await bodyOf(await view(company.slug, profile._id, accessToken));
    const { header, expertise, evidence } = body.profile;

    assert.equal(header.name, 'Nadia Khan');
    assert.equal(header.headline, 'Chemistry teacher, IB');
    assert.equal(header.yearsExperience, 9);
    assert.deepEqual(header.languages, ['en', 'ml']);
    assert.equal(header.location.region, 'Kerala');
    assert.deepEqual(expertise.subjects, ['chemistry']);
    assert.equal(body.profile.introduction, 'I teach IB chemistry to high-school students.');

    // ADR-008 defers the evidence collections; reported as empty, never omitted.
    assert.deepEqual(evidence.experience, []);

    const serialised = JSON.stringify(body);
    assert.equal(serialised.includes('blockedCompanyIds'), false);
    assert.equal(serialised.includes('__v'), false);
    assert.equal(serialised.includes(CAND), false, 'contact is hidden, so the email is absent');
  });

  test('this company interest history is shown; another company history is not', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    const { accessToken: strangerToken } = await onboard(STRANGER);
    const other = await createCompany(strangerToken);

    await ExpressionOfInterest.create({
      companyId: company.id,
      candidateId: profile._id,
      contact: { name: 'Nadia Khan', email: CAND },
      message: 'I would like to teach here.',
      status: INTEREST_STATUS.SUBMITTED,
      consent: { grantedAt: new Date() },
    });
    await ExpressionOfInterest.create({
      companyId: other.id,
      candidateId: profile._id,
      contact: { name: 'Nadia Khan', email: CAND },
      message: 'Secret approach to a rival.',
      status: INTEREST_STATUS.SUBMITTED,
      consent: { grantedAt: new Date() },
    });

    const body = await bodyOf(await view(company.slug, profile._id, accessToken));

    assert.equal(body.interests.length, 1);
    assert.equal(body.interests[0].message, 'I would like to teach here.');
    assert.equal(body.interests[0].isOpen, true);
    assert.equal(
      JSON.stringify(body).includes('Secret approach'),
      false,
      'approaches to other companies are none of this one business',
    );
  });
});

/* ── privacy — every refusal is a 404 ─────────────────────────────────────────────────────── */

describe('REC-13 privacy', () => {
  const refused = [
    ['a draft profile', { status: CANDIDATE_VISIBILITY.DRAFT }],
    ['an archived profile', { status: CANDIDATE_VISIBILITY.ARCHIVED }],
    ['a private profile with no grant', { status: CANDIDATE_VISIBILITY.PRIVATE }],
    ['a paused profile with no grant', { status: CANDIDATE_VISIBILITY.PAUSED }],
  ];

  for (const [label, overrides] of refused) {
    test(`${label} returns 404, never 403`, async () => {
      const { accessToken } = await onboard(OWNER);
      const company = await createCompany(accessToken);
      const { profile } = await candidate(overrides);

      const res = await view(company.slug, profile._id, accessToken);
      assert.equal(res.status, 404, 'a 403 would confirm this person exists');
    });
  }

  test('a blocked company is refused even with a live access grant', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    await AccessGrant.create({
      candidateId: profile._id,
      companyId: company.id,
      grantedAt: new Date(),
    });

    assert.equal((await view(company.slug, profile._id, accessToken)).status, 200);

    await CandidateProfile.findByIdAndUpdate(profile._id, { blockedCompanyIds: [company.id] });

    assert.equal(
      (await view(company.slug, profile._id, accessToken)).status,
      404,
      'a block beats a grant',
    );
  });

  test('a PRIVATE candidate is reachable only by a company holding a grant', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate({ status: CANDIDATE_VISIBILITY.PRIVATE });

    assert.equal((await view(company.slug, profile._id, accessToken)).status, 404);

    await AccessGrant.create({
      candidateId: profile._id,
      companyId: company.id,
      grantedAt: new Date(),
    });

    const res = await view(company.slug, profile._id, accessToken);
    assert.equal(res.status, 200, 'shared via interest without becoming discoverable (§21.3)');
    assert.equal((await bodyOf(res)).access.viaGrant, true);
  });

  test('withdrawing the grant closes access again', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate({ status: CANDIDATE_VISIBILITY.PAUSED });

    await AccessGrant.create({
      candidateId: profile._id,
      companyId: company.id,
      grantedAt: new Date(),
    });
    assert.equal((await view(company.slug, profile._id, accessToken)).status, 200);

    await AccessGrant.updateMany(
      { candidateId: profile._id, companyId: company.id },
      { withdrawnAt: new Date() },
    );
    assert.equal((await view(company.slug, profile._id, accessToken)).status, 404);
  });

  test('contact follows the CANDIDATE rule, not the viewer role', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    // hidden: withheld even from an owner, the most privileged role there is.
    let body = await bodyOf(await view(company.slug, profile._id, accessToken));
    assert.equal(body.profile.contact, null);
    assert.equal(body.access.contactRevealed, false);

    await CandidateProfile.findByIdAndUpdate(profile._id, {
      contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
    });

    body = await bodyOf(await view(company.slug, profile._id, accessToken));
    assert.equal(body.profile.contact.email, CAND);
    assert.equal(body.access.contactRevealed, true);
  });

  test('after_interest reveals contact only while an interest is open', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate({
      contactVisibility: CONTACT_VISIBILITY.AFTER_INTEREST,
    });

    let body = await bodyOf(await view(company.slug, profile._id, accessToken));
    assert.equal(body.profile.contact, null, 'no interest yet');

    const interest = await ExpressionOfInterest.create({
      companyId: company.id,
      candidateId: profile._id,
      contact: { name: 'Nadia Khan', email: CAND },
      status: INTEREST_STATUS.SUBMITTED,
      consent: { grantedAt: new Date() },
    });

    body = await bodyOf(await view(company.slug, profile._id, accessToken));
    assert.equal(body.profile.contact.email, CAND);

    await ExpressionOfInterest.findByIdAndUpdate(interest._id, {
      status: INTEREST_STATUS.WITHDRAWN,
    });

    body = await bodyOf(await view(company.slug, profile._id, accessToken));
    assert.equal(body.profile.contact, null, 'withdrawal ends the contact sharing it created');
  });
});

/* ── permissions ──────────────────────────────────────────────────────────────────────────── */

describe('REC-13 permissions', () => {
  test('a viewer may open a profile — candidate:view is held by every role (TRD §6.1)', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    assert.equal((await view(company.slug, profile._id, viewerToken)).status, 200);
  });

  test('a non-member gets 404, and an unauthenticated caller 401', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();
    const { accessToken: strangerToken } = await onboard(STRANGER);

    assert.equal((await view(company.slug, profile._id, strangerToken)).status, 404);
    assert.equal(
      (await fetch(`${baseUrl}/api/companies/${company.slug}/candidates/${profile._id}`)).status,
      401,
    );
  });

  test('a malformed id is rejected before anything is read', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    assert.equal((await view(company.slug, 'not-an-id', accessToken)).status, 400);
    assert.equal(
      (await view(company.slug, '000000000000000000000000', accessToken)).status,
      404,
      'a well-formed id that matches nobody is the same 404 as one that is hidden',
    );
  });

  test('an unsupported audit source is rejected', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    assert.equal((await view(company.slug, profile._id, accessToken, '?source=snooping')).status, 400);
    assert.equal((await view(company.slug, profile._id, accessToken, '?source=search')).status, 200);
  });
});

/* ── audit trail — PRD §21.4 acceptance ───────────────────────────────────────────────────── */

describe('REC-13 audit trail', () => {
  /**
   * Waits for the audit write, which is fire-and-forget by design.
   *
   * Polls rather than sleeping a fixed time. A flat `setTimeout` encodes an assumption about how
   * fast the database answers, and that assumption fails intermittently under load — which is
   * exactly what happened: this suite failed once and passed on rerun with no code change. A
   * flaky test on a compliance requirement is worse than no test, because it teaches you to
   * rerun instead of read.
   */
  async function settle(predicate = async () => true, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await predicate()) return;
      if (Date.now() > deadline) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Resolves once at least `count` audit events exist for this candidate. */
  const auditedAtLeast = (candidateId, count) => () =>
    AuditEvent.countDocuments({ targetId: candidateId }).then((n) => n >= count);

  test('a profile view is logged with company, user, timestamp and source', async () => {
    const { accessToken, user: owner } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    await view(company.slug, profile._id, accessToken, '?source=search');
    await settle(auditedAtLeast(profile._id, 1));

    const events = await AuditEvent.find({ targetId: profile._id }).lean();
    const viewed = events.find((e) => e.action === AUDIT_ACTIONS.CANDIDATE_PROFILE_VIEWED);

    assert.ok(viewed, 'the view was recorded');
    assert.equal(String(viewed.actorUserId), String(owner._id));
    assert.equal(String(viewed.actorCompanyId), String(company.id));
    assert.equal(viewed.metadata.source, 'search');
    assert.ok(viewed.createdAt instanceof Date);
  });

  test('a contact reveal is logged as its own event', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate({
      contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
    });

    await view(company.slug, profile._id, accessToken);
    await settle(auditedAtLeast(profile._id, 2));

    const events = await AuditEvent.find({ targetId: profile._id }).lean();
    const actions = events.map((e) => e.action).sort();

    assert.deepEqual(actions, [
      AUDIT_ACTIONS.CANDIDATE_CONTACT_REVEALED,
      AUDIT_ACTIONS.CANDIDATE_PROFILE_VIEWED,
    ]);
  });

  test('a refused view writes no audit event', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate({ status: CANDIDATE_VISIBILITY.DRAFT });

    await view(company.slug, profile._id, accessToken);
    // Asserting an absence, so there is nothing to poll for — give any stray write time to land.
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(
      await AuditEvent.countDocuments({ targetId: profile._id }),
      0,
      'nothing was disclosed, so there is nothing to record',
    );
  });

  test('repeat views accumulate rather than overwrite — the log is append-only', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidate();

    await view(company.slug, profile._id, accessToken);
    await view(company.slug, profile._id, accessToken);
    await settle(auditedAtLeast(profile._id, 2));

    assert.equal(
      await AuditEvent.countDocuments({
        targetId: profile._id,
        action: AUDIT_ACTIONS.CANDIDATE_PROFILE_VIEWED,
      }),
      2,
    );
  });
});
