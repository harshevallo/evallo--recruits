/**
 * REC-11 interest inbox.
 *
 * The behaviours worth pinning are the privacy ones, because they are the ones a UI cannot
 * enforce and a reviewer cannot see: that a block hides a candidate the company already heard
 * from, that contact details follow the CANDIDATE's rule rather than the recruiter's role, and
 * that a withdrawn interest can be read but never reopened by the company.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  INTEREST_STATUS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { ExpressionOfInterest } from '../../src/modules/interests/expressionOfInterest.model.js';
import { AccessGrant } from '../../src/modules/interests/accessGrant.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'inbox-owner@example.com';
const VIEWER = 'inbox-viewer@example.com';
const STRANGER = 'inbox-stranger@example.com';
const CANDIDATE = 'inbox-candidate@example.com';
const CANDIDATE2 = 'inbox-candidate2@example.com';
const PASSWORD = 'Password123';

const ALL_EMAILS = [OWNER, VIEWER, STRANGER, CANDIDATE, CANDIDATE2];

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

const authPatch = (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });

const bodyOf = async (res) => (await res.json()).data;
const errorOf = async (res) => (await res.json()).error;

async function onboard(email) {
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

  return { accessToken: (await res.json()).data.accessToken, user };
}

async function createCompany(token) {
  const res = await authPost('/api/companies', token, {
    name: 'Inbox Academy',
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

/** A candidate with a real profile, plus the interest that made them visible to the company. */
async function candidateWithInterest(companyId, email, overrides = {}) {
  const { user } = await onboard(email);

  const profile = await CandidateProfile.create({
    userId: user._id,
    headline: 'Physics tutor, 6 years',
    summary: 'I teach secondary physics.',
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.AFTER_INTEREST,
    targetRoles: ['private_tutor'],
    subjects: ['physics'],
    yearsExperience: 6,
    ...overrides,
  });

  const interest = await ExpressionOfInterest.create({
    companyId,
    candidateId: profile._id,
    contact: { name: user.name ?? 'A Candidate', email },
    status: INTEREST_STATUS.SUBMITTED,
    consent: { grantedAt: new Date() },
  });

  await AccessGrant.create({ candidateId: profile._id, companyId, grantedAt: new Date() });

  return { user, profile, interest };
}

/** A pre-auth submission: contact captured inline, no profile behind it (PRD §11.1). */
function anonymousInterest(companyId, email, extra = {}) {
  return ExpressionOfInterest.create({
    companyId,
    candidateId: null,
    contact: { name: 'Anon Applicant', email },
    status: INTEREST_STATUS.SUBMITTED,
    consent: { grantedAt: new Date() },
    ...extra,
  });
}

/**
 * Returns `data` merged with the envelope's `meta`.
 *
 * Pagination meta sits BESIDE `data` on collection responses (04_API_DOCUMENTATION §1), not
 * inside it, so a helper that only unwraps `data` would silently drop it.
 */
const inbox = async (slug, token, qs = '') => {
  const envelope = await (await authGet(`/api/companies/${slug}/interests${qs}`, token)).json();
  return { ...envelope.data, meta: envelope.meta };
};

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

  const companies = await Company.find({ slug: /^inbox-academy/ })
    .select('_id')
    .lean();
  const companyIds = companies.map((c) => c._id);

  const profiles = await CandidateProfile.find({ userId: { $in: ids } })
    .select('_id')
    .lean();
  const profileIds = profiles.map((p) => p._id);

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
  await Company.deleteMany({ slug: /^inbox-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

/* ── the inbox itself ─────────────────────────────────────────────────────────────────────── */

describe('REC-11 inbox listing', () => {
  test('an empty inbox reports zero rather than failing', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const body = await inbox(company.slug, accessToken);

    assert.deepEqual(body.interests, []);
    assert.equal(body.counts.total, 0);
  });

  test('rows carry the candidate summary, the message, and the consent timestamp', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await candidateWithInterest(company.id, CANDIDATE);

    const body = await inbox(company.slug, accessToken);

    assert.equal(body.interests.length, 1);
    const row = body.interests[0];

    assert.equal(row.status, INTEREST_STATUS.SUBMITTED);
    assert.equal(row.actionable, true);
    assert.ok(row.consentedAt, 'the consent record is surfaced (PRD §11.1)');
    assert.equal(row.candidate.viewable, true);
    assert.equal(row.candidate.summary.headline, 'Physics tutor, 6 years');
    assert.equal(row.candidate.summary.yearsExperience, 6);
    assert.ok(row.candidate.profileId, 'the profile can be opened');
  });

  test('a pre-auth submission shows its inline contact and offers no profile', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await anonymousInterest(company.id, 'walk-in@example.com');

    const row = (await inbox(company.slug, accessToken)).interests[0];

    assert.equal(row.candidate.hasProfile, false);
    assert.equal(row.candidate.viewable, false);
    assert.equal(row.candidate.profileId, null);
    assert.equal(
      row.contact.email,
      'walk-in@example.com',
      'they typed this in for this company specifically',
    );
  });

  test('filters by status, by role, and by name; counts stay unfiltered', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await anonymousInterest(company.id, 'a@example.com');
    await anonymousInterest(company.id, 'b@example.com', {
      status: INTEREST_STATUS.CONTACTED,
      contact: { name: 'Bee Person', email: 'b@example.com' },
    });

    const submitted = await inbox(company.slug, accessToken, '?status=submitted');
    assert.equal(submitted.interests.length, 1);
    assert.equal(submitted.counts.matching, 1);
    assert.equal(submitted.counts.total, 2, 'tabs stay stable while filtering');

    const byName = await inbox(company.slug, accessToken, '?q=Bee');
    assert.equal(byName.interests.length, 1);
    assert.equal(byName.interests[0].contact.email, 'b@example.com');

    const general = await inbox(company.slug, accessToken, '?generalOnly=true');
    assert.equal(general.interests.length, 2, 'neither was tied to a role');
  });

  test('sorting and paging are stable', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    for (const n of [1, 2, 3]) {
      await anonymousInterest(company.id, `p${n}@example.com`);
    }

    const newest = await inbox(company.slug, accessToken, '?sort=newest&limit=2&page=1');
    assert.equal(newest.interests.length, 2);
    assert.equal(newest.meta.total, 3);
    assert.equal(newest.meta.totalPages, 2);
    assert.equal(newest.meta.hasMore, true);

    const oldest = await inbox(company.slug, accessToken, '?sort=oldest&limit=2&page=1');
    assert.notEqual(
      newest.interests[0].id,
      oldest.interests[0].id,
      'the two orders disagree, so sorting is actually applied',
    );

    const page2 = await inbox(company.slug, accessToken, '?limit=2&page=2');
    assert.equal(page2.interests.length, 1);
    assert.equal(page2.meta.hasMore, false);
  });
});

/* ── privacy — the part a UI cannot enforce ───────────────────────────────────────────────── */

describe('REC-11 privacy', () => {
  test('a candidate who blocked this company is unreadable, even having written to it', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidateWithInterest(company.id, CANDIDATE);

    await CandidateProfile.findByIdAndUpdate(profile._id, {
      blockedCompanyIds: [company.id],
    });

    const row = (await inbox(company.slug, accessToken)).interests[0];

    assert.equal(row.candidate.viewable, false, 'a block beats an access grant');
    assert.equal(row.candidate.summary, null);
    assert.equal(row.candidate.profileId, null);
    assert.equal(row.contact.email, null, 'and it takes the contact details with it');
    assert.ok(row.id, 'the interest itself is still a real event in the company history');
  });

  test('contact follows the CANDIDATE rule, not the recruiter role', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidateWithInterest(company.id, CANDIDATE);

    // after_interest + an open interest ⇒ revealed.
    let row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.contact.email, CANDIDATE);

    // hidden ⇒ withheld from an OWNER, the most privileged role there is.
    await CandidateProfile.findByIdAndUpdate(profile._id, {
      contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    });
    row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.contact.email, null);
    assert.equal(row.candidate.viewable, true, 'the profile is still readable — only contact is not');

    // on_request ⇒ withheld, because the approval flow does not exist yet.
    await CandidateProfile.findByIdAndUpdate(profile._id, {
      contactVisibility: CONTACT_VISIBILITY.ON_REQUEST,
    });
    row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.contact.email, null);
  });

  test('withdrawing hides contact details that were previously shared', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { interest } = await candidateWithInterest(company.id, CANDIDATE);

    assert.equal((await inbox(company.slug, accessToken)).interests[0].contact.email, CANDIDATE);

    await ExpressionOfInterest.findByIdAndUpdate(interest._id, {
      status: INTEREST_STATUS.WITHDRAWN,
    });

    const row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.status, INTEREST_STATUS.WITHDRAWN);
    assert.equal(row.actionable, false);
    assert.equal(
      row.contact.email,
      null,
      'after_interest contact sharing ends when the interest does',
    );
  });

  test('a draft or archived candidate is not rendered from a stale interest', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidateWithInterest(company.id, CANDIDATE);

    for (const status of [CANDIDATE_VISIBILITY.DRAFT, CANDIDATE_VISIBILITY.ARCHIVED]) {
      await CandidateProfile.findByIdAndUpdate(profile._id, { status });
      const row = (await inbox(company.slug, accessToken)).interests[0];
      assert.equal(row.candidate.viewable, false, `${status} is not readable`);
    }
  });

  test('a PAUSED candidate stays readable to a company that already had access (§4.3)', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidateWithInterest(company.id, CANDIDATE);

    await CandidateProfile.findByIdAndUpdate(profile._id, {
      status: CANDIDATE_VISIBILITY.PAUSED,
    });

    const row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.candidate.viewable, true, 'previously authorized companies retain access');
    assert.equal(row.candidate.summary.isPaused, true, 'and are told the candidate paused');
  });

  test('a paused candidate whose grant was withdrawn becomes unreadable', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { profile } = await candidateWithInterest(company.id, CANDIDATE);

    await CandidateProfile.findByIdAndUpdate(profile._id, {
      status: CANDIDATE_VISIBILITY.PAUSED,
    });
    await AccessGrant.updateMany(
      { candidateId: profile._id, companyId: company.id },
      { withdrawnAt: new Date() },
    );

    const row = (await inbox(company.slug, accessToken)).interests[0];
    assert.equal(row.candidate.viewable, false);
  });
});

/* ── status changes ───────────────────────────────────────────────────────────────────────── */

describe('REC-11 status changes', () => {
  test('a recruiter moves an interest along, and it persists', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { interest } = await candidateWithInterest(company.id, CANDIDATE);

    const res = await authPatch(
      `/api/companies/${company.slug}/interests/${interest._id}`,
      accessToken,
      { status: INTEREST_STATUS.CONTACTED },
    );

    assert.equal(res.status, 200);
    assert.equal((await bodyOf(res)).status, INTEREST_STATUS.CONTACTED);
    assert.equal(
      (await ExpressionOfInterest.findById(interest._id)).status,
      INTEREST_STATUS.CONTACTED,
    );
  });

  test('a recruiter cannot write `withdrawn` — that decision is the candidate\'s', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { interest } = await candidateWithInterest(company.id, CANDIDATE);

    const res = await authPatch(
      `/api/companies/${company.slug}/interests/${interest._id}`,
      accessToken,
      { status: INTEREST_STATUS.WITHDRAWN },
    );

    assert.equal(res.status, 400);
    assert.equal(
      (await ExpressionOfInterest.findById(interest._id)).status,
      INTEREST_STATUS.SUBMITTED,
    );
  });

  test('a withdrawn interest cannot be reopened by the company (PRD §21.5)', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { interest } = await candidateWithInterest(company.id, CANDIDATE);

    await ExpressionOfInterest.findByIdAndUpdate(interest._id, {
      status: INTEREST_STATUS.WITHDRAWN,
    });

    const res = await authPatch(
      `/api/companies/${company.slug}/interests/${interest._id}`,
      accessToken,
      { status: INTEREST_STATUS.CONTACTED },
    );

    assert.equal(res.status, 409);
    assert.match((await errorOf(res)).message, /withdrew/i);
    assert.equal(
      (await ExpressionOfInterest.findById(interest._id)).status,
      INTEREST_STATUS.WITHDRAWN,
    );
  });

  test('opening marks submitted → viewed, and is idempotent', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { interest } = await candidateWithInterest(company.id, CANDIDATE);

    const first = await authPost(
      `/api/companies/${company.slug}/interests/${interest._id}/viewed`,
      accessToken,
    );
    assert.equal((await bodyOf(first)).status, INTEREST_STATUS.VIEWED);

    // Already progressed by a colleague: opening it must not drag the status backwards.
    await ExpressionOfInterest.findByIdAndUpdate(interest._id, {
      status: INTEREST_STATUS.PROGRESSED,
    });

    const second = await authPost(
      `/api/companies/${company.slug}/interests/${interest._id}/viewed`,
      accessToken,
    );
    assert.equal((await bodyOf(second)).status, INTEREST_STATUS.PROGRESSED);
  });

  test('an interest belonging to another company is invisible, not forbidden', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { accessToken: strangerToken } = await onboard(STRANGER);
    const other = await createCompany(strangerToken);
    const foreign = await anonymousInterest(other.id, 'foreign@example.com');

    const res = await authPatch(
      `/api/companies/${company.slug}/interests/${foreign._id}`,
      accessToken,
      { status: INTEREST_STATUS.CONTACTED },
    );

    assert.equal(res.status, 404);
    assert.equal(
      (await ExpressionOfInterest.findById(foreign._id)).status,
      INTEREST_STATUS.SUBMITTED,
      'the other company is untouched',
    );
  });
});

/* ── permissions ──────────────────────────────────────────────────────────────────────────── */

describe('REC-11 permissions', () => {
  test('a viewer may read the inbox — PRD §4.2 grants interest:view to every role', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);
    await candidateWithInterest(company.id, CANDIDATE);

    const res = await authGet(`/api/companies/${company.slug}/interests`, viewerToken);
    assert.equal(res.status, 200);
    assert.equal((await bodyOf(res)).interests.length, 1);
  });

  test('a non-member gets 404, never 403', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: strangerToken } = await onboard(STRANGER);

    assert.equal(
      (await authGet(`/api/companies/${company.slug}/interests`, strangerToken)).status,
      404,
    );
  });

  test('unauthenticated requests are refused', async () => {
    assert.equal((await fetch(`${baseUrl}/api/companies/any/interests`)).status, 401);
  });

  test('an unsupported status or sort is rejected before anything is read', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    assert.equal(
      (await authGet(`/api/companies/${company.slug}/interests?status=nonsense`, accessToken))
        .status,
      400,
    );
    assert.equal(
      (await authGet(`/api/companies/${company.slug}/interests?sort=best`, accessToken)).status,
      400,
    );
  });
});
