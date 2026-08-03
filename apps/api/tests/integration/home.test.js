/**
 * HOME-01 — universal home.
 *
 * HOME-01 adds no endpoint of its own: it is rendered entirely from `GET /api/me` (PRD Appendix A
 * describes it as "combined next actions and context switcher"). These tests pin the contract that
 * screen depends on — above all the per-company fields the context switcher needs (PRD §5.3) and
 * the guarantee that merely loading home creates nothing.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_ROLES } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const EMAIL = 'home-test@example.com';
const PASSWORD = 'Password123';

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

/** Drives the real AUTH-01 → AUTH-03 chain, so the account reaches home exactly as a user would. */
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

  const body = await res.json();
  return { accessToken: body.data.accessToken, userId: (await User.findOne({ email: EMAIL }))._id };
}

async function makeCompany(slug, name) {
  return Company.create({
    slug,
    name,
    organizationType: 'tutoring_center',
    status: 'published',
    location: { country: 'US', city: 'Denver' },
  });
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
    await CompanyMember.deleteMany({ userId: existing._id });
    await CandidateProfile.deleteMany({ userId: existing._id });
    await Session.deleteMany({ userId: existing._id });
    await VerificationToken.deleteMany({ userId: existing._id });
  }
  await Company.deleteMany({ slug: /^home-/ });
  await User.deleteMany({ email: EMAIL });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('HOME-01 state after onboarding', () => {
  test('a brand-new account has neither capability, so home shows both setup actions', async () => {
    const { accessToken } = await onboard();
    const body = await (await authGet('/api/me', accessToken)).json();

    assert.equal(body.data.capabilities.hasCandidateProfile, false, 'candidate action needed');
    assert.deepEqual(body.data.capabilities.companies, [], 'company action needed');
    assert.equal(body.data.capabilities.isRecruiterAnywhere, false);
  });

  test('loading home creates NOTHING — no profile, no company, no membership', async () => {
    const { accessToken, userId } = await onboard();

    await authGet('/api/me', accessToken);
    await authGet('/api/me', accessToken);

    assert.equal(await CandidateProfile.countDocuments({ userId }), 0);
    assert.equal(await CompanyMember.countDocuments({ userId }), 0);
    assert.equal(await Company.countDocuments({ slug: /^home-/ }), 0);
  });
});

describe('HOME-01 context switcher data (PRD §5.3)', () => {
  test('every company carries the fields the switcher renders', async () => {
    const { accessToken, userId } = await onboard();
    const company = await makeCompany('home-alpha', 'Home Alpha');
    await CompanyMember.create({
      userId,
      companyId: company._id,
      role: COMPANY_ROLES.OWNER,
      status: 'active',
    });

    const body = await (await authGet('/api/me', accessToken)).json();
    const [context] = body.data.capabilities.companies;

    assert.equal(context.name, 'Home Alpha');
    assert.equal(context.slug, 'home-alpha', 'slug drives /c/:companySlug navigation');
    assert.equal(context.role, COMPANY_ROLES.OWNER);
    assert.ok(context.initials, 'fallback when there is no logo');
    assert.ok(Array.isArray(context.permissions) && context.permissions.length > 0);
  });

  test('a multi-company user gets one context per company, each with its own role', async () => {
    const { accessToken, userId } = await onboard();
    const [a, b, c] = await Promise.all([
      makeCompany('home-a', 'Home A'),
      makeCompany('home-b', 'Home B'),
      makeCompany('home-c', 'Home C'),
    ]);

    await CompanyMember.create([
      { userId, companyId: a._id, role: COMPANY_ROLES.OWNER, status: 'active' },
      { userId, companyId: b._id, role: COMPANY_ROLES.RECRUITER, status: 'active' },
      { userId, companyId: c._id, role: COMPANY_ROLES.VIEWER, status: 'active' },
    ]);

    const body = await (await authGet('/api/me', accessToken)).json();
    const byName = Object.fromEntries(
      body.data.capabilities.companies.map((x) => [x.name, x.role]),
    );

    assert.equal(body.data.capabilities.companies.length, 3);
    assert.deepEqual(byName, {
      'Home A': COMPANY_ROLES.OWNER,
      'Home B': COMPANY_ROLES.RECRUITER,
      'Home C': COMPANY_ROLES.VIEWER,
    });
  });

  test('a revoked membership leaves the switcher on the next load', async () => {
    const { accessToken, userId } = await onboard();
    const company = await makeCompany('home-revoked', 'Home Revoked');
    const membership = await CompanyMember.create({
      userId,
      companyId: company._id,
      role: COMPANY_ROLES.RECRUITER,
      status: 'active',
    });

    let body = await (await authGet('/api/me', accessToken)).json();
    assert.equal(body.data.capabilities.companies.length, 1);

    await CompanyMember.deleteOne({ _id: membership._id });

    body = await (await authGet('/api/me', accessToken)).json();
    assert.deepEqual(body.data.capabilities.companies, [], 'derived per request, never cached');
  });
});

describe('HOME-01 combined capabilities', () => {
  test('one account shows the personal AND company contexts at once', async () => {
    const { accessToken, userId } = await onboard();
    const company = await makeCompany('home-both', 'Home Both');

    await CandidateProfile.create({ userId });
    await CompanyMember.create({
      userId,
      companyId: company._id,
      role: COMPANY_ROLES.OWNER,
      status: 'active',
    });

    const body = await (await authGet('/api/me', accessToken)).json();

    assert.equal(body.data.capabilities.hasCandidateProfile, true);
    assert.equal(body.data.capabilities.companies.length, 1);
    assert.equal(body.data.capabilities.isRecruiterAnywhere, true);
    assert.ok(!('role' in body.data.user), 'still no global role (ADR-001)');
  });
});
