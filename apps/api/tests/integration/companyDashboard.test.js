/**
 * REC-10 company home.
 *
 * The dashboard owns no data, so the behaviours worth pinning are about what it REFLECTS: that
 * its publish blockers are the same ones REC-06 enforces, that a viewer gets a usable page rather
 * than a 403, and that a section withheld for a role is absent rather than zero.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  COMPANY_STATUS,
  MEMBERSHIP_STATUS,
  INTEREST_STATUS,
  HIRING_INTENT_STATUS,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { HiringIntent } from '../../src/modules/hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from '../../src/modules/interests/expressionOfInterest.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'dash-owner@example.com';
const VIEWER = 'dash-viewer@example.com';
const RECRUITER = 'dash-recruiter@example.com';
const STRANGER = 'dash-stranger@example.com';
const PASSWORD = 'Password123';

const ALL_EMAILS = [OWNER, VIEWER, RECRUITER, STRANGER];

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
    name: 'Dashboard Academy',
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

/** Fills every §7.3 requirement through the REC-02 wizard, so publishing becomes possible. */
async function completeSetup(token, slug) {
  await authPatch(`/api/companies/${slug}/steps/brand`, token, {
    values: { tagline: 'Small-group STEM tutoring', descriptionShort: 'We tutor secondary STEM.' },
  });
  await authPatch(`/api/companies/${slug}/steps/footprint`, token, {
    values: { educationServices: ['academic_tutoring'] },
  });
}

const dashboard = async (slug, token) => bodyOf(await authGet(`/api/companies/${slug}/dashboard`, token));

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

  const companies = await Company.find({ slug: /^dashboard-academy/ })
    .select('_id')
    .lean();
  const companyIds = companies.map((c) => c._id);

  await ExpressionOfInterest.deleteMany({ companyId: { $in: companyIds } });
  await HiringIntent.deleteMany({ companyId: { $in: companyIds } });
  await CompanyMember.deleteMany({
    $or: [{ userId: { $in: ids } }, { companyId: { $in: companyIds } }],
  });
  await Session.deleteMany({ userId: { $in: ids } });
  await VerificationToken.deleteMany({ userId: { $in: ids } });
  await Company.deleteMany({ slug: /^dashboard-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

/* ── overview and pending actions ─────────────────────────────────────────────────────────── */

describe('REC-10 recruiting overview', () => {
  test('a brand new company reports draft, no roles, no interest, one member', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const body = await dashboard(company.slug, accessToken);

    assert.equal(body.company.status, COMPANY_STATUS.DRAFT);
    assert.equal(body.overview.isPublished, false);
    assert.equal(body.overview.activeRoles, 0);
    assert.equal(body.overview.activeInterest, 0);
    assert.equal(body.overview.memberCount, 1);
    assert.equal(body.yourRole, COMPANY_ROLES.OWNER);
  });

  test('the counts follow the underlying collections', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);

    await HiringIntent.create({
      companyId: company.id,
      title: 'Physics tutor',
      status: HIRING_INTENT_STATUS.ACTIVE,
      roleCategories: ['private_tutor'],
    });
    await HiringIntent.create({
      companyId: company.id,
      title: 'Closed role',
      status: HIRING_INTENT_STATUS.CLOSED,
      roleCategories: ['private_tutor'],
    });

    await ExpressionOfInterest.create({
      companyId: company.id,
      contact: { name: 'A Candidate', email: 'cand-a@example.com' },
      status: INTEREST_STATUS.SUBMITTED,
      consent: { grantedAt: new Date() },
    });
    await ExpressionOfInterest.create({
      companyId: company.id,
      contact: { name: 'B Candidate', email: 'cand-b@example.com' },
      status: INTEREST_STATUS.WITHDRAWN,
      consent: { grantedAt: new Date() },
    });

    const body = await dashboard(company.slug, accessToken);

    assert.equal(body.overview.memberCount, 2);
    assert.equal(body.overview.activeRoles, 1, 'only ACTIVE intents count');
    assert.equal(body.hiring.total, 2);
    assert.equal(body.interests.new, 1);
    assert.equal(body.interests.withdrawn, 1);
    assert.equal(body.interests.total, 2);
    assert.equal(body.overview.activeInterest, 1, 'withdrawn is not open interest');
  });
});

describe('REC-10 pending actions', () => {
  test('an unpublishable draft is told exactly what is missing, matching REC-06', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const body = await dashboard(company.slug, accessToken);
    const action = body.pendingActions.find((item) => item.key === 'finish_setup');

    assert.ok(action, 'the draft is asked to finish setup');
    assert.equal(body.setup.canPublish, false);

    /*
     * The same checklist REC-06 refuses to publish against. If these ever diverge, the dashboard
     * would invite someone to publish a page the publish endpoint rejects.
     */
    const preview = await bodyOf(await authGet(`/api/companies/${company.slug}/preview`, accessToken));
    assert.deepEqual(body.setup.blockers, preview.publish.blockers);
  });

  test('a complete draft is invited to publish instead', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);

    const body = await dashboard(company.slug, accessToken);

    assert.equal(body.setup.canPublish, true);
    assert.equal(body.setup.blockers.length, 0);
    assert.ok(body.pendingActions.some((item) => item.key === 'publish'));
  });

  test('new interest becomes a pending action; opened interest does not', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const interest = await ExpressionOfInterest.create({
      companyId: company.id,
      contact: { name: 'A Candidate', email: 'cand-a@example.com' },
      status: INTEREST_STATUS.SUBMITTED,
      consent: { grantedAt: new Date() },
    });

    let body = await dashboard(company.slug, accessToken);
    assert.ok(body.pendingActions.some((item) => item.key === 'review_interest'));

    await ExpressionOfInterest.findByIdAndUpdate(interest._id, {
      status: INTEREST_STATUS.VIEWED,
    });

    body = await dashboard(company.slug, accessToken);
    assert.equal(
      body.pendingActions.some((item) => item.key === 'review_interest'),
      false,
      'once seen it is no longer pending',
    );
    assert.equal(body.interests.active, 1, 'but it is still open interest');
  });

  test('a published company with no active role is told its page has nothing to apply to', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);
    await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});

    const body = await dashboard(company.slug, accessToken);

    assert.equal(body.overview.isPublished, true);
    assert.ok(body.pendingActions.some((item) => item.key === 'add_hiring_intent'));
    assert.equal(
      body.pendingActions.some((item) => item.key === 'finish_setup'),
      false,
      'a published page has no setup blockers to nag about',
    );
  });

  test('an outstanding invitation appears to whoever can act on it', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: 'dash-invitee@example.com',
      role: COMPANY_ROLES.RECRUITER,
    });

    const body = await dashboard(company.slug, accessToken);
    assert.ok(body.pendingActions.some((item) => item.key === 'pending_invitations'));

    await CompanyMember.deleteMany({ invitedEmail: 'dash-invitee@example.com' });
  });
});

/* ── permissions ──────────────────────────────────────────────────────────────────────────── */

describe('REC-10 permissions', () => {
  test('a viewer gets the page, not a 403 — but without the sections they may not see', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const res = await authGet(`/api/companies/${company.slug}/dashboard`, viewerToken);
    assert.equal(res.status, 200, 'this is where a member lands — it must not 403');

    const body = await bodyOf(res);
    assert.equal(body.yourRole, COMPANY_ROLES.VIEWER);
    assert.equal(body.permissions.canEdit, false);
    assert.equal(body.permissions.canManageMembers, false);
    assert.equal(body.setup, null, 'setup blockers are withheld from someone who cannot edit');

    // A viewer DOES hold interest:view (PRD §4.2), so this section is present.
    assert.equal(body.permissions.canViewInterest, true);
    assert.ok(body.interests);

    assert.equal(
      body.pendingActions.some((item) => item.key === 'finish_setup'),
      false,
      'a viewer is never asked to do something they cannot do',
    );
  });

  test('a recruiter sees interest and search but not setup or team actions', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: recruiterToken } = await addMember(
      company.id,
      RECRUITER,
      COMPANY_ROLES.RECRUITER,
    );

    const body = await dashboard(company.slug, recruiterToken);

    assert.equal(body.permissions.canViewInterest, true);
    assert.equal(body.permissions.canSearch, true);
    assert.equal(body.permissions.canManageHiring, true);
    assert.equal(body.permissions.canEdit, false);
    assert.equal(body.permissions.canManageMembers, false);
  });

  test('a non-member gets 404, never 403 — membership is not disclosed', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: strangerToken } = await onboard(STRANGER);

    const res = await authGet(`/api/companies/${company.slug}/dashboard`, strangerToken);
    assert.equal(res.status, 404);
  });

  test('unauthenticated requests are refused', async () => {
    const res = await fetch(`${baseUrl}/api/companies/any-slug/dashboard`);
    assert.equal(res.status, 401);
  });
});
