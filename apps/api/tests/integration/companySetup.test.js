/**
 * REC-01 create / join company · REC-02 setup wizard · REC-06 preview and publish.
 *
 * These pin the behaviours configuration cannot express: who may edit, what blocks publication,
 * that the preview is byte-identical to the public page, and that publishing is the only thing
 * that makes a company anonymously readable.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_ROLES, COMPANY_STATUS, MEMBERSHIP_STATUS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'rec-owner@example.com';
const OUTSIDER = 'rec-outsider@example.com';
const PASSWORD = 'Password123';

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const send = (method) => (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const authPost = send('POST');
const authPatch = send('PATCH');

/** Real AUTH-01 → AUTH-03 chain, so accounts arrive exactly as a user would. */
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

/** REC-01 create — reuses the existing POST /api/companies. */
async function createCompany(token, name = 'Rec Test Academy') {
  const res = await authPost('/api/companies', token, {
    name,
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  return { status: res.status, body: (await res.json()).data };
}

/** Fills every §7.3 publication requirement through the wizard. */
async function completeSetup(token, slug) {
  await authPatch(`/api/companies/${slug}/steps/basics`, token, {
    values: { website: 'https://example.com' },
  });
  await authPatch(`/api/companies/${slug}/steps/brand`, token, {
    values: { tagline: 'Great teaching, every day', descriptionShort: 'We tutor across STEM.' },
  });
  await authPatch(`/api/companies/${slug}/steps/footprint`, token, {
    values: { educationServices: ['academic_tutoring'] },
  });
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function cleanupFixtures() {
  const users = await User.find({ email: { $in: [OWNER, OUTSIDER] } })
    .select('_id')
    .lean();
  const ids = users.map((u) => u._id);

  if (ids.length > 0) {
    await CompanyMember.deleteMany({ userId: { $in: ids } });
    await Session.deleteMany({ userId: { $in: ids } });
    await VerificationToken.deleteMany({ userId: { $in: ids } });
  }
  await Company.deleteMany({ slug: /^rec-test-academy/ });
  await User.deleteMany({ email: { $in: [OWNER, OUTSIDER] } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('REC-01 create company', () => {
  test('creating a company grants an OWNER membership, not a global role', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const { status, body } = await createCompany(accessToken);

    assert.equal(status, 201);
    assert.equal(body.role, 'owner');
    assert.equal(body.status, COMPANY_STATUS.DRAFT, 'companies start unpublished');

    const membership = await CompanyMember.findOne({ userId: user._id });
    assert.equal(membership.role, COMPANY_ROLES.OWNER);
    assert.equal(membership.status, MEMBERSHIP_STATUS.ACTIVE);

    const me = await (await authGet('/api/me', accessToken)).json();
    assert.equal(me.data.capabilities.companies.length, 1, 'capability appears immediately');
    assert.ok(!('role' in me.data.user), 'still no global role (ADR-001)');
  });

  test('a new company is NOT publicly visible', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body } = await createCompany(accessToken);

    const publicRes = await fetch(`${baseUrl}/api/public/companies/${body.slug}`);
    assert.equal(publicRes.status, 404, 'draft pages are not anonymously readable');
  });

  test('rejects a company with no name or unknown organization type', async () => {
    const { accessToken } = await onboard(OWNER);

    assert.equal(
      (await authPost('/api/companies', accessToken, { organizationType: 'tutoring_center', location: { country: 'IN' } })).status,
      400,
    );
    assert.equal(
      (await authPost('/api/companies', accessToken, { name: 'X Co', organizationType: 'not_a_type', location: { country: 'IN' } })).status,
      400,
    );
  });
});

describe('REC-01 join company by invitation', () => {
  test('a pending invitation is listed, then accepted, granting the capability', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const { body: company } = await createCompany(ownerToken);

    const { accessToken: guestToken, user: guest } = await onboard(OUTSIDER);

    // Creating invitations is REC-07; the row is seeded directly so REC-01 acceptance is testable.
    await CompanyMember.create({
      userId: guest._id,
      companyId: company.id,
      role: COMPANY_ROLES.RECRUITER,
      status: MEMBERSHIP_STATUS.INVITED,
      invitedAt: new Date(),
    });

    const listed = await (await authGet('/api/me/invitations', guestToken)).json();
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].company.slug, company.slug);
    assert.equal(listed.data[0].role, COMPANY_ROLES.RECRUITER);

    // Not a member yet — the capability must not appear before acceptance.
    const before = await (await authGet('/api/me', guestToken)).json();
    assert.deepEqual(before.data.capabilities.companies, []);

    const accepted = await authPost(
      `/api/me/invitations/${listed.data[0].id}/accept`,
      guestToken,
      {},
    );
    assert.equal(accepted.status, 200);

    const after = await (await authGet('/api/me', guestToken)).json();
    assert.equal(after.data.capabilities.companies.length, 1, 'capability granted on acceptance');
    assert.equal(after.data.capabilities.companies[0].role, COMPANY_ROLES.RECRUITER);
  });

  test('declining removes the invitation without granting anything', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const { body: company } = await createCompany(ownerToken);
    const { accessToken: guestToken, user: guest } = await onboard(OUTSIDER);

    const invite = await CompanyMember.create({
      userId: guest._id,
      companyId: company.id,
      role: COMPANY_ROLES.VIEWER,
      status: MEMBERSHIP_STATUS.INVITED,
    });

    assert.equal(
      (await authPost(`/api/me/invitations/${invite._id}/decline`, guestToken, {})).status,
      200,
    );

    const after = await (await authGet('/api/me', guestToken)).json();
    assert.deepEqual(after.data.capabilities.companies, []);
    assert.deepEqual((await (await authGet('/api/me/invitations', guestToken)).json()).data, []);
  });

  test('cannot accept an invitation addressed to somebody else', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const { body: company } = await createCompany(ownerToken);
    const { user: guest } = await onboard(OUTSIDER);

    const invite = await CompanyMember.create({
      userId: guest._id,
      companyId: company.id,
      role: COMPANY_ROLES.RECRUITER,
      status: MEMBERSHIP_STATUS.INVITED,
    });

    // The OWNER tries to accept the guest's invitation.
    const res = await authPost(`/api/me/invitations/${invite._id}/accept`, ownerToken, {});
    assert.equal(res.status, 404, '404, never 403 — no acknowledgement it exists');
  });

  test('the invitation list is empty for a user with none', async () => {
    const { accessToken } = await onboard(OWNER);
    const body = await (await authGet('/api/me/invitations', accessToken)).json();
    assert.deepEqual(body.data, []);
  });
});

describe('REC-02 setup wizard', () => {
  test('returns ordered steps with per-step progress and named blockers', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);

    const res = await authGet(`/api/companies/${company.slug}/editor`, accessToken);
    const data = (await res.json()).data;

    assert.equal(res.status, 200);
    assert.deepEqual(
      data.steps.map((s) => s.key),
      ['basics', 'brand', 'footprint'],
    );
    assert.equal(data.company.name, 'Rec Test Academy');
    assert.equal(data.checklist.canPublish, false);
    assert.ok(data.checklist.blockers.includes('Tagline'));
    assert.ok(data.checklist.blockers.includes('Short description'));
    assert.ok(data.checklist.blockers.includes('At least one education service'));

    // Basics is already satisfied by creation.
    const basics = data.steps.find((s) => s.key === 'basics');
    assert.equal(basics.complete, true);
  });

  test('a partial step saves — the wizard is draft-first', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);

    const res = await authPatch(`/api/companies/${company.slug}/steps/brand`, accessToken, {
      values: { tagline: 'Only the tagline for now' },
    });
    const data = (await res.json()).data;

    assert.equal(res.status, 200);
    assert.equal(data.company.tagline, 'Only the tagline for now');
    assert.equal(data.checklist.canPublish, false, 'still incomplete, but saved');
  });

  test('a step can only write its OWN fields', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);

    // `tagline` belongs to `brand`; sending it to `footprint` must be ignored.
    await authPatch(`/api/companies/${company.slug}/steps/footprint`, accessToken, {
      values: { tagline: 'smuggled', educationServices: ['academic_tutoring'] },
    });

    const stored = await Company.findById(company.id);
    assert.ok(!stored.tagline, 'field outside the step was not written');
    assert.deepEqual([...stored.educationServices], ['academic_tutoring']);
  });

  test('rejects an unknown step', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);

    const res = await authPatch(`/api/companies/${company.slug}/steps/nope`, accessToken, {
      values: {},
    });
    assert.equal(res.status, 404);
  });

  test('completing every step clears the blockers', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);

    const data = (await (await authGet(`/api/companies/${company.slug}/editor`, accessToken)).json()).data;

    assert.equal(data.checklist.canPublish, true);
    assert.deepEqual(data.checklist.blockers, []);
    assert.ok(data.steps.every((s) => s.complete));
  });
});

describe('REC-06 preview and publish', () => {
  test('preview renders through the SAME serialiser as the public page', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);

    const preview = (await (await authGet(`/api/companies/${company.slug}/preview`, accessToken)).json()).data;

    assert.equal(preview.status, COMPANY_STATUS.DRAFT);
    assert.equal(preview.publicUrl, `/companies/${company.slug}`);
    assert.equal(preview.preview.name, 'Rec Test Academy');
    assert.ok(preview.preview.initials, 'initials generated, as on the public page');
    assert.ok(Array.isArray(preview.preview.openRoles), 'same shape as PUB-02');
    assert.equal(preview.preview.verifiedDomains, undefined, 'raw records never exposed');

    await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});

    const published = (await (await authGet(`/api/companies/${company.slug}/preview`, accessToken)).json()).data;
    const live = (await (await fetch(`${baseUrl}/api/public/companies/${company.slug}`)).json()).data;

    /*
     * The WHOLE payload, not a sample of fields. Spot-checking a handful of keys is what let the
     * preview quietly carry `__v` and `slugHistory` — fields the public projection drops. If the
     * two can differ by even one key, "preview shows the public page" is no longer a guarantee.
     */
    assert.deepEqual(published.preview, live, 'preview payload is not identical to the public page');
  });

  test('publishing is refused while requirements are unmet, and names them', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);

    const res = await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(/Tagline/.test(body.error.details.publish));

    const stored = await Company.findById(company.id);
    assert.equal(stored.status, COMPANY_STATUS.DRAFT, 'nothing was published');
  });

  test('publishing makes the page anonymously readable; unpublishing removes it', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);

    assert.equal((await fetch(`${baseUrl}/api/public/companies/${company.slug}`)).status, 404);

    const published = await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});
    assert.equal(published.status, 200);
    assert.equal((await published.json()).data.status, COMPANY_STATUS.PUBLISHED);

    assert.equal((await fetch(`${baseUrl}/api/public/companies/${company.slug}`)).status, 200);

    const unpublished = await authPost(`/api/companies/${company.slug}/unpublish`, accessToken, {});
    assert.equal((await unpublished.json()).data.status, COMPANY_STATUS.DRAFT);
    assert.equal(
      (await fetch(`${baseUrl}/api/public/companies/${company.slug}`)).status,
      404,
      'unpublishing withdraws it again',
    );
  });

  test('publishedAt is preserved across an unpublish/republish cycle', async () => {
    const { accessToken } = await onboard(OWNER);
    const { body: company } = await createCompany(accessToken);
    await completeSetup(accessToken, company.slug);

    await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});
    const first = (await Company.findById(company.id)).publishedAt;

    await authPost(`/api/companies/${company.slug}/unpublish`, accessToken, {});
    await authPost(`/api/companies/${company.slug}/publish`, accessToken, {});

    const second = (await Company.findById(company.id)).publishedAt;
    assert.equal(first.getTime(), second.getTime(), 'first publication date is not rewritten');
  });
});

describe('REC-02 / REC-06 permissions (ADR-006)', () => {
  test('a non-member cannot read or edit the editor, preview, or publish', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const { body: company } = await createCompany(ownerToken);
    const { accessToken: outsiderToken } = await onboard(OUTSIDER);

    for (const [method, path] of [
      ['GET', `/api/companies/${company.slug}/editor`],
      ['GET', `/api/companies/${company.slug}/preview`],
      ['POST', `/api/companies/${company.slug}/publish`],
      ['POST', `/api/companies/${company.slug}/unpublish`],
    ]) {
      const res = await send(method)(path, outsiderToken, method === 'GET' ? undefined : {});
      assert.ok(res.status === 403 || res.status === 404, `${path} → ${res.status}`);
    }
  });

  test('a VIEWER member cannot edit or publish', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const { body: company } = await createCompany(ownerToken);
    const { accessToken: viewerToken, user: viewer } = await onboard(OUTSIDER);

    await CompanyMember.create({
      userId: viewer._id,
      companyId: company.id,
      role: COMPANY_ROLES.VIEWER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });

    assert.equal(
      (await authPatch(`/api/companies/${company.slug}/steps/brand`, viewerToken, { values: { tagline: 'x' } })).status,
      403,
      'read-only members cannot edit the page',
    );
    assert.equal(
      (await authPost(`/api/companies/${company.slug}/publish`, viewerToken, {})).status,
      403,
    );
  });

  test('every REC route rejects an unauthenticated caller', async () => {
    for (const path of [
      '/api/me/invitations',
      '/api/companies/any-slug/editor',
      '/api/companies/any-slug/preview',
    ]) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 401, path);
    }
  });
});
