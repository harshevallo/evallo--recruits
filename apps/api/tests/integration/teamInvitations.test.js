/**
 * REC-07 team invitations.
 *
 * The behaviours worth pinning are the ones a UI cannot enforce: who may grant which role, that
 * an invitation to an address with no account still works, that the invitee is only matched to
 * that address once they have VERIFIED it, and that duplicates are impossible.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_ROLES, MEMBERSHIP_STATUS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'inv-owner@example.com';
const ADMIN = 'inv-admin@example.com';
const RECRUITER = 'inv-recruiter@example.com';
const VIEWER = 'inv-viewer@example.com';
const INVITEE = 'inv-invitee@example.com';
const STRANGER = 'inv-stranger@example.com';
const NEWCOMER = 'inv-newcomer@example.com'; // deliberately never onboarded
const PASSWORD = 'Password123';

const ALL_EMAILS = [OWNER, ADMIN, RECRUITER, VIEWER, INVITEE, STRANGER, NEWCOMER];

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
    name: 'Invite Test Academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  return bodyOf(res);
}

/**
 * Puts a user in the company at a given role directly. The invitation flow is what is under
 * test — using it to build fixtures would make a failure impossible to localise.
 */
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

  const companies = await Company.find({ slug: /^invite-test-academy/ })
    .select('_id')
    .lean();

  await CompanyMember.deleteMany({
    $or: [
      { userId: { $in: ids } },
      { companyId: { $in: companies.map((c) => c._id) } },
      { invitedEmail: { $in: ALL_EMAILS } },
    ],
  });
  await Session.deleteMany({ userId: { $in: ids } });
  await VerificationToken.deleteMany({ userId: { $in: ids } });
  await Company.deleteMany({ slug: /^invite-test-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('REC-07 sending an invitation', () => {
  test('an owner invites an existing account, and it is bound to that user', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { user: invitee } = await onboard(INVITEE);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: INVITEE,
      role: COMPANY_ROLES.RECRUITER,
    });

    assert.equal(res.status, 201);
    const { invitation } = await bodyOf(res);

    assert.equal(invitation.email, INVITEE);
    assert.equal(invitation.role, COMPANY_ROLES.RECRUITER);
    assert.equal(invitation.status, MEMBERSHIP_STATUS.INVITED);
    assert.equal(invitation.hasAccount, true);
    assert.equal(invitation.invitedBy.email, OWNER, 'the inviter is recorded and shown');
    assert.ok(invitation.invitedAt, 'invited timestamp is set');
    assert.ok(invitation.lastSentAt, 'sent timestamp is set');

    const row = await CompanyMember.findOne({ companyId: company.id, invitedEmail: INVITEE });
    assert.equal(String(row.userId), String(invitee._id), 'bound to the existing account');
    assert.equal(row.status, MEMBERSHIP_STATUS.INVITED);
  });

  test('an address with no account can be invited, and no shell user is created', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.VIEWER,
    });

    assert.equal(res.status, 201);
    const { invitation } = await bodyOf(res);
    assert.equal(invitation.hasAccount, false);
    assert.equal(invitation.email, NEWCOMER);

    const row = await CompanyMember.findOne({ companyId: company.id, invitedEmail: NEWCOMER });
    assert.equal(row.userId, undefined, 'no user id — the address carries the invitation');

    /*
     * The reason a shell User is not created: signup refuses an address that already exists, so
     * fabricating an account here would lock the invitee out of registering.
     */
    assert.equal(await User.countDocuments({ email: NEWCOMER }), 0);

    const signup = await jsonPost('/api/auth/signup', { email: NEWCOMER });
    assert.equal(signup.status, 201, 'an invited stranger can still create their account');
  });

  test('the same address cannot be invited twice', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.RECRUITER,
    });
    const second = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.VIEWER,
    });

    assert.equal(second.status, 409);
    assert.equal((await errorOf(second)).details.email, 'Invitation already sent');
    assert.equal(
      await CompanyMember.countDocuments({ companyId: company.id, invitedEmail: NEWCOMER }),
      1,
    );
  });

  test('an active member cannot be invited again', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: RECRUITER,
      role: COMPANY_ROLES.VIEWER,
    });

    assert.equal(res.status, 409);
    assert.equal((await errorOf(res)).details.email, 'Already a member');
  });

  test('inviting yourself is refused', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: OWNER,
      role: COMPANY_ROLES.ADMIN,
    });

    assert.equal(res.status, 409);
  });

  test('a removed member is re-invited on the SAME row, keeping one audit trail', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { user } = await addMember(company.id, RECRUITER, COMPANY_ROLES.RECRUITER);

    await CompanyMember.updateOne(
      { companyId: company.id, userId: user._id },
      { $set: { status: MEMBERSHIP_STATUS.REMOVED, removedAt: new Date() } },
    );

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: RECRUITER,
      role: COMPANY_ROLES.VIEWER,
    });

    assert.equal(res.status, 201);
    assert.equal(
      await CompanyMember.countDocuments({ companyId: company.id, userId: user._id }),
      1,
      'revived, not duplicated',
    );

    const row = await CompanyMember.findOne({ companyId: company.id, userId: user._id });
    assert.equal(row.status, MEMBERSHIP_STATUS.INVITED);
    assert.equal(row.role, COMPANY_ROLES.VIEWER, 'the new role applies');
    assert.equal(row.removedAt, undefined, 'the stale removal is cleared');
  });

  test('an invalid email is rejected before anything is written', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: 'not-an-email',
      role: COMPANY_ROLES.RECRUITER,
    });

    assert.equal(res.status, 400);
    assert.equal(await CompanyMember.countDocuments({ companyId: company.id }), 1, 'owner only');
  });

  test('an unknown role is rejected', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const res = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: 'superuser',
    });

    assert.equal(res.status, 400);
  });
});

describe('REC-07 permissions (PRD §4.2, ADR-006)', () => {
  test('owner and admin may invite; recruiter and viewer may not', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);

    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);
    const { accessToken: recruiterToken } = await addMember(
      company.id,
      RECRUITER,
      COMPANY_ROLES.RECRUITER,
    );
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const invite = (token, email) =>
      authPost(`/api/companies/${company.slug}/invitations`, token, {
        email,
        role: COMPANY_ROLES.RECRUITER,
      });

    assert.equal((await invite(ownerToken, 'a-' + NEWCOMER)).status, 201);
    assert.equal((await invite(adminToken, 'b-' + NEWCOMER)).status, 201);
    assert.equal((await invite(recruiterToken, 'c-' + NEWCOMER)).status, 403);
    assert.equal((await invite(viewerToken, 'd-' + NEWCOMER)).status, 403);

    await CompanyMember.deleteMany({ invitedEmail: /^[ab]-inv-newcomer/ });
  });

  test('reading the invitation list needs member:manage — it is a list of email addresses', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    assert.equal((await authGet(`/api/companies/${company.slug}/invitations`, ownerToken)).status, 200);
    assert.equal((await authGet(`/api/companies/${company.slug}/invitations`, viewerToken)).status, 403);
  });

  test('an ADMIN cannot mint another owner, but an owner can', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    const { accessToken: adminToken } = await addMember(company.id, ADMIN, COMPANY_ROLES.ADMIN);

    /*
     * The escalation this blocks: `member:manage` is held by admins, `company:transfer` is not.
     * Without the guard an admin who cannot transfer ownership could invite a second owner and
     * arrive at the same power by another route.
     */
    const byAdmin = await authPost(`/api/companies/${company.slug}/invitations`, adminToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.OWNER,
    });
    assert.equal(byAdmin.status, 403);

    const byOwner = await authPost(`/api/companies/${company.slug}/invitations`, ownerToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.OWNER,
    });
    assert.equal(byOwner.status, 201);
  });

  test('a non-member sees 404, never 403 — membership is not disclosed', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    const { accessToken: strangerToken } = await onboard(STRANGER);

    const res = await authGet(`/api/companies/${company.slug}/invitations`, strangerToken);
    assert.equal(res.status, 404);
  });

  test('unauthenticated requests are refused', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const res = await fetch(`${baseUrl}/api/companies/${company.slug}/invitations`);
    assert.equal(res.status, 401);
  });
});

describe('REC-07 managing invitations', () => {
  test('the list shows status, role, inviter and timestamps', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.RECRUITER,
    });

    const { invitations, yourRole } = await bodyOf(
      await authGet(`/api/companies/${company.slug}/invitations`, accessToken),
    );

    assert.equal(yourRole, COMPANY_ROLES.OWNER);
    assert.equal(invitations.length, 1);
    assert.equal(invitations[0].email, NEWCOMER);
    assert.equal(invitations[0].status, MEMBERSHIP_STATUS.INVITED);
    assert.equal(invitations[0].invitedBy.email, OWNER);
    assert.ok(invitations[0].invitedAt);
    assert.ok(invitations[0].lastSentAt);
  });

  test('the list is empty for a company that has invited nobody', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { invitations } = await bodyOf(
      await authGet(`/api/companies/${company.slug}/invitations`, accessToken),
    );
    assert.deepEqual(invitations, []);
  });

  test('resending is rate limited, and does not change the original invite date', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { invitation } = await bodyOf(
      await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
        email: NEWCOMER,
        role: COMPANY_ROLES.RECRUITER,
      }),
    );

    // Immediately after sending, a resend is refused — the button must not be a mail-bomb.
    const tooSoon = await authPost(
      `/api/companies/${company.slug}/invitations/${invitation.id}/resend`,
      accessToken,
    );
    assert.equal(tooSoon.status, 429);

    // Age the invitation past the cooldown rather than sleeping through it.
    const { RESEND_COOLDOWN_MS } = await import(
      '../../src/modules/memberships/invitation.service.js'
    );
    await CompanyMember.updateOne(
      { _id: invitation.id },
      { $set: { invitationLastSentAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) } },
    );

    const resent = await authPost(
      `/api/companies/${company.slug}/invitations/${invitation.id}/resend`,
      accessToken,
    );
    assert.equal(resent.status, 200);
    assert.equal((await bodyOf(resent)).resent, true);

    const row = await CompanyMember.findById(invitation.id);
    assert.equal(
      row.invitedAt.toISOString(),
      new Date(invitation.invitedAt).toISOString(),
      'the original invite date is preserved across a resend',
    );
    assert.ok(row.invitationLastSentAt > row.invitedAt, 'only the sent timestamp moves');
  });

  test('cancelling retains the row and frees the address for a fresh invitation', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { invitation } = await bodyOf(
      await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
        email: NEWCOMER,
        role: COMPANY_ROLES.RECRUITER,
      }),
    );

    const cancelled = await authPost(
      `/api/companies/${company.slug}/invitations/${invitation.id}/cancel`,
      accessToken,
    );
    assert.equal(cancelled.status, 200);

    const row = await CompanyMember.findById(invitation.id);
    assert.equal(row.status, MEMBERSHIP_STATUS.REMOVED, 'retained, not deleted (PRD §21.6)');
    assert.ok(row.removedAt);

    const { invitations } = await bodyOf(
      await authGet(`/api/companies/${company.slug}/invitations`, accessToken),
    );
    assert.equal(invitations.length, 0, 'no longer outstanding');

    // The unique index is filtered on `invited`, so the retained row must not block a re-invite.
    const again = await authPost(`/api/companies/${company.slug}/invitations`, accessToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.VIEWER,
    });
    assert.equal(again.status, 201);
  });

  test('an invitation belonging to another company is invisible, not forbidden', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const companyA = await createCompany(ownerToken);

    const { accessToken: strangerToken } = await onboard(STRANGER);
    const companyB = await bodyOf(
      await authPost('/api/companies', strangerToken, {
        name: 'Invite Test Academy Two',
        organizationType: 'tutoring_center',
        location: { country: 'IN' },
      }),
    );

    const { invitation } = await bodyOf(
      await authPost(`/api/companies/${companyA.slug}/invitations`, ownerToken, {
        email: NEWCOMER,
        role: COMPANY_ROLES.RECRUITER,
      }),
    );

    const res = await authPost(
      `/api/companies/${companyB.slug}/invitations/${invitation.id}/cancel`,
      strangerToken,
    );
    assert.equal(res.status, 404);
  });
});

describe('REC-07 → REC-01 handover', () => {
  test('an invited existing user sees the invitation and can accept it', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    const { accessToken: inviteeToken } = await onboard(INVITEE);

    await authPost(`/api/companies/${company.slug}/invitations`, ownerToken, {
      email: INVITEE,
      role: COMPANY_ROLES.RECRUITER,
    });

    const pending = await bodyOf(await authGet('/api/me/invitations', inviteeToken));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].company.slug, company.slug);
    assert.equal(pending[0].role, COMPANY_ROLES.RECRUITER);
    assert.equal(pending[0].invitedBy.email, OWNER, 'the invitee sees who invited them');

    const accepted = await authPost(
      `/api/me/invitations/${pending[0].id}/accept`,
      inviteeToken,
    );
    assert.equal(accepted.status, 200);

    // ADR-001: the recruiter capability is derived from the membership, never stored on the user.
    const { capabilities } = await bodyOf(await authGet('/api/me', inviteeToken));
    assert.equal(capabilities.companies.length, 1);
    assert.equal(capabilities.companies[0].role, COMPANY_ROLES.RECRUITER);
  });

  test('an address-bound invitation is claimed only after the invitee VERIFIES that address', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);

    await authPost(`/api/companies/${company.slug}/invitations`, ownerToken, {
      email: NEWCOMER,
      role: COMPANY_ROLES.RECRUITER,
    });

    // The invitee signs up but has not verified yet.
    await jsonPost('/api/auth/signup', { email: NEWCOMER });
    const newcomer = await User.findOne({ email: NEWCOMER });
    assert.equal(newcomer.emailVerified, false);

    const { listPendingInvitations } = await import(
      '../../src/modules/memberships/invitation.service.js'
    );

    assert.deepEqual(
      await listPendingInvitations(newcomer.toObject()),
      [],
      'an unverified address claims nothing — otherwise registering someone else’s address would steal their invitations',
    );

    // Now verify, exactly as AUTH-03 does.
    await User.updateOne({ _id: newcomer._id }, { $set: { emailVerified: true } });
    const verified = await User.findById(newcomer._id).lean();

    const pending = await listPendingInvitations(verified);
    assert.equal(pending.length, 1, 'the invitation is claimable once the address is proven');
    assert.equal(pending[0].company.slug, company.slug);

    const { acceptInvitation } = await import(
      '../../src/modules/memberships/invitation.service.js'
    );
    await acceptInvitation(verified, pending[0].id);

    const row = await CompanyMember.findOne({ companyId: company.id, invitedEmail: NEWCOMER });
    assert.equal(row.status, MEMBERSHIP_STATUS.ACTIVE);
    assert.equal(String(row.userId), String(newcomer._id), 'the row is bound to the account');
    assert.ok(row.acceptedAt);
  });

  test('a cancelled invitation cannot be accepted', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    const { accessToken: inviteeToken } = await onboard(INVITEE);

    await authPost(`/api/companies/${company.slug}/invitations`, ownerToken, {
      email: INVITEE,
      role: COMPANY_ROLES.RECRUITER,
    });

    const pending = await bodyOf(await authGet('/api/me/invitations', inviteeToken));
    const invitationId = pending[0].id;

    await authPost(
      `/api/companies/${company.slug}/invitations/${invitationId}/cancel`,
      ownerToken,
    );

    const accepted = await authPost(`/api/me/invitations/${invitationId}/accept`, inviteeToken);
    assert.equal(accepted.status, 404, 'a withdrawn invitation is gone, not merely hidden');
  });

  test('one person cannot accept an invitation addressed to another', async () => {
    const { accessToken: ownerToken } = await onboard(OWNER);
    const company = await createCompany(ownerToken);
    await onboard(INVITEE);
    const { accessToken: strangerToken } = await onboard(STRANGER);

    const { invitation } = await bodyOf(
      await authPost(`/api/companies/${company.slug}/invitations`, ownerToken, {
        email: INVITEE,
        role: COMPANY_ROLES.RECRUITER,
      }),
    );

    const res = await authPost(`/api/me/invitations/${invitation.id}/accept`, strangerToken);
    assert.equal(res.status, 404);
  });
});
