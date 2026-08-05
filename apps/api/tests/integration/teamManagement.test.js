/**
 * REC-08 team management and REC-09 ownership transfer.
 *
 * The behaviours worth pinning are the ones that decide who controls a company: that an admin
 * cannot reach past `member:manage` into ownership, that a company can never be left without an
 * owner, and that a transfer ends with EXACTLY one owner rather than nought or two.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_ROLES, MEMBERSHIP_STATUS, PERMISSIONS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'tm-owner@example.com';
const OWNER2 = 'tm-owner2@example.com';
const ADMIN = 'tm-admin@example.com';
const RECRUITER = 'tm-recruiter@example.com';
const VIEWER = 'tm-viewer@example.com';
const STRANGER = 'tm-stranger@example.com';
const PASSWORD = 'Password123';

const ALL_EMAILS = [OWNER, OWNER2, ADMIN, RECRUITER, VIEWER, STRANGER];

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

const authDelete = (path, token) =>
  fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

const bodyOf = async (res) => (await res.json()).data;
const errorOf = async (res) => (await res.json()).error;

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

async function createCompany(token) {
  const res = await authPost('/api/companies', token, {
    name: 'Team Mgmt Academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  return bodyOf(res);
}

/** Places a user in the company at a role directly — the routes under test build no fixtures. */
async function addMember(companyId, email, role) {
  const { accessToken, user } = await onboard(email);
  const membership = await CompanyMember.create({
    companyId,
    userId: user._id,
    role,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });
  return { accessToken, user, membershipId: String(membership._id) };
}

/** The owner's own membership id, which several guards key on. */
async function membershipIdOf(companyId, userId) {
  const row = await CompanyMember.findOne({ companyId, userId }).select('_id').lean();
  return String(row._id);
}

const activeOwners = (companyId) =>
  CompanyMember.countDocuments({
    companyId,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
  });

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

  const companies = await Company.find({ slug: /^team-mgmt-academy/ })
    .select('_id')
    .lean();

  await CompanyMember.deleteMany({
    $or: [{ userId: { $in: ids } }, { companyId: { $in: companies.map((c) => c._id) } }],
  });
  await Session.deleteMany({ userId: { $in: ids } });
  await VerificationToken.deleteMany({ userId: { $in: ids } });
  await Company.deleteMany({ slug: /^team-mgmt-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

/* ── REC-08 — the member list ─────────────────────────────────────────────────────────────── */

describe('REC-08 member list', () => {
  test('lists active members with role, user and join date', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);

    const body = await bodyOf(await authGet(`/api/companies/${company.slug}/members`, accessToken));

    assert.equal(body.yourRole, COMPANY_ROLES.OWNER);
    assert.equal(body.members.length, 2);

    const recruiter = body.members.find((m) => m.user.email === RECRUITER);
    assert.equal(recruiter.role, COMPANY_ROLES.RECRUITER);
    assert.equal(recruiter.status, MEMBERSHIP_STATUS.ACTIVE);
    assert.ok(recruiter.joinedAt, 'join date is shown');
  });

  test('a removed member disappears from the list but keeps their row', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId } = await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);
    assert.ok(user);

    await authDelete(`/api/companies/${company.slug}/members/${membershipId}`, accessToken);

    const body = await bodyOf(await authGet(`/api/companies/${company.slug}/members`, accessToken));
    assert.equal(body.members.length, 1, 'only the owner remains listed');

    const row = await CompanyMember.findById(membershipId).lean();
    assert.equal(row.status, MEMBERSHIP_STATUS.REMOVED, 'retained for the audit trail (§21.6)');
    assert.ok(row.removedAt);
  });
});

/* ── REC-08 — role changes ────────────────────────────────────────────────────────────────── */

describe('REC-08 role changes', () => {
  test('an owner changes a member role, and the change takes effect immediately', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: viewerToken, membershipId } = await addMember(
      company.id,
      VIEWER,
      COMPANY_ROLES.VIEWER,
    );

    // A viewer cannot read the team list — member:manage is withheld from them.
    assert.equal((await authGet(`/api/companies/${company.slug}/members`, viewerToken)).status, 403);

    const res = await authPatch(`/api/companies/${company.slug}/members/${membershipId}`, accessToken, {
      role: COMPANY_ROLES.ADMIN,
    });
    assert.equal(res.status, 200);
    assert.equal((await bodyOf(res)).member.role, COMPANY_ROLES.ADMIN);

    /*
     * The point of ADR-006: permissions are re-read per request, so the promoted member's new
     * authority applies to their very next call without re-issuing a token.
     */
    assert.equal((await authGet(`/api/companies/${company.slug}/members`, viewerToken)).status, 200);
  });

  test('repeating a role change is idempotent rather than an error', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const first = await authPatch(
      `/api/companies/${company.slug}/members/${membershipId}`,
      accessToken,
      { role: COMPANY_ROLES.RECRUITER },
    );
    const second = await authPatch(
      `/api/companies/${company.slug}/members/${membershipId}`,
      accessToken,
      { role: COMPANY_ROLES.RECRUITER },
    );

    assert.equal((await bodyOf(first)).changed, true);
    assert.equal(second.status, 200);
    assert.equal((await bodyOf(second)).changed, false);
  });

  test('you cannot change your own role', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const own = await membershipIdOf(company.id, user._id);

    const res = await authPatch(`/api/companies/${company.slug}/members/${own}`, accessToken, {
      role: COMPANY_ROLES.ADMIN,
    });

    assert.equal(res.status, 409);
    assert.match((await errorOf(res)).message, /your own role/i);
    assert.equal(await activeOwners(company.id), 1);
  });

  test('an ADMIN cannot promote anyone to owner', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);
    const { membershipId } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const res = await authPatch(`/api/companies/${company.slug}/members/${membershipId}`, adminToken, {
      role: COMPANY_ROLES.OWNER,
    });

    assert.equal(res.status, 403, 'member:manage is not company:transfer');
    assert.equal(await activeOwners(company.id), 1);
  });

  test("an ADMIN cannot demote an owner, but another owner can", async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);
    const { membershipId: secondOwner } = await addMember(company.id, OWNER2, COMPANY_ROLES.OWNER);

    const refused = await authPatch(
      `/api/companies/${company.slug}/members/${secondOwner}`,
      adminToken,
      { role: COMPANY_ROLES.VIEWER },
    );
    assert.equal(refused.status, 403);
    assert.equal(await activeOwners(company.id), 2);

    const allowed = await authPatch(
      `/api/companies/${company.slug}/members/${secondOwner}`,
      accessToken,
      { role: COMPANY_ROLES.VIEWER },
    );
    assert.equal(allowed.status, 200);
    assert.equal(await activeOwners(company.id), 1);
  });

  /*
   * Reaching the last-owner guard takes a delegated `company:transfer`.
   *
   * Through roles alone it is unreachable: demoting an owner requires company:transfer, only an
   * owner holds that, and nobody may change their own role — so a second owner always exists and
   * the target is never the last one. `permissionOverrides` (the model's documented way to
   * delegate ownership transfer to an admin) is the path that CAN reach it, which is exactly why
   * the guard has to exist rather than being implied by the role rules.
   */
  test('the last owner cannot be demoted, even by a delegated transfer permission', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const soleOwnerId = await membershipIdOf(company.id, (await User.findOne({ email: OWNER }))._id);

    const { accessToken: delegateToken, membershipId: delegateId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.ADMIN,
    );
    await CompanyMember.findByIdAndUpdate(delegateId, {
      permissionOverrides: [PERMISSIONS.COMPANY_TRANSFER],
    });

    assert.equal(await activeOwners(company.id), 1, 'exactly one owner to protect');

    const res = await authPatch(
      `/api/companies/${company.slug}/members/${soleOwnerId}`,
      delegateToken,
      { role: COMPANY_ROLES.VIEWER },
    );

    assert.equal(res.status, 409, 'the permission is granted; the last-owner rule still refuses');
    assert.match((await errorOf(res)).message, /only owner/i);
    assert.equal(await activeOwners(company.id), 1);
    assert.equal(
      (await CompanyMember.findById(soleOwnerId)).role,
      COMPANY_ROLES.OWNER,
      'nothing was written',
    );
  });

  test('a non-last owner CAN be demoted by a delegated transfer permission', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId: secondOwnerId } = await addMember(company.id, OWNER2, COMPANY_ROLES.OWNER);

    const { accessToken: delegateToken, membershipId: delegateId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.ADMIN,
    );
    await CompanyMember.findByIdAndUpdate(delegateId, {
      permissionOverrides: [PERMISSIONS.COMPANY_TRANSFER],
    });

    const res = await authPatch(
      `/api/companies/${company.slug}/members/${secondOwnerId}`,
      delegateToken,
      { role: COMPANY_ROLES.VIEWER },
    );

    assert.equal(res.status, 200, 'two owners existed, so this is the guard permitting the change');
    assert.equal(await activeOwners(company.id), 1);
  });

  test('an unknown role is rejected before anything is written', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const res = await authPatch(`/api/companies/${company.slug}/members/${membershipId}`, accessToken, {
      role: 'wizard',
    });

    assert.equal(res.status, 400);
    assert.equal((await CompanyMember.findById(membershipId)).role, COMPANY_ROLES.VIEWER);
  });
});

/* ── REC-08 — removal ─────────────────────────────────────────────────────────────────────── */

describe('REC-08 member removal', () => {
  test('removing a member revokes their access immediately', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: adminToken, membershipId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.ADMIN,
    );

    assert.equal((await authGet(`/api/companies/${company.slug}/members`, adminToken)).status, 200);

    await authDelete(`/api/companies/${company.slug}/members/${membershipId}`, accessToken);

    const after = await authGet(`/api/companies/${company.slug}/members`, adminToken);
    assert.equal(after.status, 404, 'no longer a member — and membership is not disclosed');
  });

  test('you cannot remove yourself', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const own = await membershipIdOf(company.id, user._id);

    const res = await authDelete(`/api/companies/${company.slug}/members/${own}`, accessToken);

    assert.equal(res.status, 409);
    assert.equal(await activeOwners(company.id), 1);
  });

  test('a plain admin may not remove an owner at all', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const ownerId = await membershipIdOf(company.id, (await User.findOne({ email: OWNER }))._id);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);

    const res = await authDelete(`/api/companies/${company.slug}/members/${ownerId}`, adminToken);

    assert.equal(res.status, 403);
    assert.equal(await activeOwners(company.id), 1);
  });

  /** Same delegated-permission path as the demotion guard — see the note there. */
  test('the last owner cannot be removed, even by a delegated transfer permission', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const soleOwnerId = await membershipIdOf(company.id, (await User.findOne({ email: OWNER }))._id);

    const { accessToken: delegateToken, membershipId: delegateId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.ADMIN,
    );
    await CompanyMember.findByIdAndUpdate(delegateId, {
      permissionOverrides: [PERMISSIONS.COMPANY_TRANSFER],
    });

    const res = await authDelete(
      `/api/companies/${company.slug}/members/${soleOwnerId}`,
      delegateToken,
    );

    assert.equal(res.status, 409);
    assert.match((await errorOf(res)).message, /only owner/i);
    assert.equal(await activeOwners(company.id), 1);
    assert.equal(
      (await CompanyMember.findById(soleOwnerId)).status,
      MEMBERSHIP_STATUS.ACTIVE,
      'nothing was written',
    );
    assert.ok(accessToken);
  });

  test('a second owner CAN be removed while another owner remains', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId: secondOwnerId } = await addMember(company.id, OWNER2, COMPANY_ROLES.OWNER);

    const res = await authDelete(
      `/api/companies/${company.slug}/members/${secondOwnerId}`,
      accessToken,
    );

    assert.equal(res.status, 200);
    assert.equal(await activeOwners(company.id), 1);
  });

  test('a member of another company is invisible, not forbidden', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { accessToken: strangerToken } = await onboard(STRANGER);
    const otherCompany = await createCompany(strangerToken);
    const foreignId = await membershipIdOf(
      otherCompany.id,
      (await User.findOne({ email: STRANGER }))._id,
    );

    const res = await authDelete(
      `/api/companies/${company.slug}/members/${foreignId}`,
      accessToken,
    );
    assert.equal(res.status, 404);
    assert.equal(
      (await CompanyMember.findById(foreignId)).status,
      MEMBERSHIP_STATUS.ACTIVE,
      'the other company is untouched',
    );
  });
});

/* ── REC-08 — permissions (PRD §4.2) ──────────────────────────────────────────────────────── */

describe('REC-08 permissions', () => {
  test('owner and admin may manage; recruiter and viewer may not', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);
    const { accessToken: recruiterToken } = await addMember(
      company.id,
      RECRUITER,
      COMPANY_ROLES.RECRUITER,
    );
    const { accessToken: viewerToken, membershipId: target } = await addMember(
      company.id,
      VIEWER,
      COMPANY_ROLES.VIEWER,
    );

    const change = (token) =>
      authPatch(`/api/companies/${company.slug}/members/${target}`, token, {
        role: COMPANY_ROLES.RECRUITER,
      });

    assert.equal((await change(accessToken)).status, 200);
    assert.equal((await change(adminToken)).status, 200);
    assert.equal((await change(recruiterToken)).status, 403);
    assert.equal((await change(viewerToken)).status, 403);
  });

  test('unauthenticated requests are refused', async () => {
    const res = await fetch(`${baseUrl}/api/companies/any-slug/members/000000000000000000000000`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 401);
  });
});

/* ── REC-09 — ownership transfer ──────────────────────────────────────────────────────────── */

describe('REC-09 ownership transfer', () => {
  test('transfer leaves EXACTLY one owner, and the outgoing owner becomes an admin', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId: successorId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.RECRUITER,
    );

    const res = await authPost(
      `/api/companies/${company.slug}/members/${successorId}/transfer-ownership`,
      accessToken,
    );

    assert.equal(res.status, 200);
    const body = await bodyOf(res);
    assert.equal(body.transferred, true);
    assert.equal(body.owner.role, COMPANY_ROLES.OWNER);
    assert.equal(body.owner.user.email, ADMIN);
    assert.equal(body.you.role, COMPANY_ROLES.ADMIN, 'the outgoing owner keeps access as admin');

    assert.equal(await activeOwners(company.id), 1, 'exactly one owner (PRD §21.2)');

    const outgoing = await CompanyMember.findOne({ companyId: company.id, userId: user._id }).lean();
    assert.equal(outgoing.role, COMPANY_ROLES.ADMIN);
    assert.equal(outgoing.status, MEMBERSHIP_STATUS.ACTIVE);
  });

  test('the new owner can transfer back; the old one can no longer transfer', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: successorToken, membershipId: successorId } = await addMember(
      company.id,
      ADMIN,
      COMPANY_ROLES.RECRUITER,
    );

    await authPost(
      `/api/companies/${company.slug}/members/${successorId}/transfer-ownership`,
      accessToken,
    );

    const formerOwnerId = await membershipIdOf(
      company.id,
      (await User.findOne({ email: OWNER }))._id,
    );

    // The former owner is now an admin: member:manage yes, company:transfer no.
    const refused = await authPost(
      `/api/companies/${company.slug}/members/${successorId}/transfer-ownership`,
      accessToken,
    );
    assert.equal(refused.status, 403);

    const back = await authPost(
      `/api/companies/${company.slug}/members/${formerOwnerId}/transfer-ownership`,
      successorToken,
    );
    assert.equal(back.status, 200);
    assert.equal(await activeOwners(company.id), 1);
  });

  test('an ADMIN cannot transfer ownership', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);
    const { membershipId: targetId } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const res = await authPost(
      `/api/companies/${company.slug}/members/${targetId}/transfer-ownership`,
      adminToken,
    );

    assert.equal(res.status, 403);
    assert.equal(await activeOwners(company.id), 1);
  });

  test('transferring to yourself, or to an existing owner, is refused', async () => {
    const { accessToken, user } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const own = await membershipIdOf(company.id, user._id);
    const { membershipId: otherOwner } = await addMember(company.id, OWNER2, COMPANY_ROLES.OWNER);

    const toSelf = await authPost(
      `/api/companies/${company.slug}/members/${own}/transfer-ownership`,
      accessToken,
    );
    assert.equal(toSelf.status, 409);

    const toOwner = await authPost(
      `/api/companies/${company.slug}/members/${otherOwner}/transfer-ownership`,
      accessToken,
    );
    assert.equal(toOwner.status, 409);
  });

  test('ownership cannot be transferred to a removed member', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { membershipId } = await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);

    await authDelete(`/api/companies/${company.slug}/members/${membershipId}`, accessToken);

    const res = await authPost(
      `/api/companies/${company.slug}/members/${membershipId}/transfer-ownership`,
      accessToken,
    );

    assert.equal(res.status, 404, 'only ACTIVE members are transfer targets');
    assert.equal(await activeOwners(company.id), 1);
  });
});
