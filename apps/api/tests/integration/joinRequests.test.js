/**
 * REC-01 company search and join requests (PRD §7.2), plus recruiter identity in chat (§11.2).
 *
 * The rules pinned here are the ones a refactor could quietly break:
 *
 *   · a join request grants NOTHING until approved — the requester must have no access meanwhile
 *   · the APPROVER chooses the role; a requester cannot obtain `owner` by asking for it
 *   · only `member:manage` may review requests
 *   · search returns PUBLISHED companies only, so an unpublished presence is not discoverable
 *   · asking twice is idempotent, and a suspended member cannot re-enter by asking
 *   · the candidate sees the individual recruiter's NAME, and never their email
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  COMPANY_STATUS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CompanyJoinRequest } from '../../src/modules/memberships/joinRequest.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { Conversation } from '../../src/modules/messaging/conversation.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'jr-owner@example.com';
const ADMIN = 'jr-admin@example.com';
const RECRUITER = 'jr-recruiter@example.com';
const JOINER = 'jr-joiner@example.com';
const CANDIDATE = 'jr-candidate@example.com';
const PASSWORD = 'Password123';
const ALL = [OWNER, ADMIN, RECRUITER, JOINER, CANDIDATE];

const PUBLISHED_NAME = 'Northwind Tutoring Collective';
const DRAFT_NAME = 'Northwind Draft Academy';

const jsonPost = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

let owner;
let adminToken;
let recruiterToken;
let joiner;
let published;
let draft;

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  const users = await User.find({ email: { $in: ALL } }).select('_id');
  const userIds = users.map((u) => u._id);
  const companies = await Company.find({ name: { $in: [PUBLISHED_NAME, DRAFT_NAME] } }).select('_id');
  const companyIds = companies.map((c) => c._id);

  await Promise.all([
    CompanyJoinRequest.deleteMany({ $or: [{ userId: { $in: userIds } }, { companyId: { $in: companyIds } }] }),
    CompanyMember.deleteMany({ $or: [{ userId: { $in: userIds } }, { companyId: { $in: companyIds } }] }),
    /*
     * By PARTICIPANT, never by a legacy field: `strictQuery` drops filter paths the schema no longer
     * declares, so `deleteMany({ companyId })` would silently become `deleteMany({})`.
     */
    Conversation.deleteMany({ participants: { $in: userIds } }),
    CandidateProfile.deleteMany({ userId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
  ]);
  await Company.deleteMany({ name: { $in: [PUBLISHED_NAME, DRAFT_NAME] } });
  await User.deleteMany({ email: { $in: ALL } });

  owner = await onboard(OWNER, { name: 'Olive Owner' });

  const createdPublished = await bodyOf(
    await authPost('/api/companies', owner.accessToken, {
      name: PUBLISHED_NAME,
      organizationType: 'tutoring_center',
      location: { country: 'IN', city: 'Bengaluru' },
    }),
  );
  published = createdPublished;
  // Published, so it is discoverable by search — the state a joinable company is in.
  await Company.findByIdAndUpdate(published.id, { status: COMPANY_STATUS.PUBLISHED });

  const createdDraft = await bodyOf(
    await authPost('/api/companies', owner.accessToken, {
      name: DRAFT_NAME,
      organizationType: 'tutoring_center',
      location: { country: 'IN', city: 'Bengaluru' },
    }),
  );
  draft = createdDraft; // left as draft deliberately

  const admin = await onboard(ADMIN, { name: 'Adam Admin' });
  adminToken = admin.accessToken;
  await CompanyMember.create({
    companyId: published.id,
    userId: admin.user._id,
    role: COMPANY_ROLES.ADMIN,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });

  const recruiter = await onboard(RECRUITER, { name: 'Rita Recruiter' });
  recruiterToken = recruiter.accessToken;
  await CompanyMember.create({
    companyId: published.id,
    userId: recruiter.user._id,
    role: COMPANY_ROLES.RECRUITER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });

  joiner = await onboard(JOINER, { name: 'Jamie Joiner' });
});

describe('REC-01 company search', () => {
  test('finds published companies and reports the caller relationship', async () => {
    const data = await bodyOf(
      await authGet('/api/companies/search?q=Northwind', joiner.accessToken),
    );

    const names = data.companies.map((c) => c.name);
    assert.ok(names.includes(PUBLISHED_NAME));
    assert.equal(
      names.includes(DRAFT_NAME),
      false,
      'an unpublished company must not be discoverable — PRD §9.3',
    );
    assert.equal(data.companies.find((c) => c.name === PUBLISHED_NAME).relationship, 'none');
  });

  test('a member sees themselves as a member rather than being offered a join', async () => {
    const data = await bodyOf(await authGet('/api/companies/search?q=Northwind', recruiterToken));
    assert.equal(data.companies.find((c) => c.name === PUBLISHED_NAME).relationship, 'member');
  });

  test('a one-character query returns nothing rather than scanning', async () => {
    const data = await bodyOf(await authGet('/api/companies/search?q=N', joiner.accessToken));
    assert.deepEqual(data.companies, []);
  });

  test('search requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/companies/search?q=Northwind`);
    assert.equal(res.status, 401);
  });
});

describe('REC-01 join requests', () => {
  test('a request grants no access until it is approved', async () => {
    const created = await authPost(
      `/api/companies/${published.id}/join-requests`,
      joiner.accessToken,
      { message: 'I work here' },
    );
    assert.equal(created.status, 201);
    assert.equal((await bodyOf(created)).request.status, 'pending');

    // No membership row exists yet, so nothing can have been granted.
    assert.equal(
      await CompanyMember.countDocuments({ companyId: published.id, userId: joiner.user._id }),
      0,
    );

    // And the company surface still refuses them.
    const dashboard = await authGet(`/api/companies/${published.id}/dashboard`, joiner.accessToken);
    assert.equal(dashboard.status, 404, 'a pending request must not resolve company context');
  });

  test('asking twice is idempotent', async () => {
    const first = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );
    const second = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    assert.equal(second.request.id, first.request.id);
    assert.equal(await CompanyJoinRequest.countDocuments({ companyId: published.id }), 1);
  });

  test('an unpublished company cannot be joined this way', async () => {
    const res = await authPost(`/api/companies/${draft.id}/join-requests`, joiner.accessToken, {});
    assert.equal(res.status, 404);
  });

  test('an existing member cannot request to join', async () => {
    const res = await authPost(`/api/companies/${published.id}/join-requests`, recruiterToken, {});
    assert.equal(res.status, 409);
  });

  test('a suspended member cannot re-enter by asking', async () => {
    await CompanyMember.updateOne(
      { companyId: published.id, userId: joiner.user._id },
      {
        $set: {
          companyId: published.id,
          userId: joiner.user._id,
          role: COMPANY_ROLES.RECRUITER,
          status: MEMBERSHIP_STATUS.SUSPENDED,
        },
      },
      { upsert: true },
    );

    const res = await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {});
    assert.equal(res.status, 403);
  });

  test('only member:manage may review requests', async () => {
    await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {});

    // A recruiter holds no member:manage.
    assert.equal(
      (await authGet(`/api/companies/${published.id}/join-requests`, recruiterToken)).status,
      403,
    );
    // The requester certainly does not.
    assert.equal(
      (await authGet(`/api/companies/${published.id}/join-requests`, joiner.accessToken)).status,
      404,
      'a non-member gets not-found, not a permission hint',
    );
    // An admin does.
    assert.equal(
      (await authGet(`/api/companies/${published.id}/join-requests`, adminToken)).status,
      200,
    );
  });

  test('approval grants an ACTIVE membership with the role the APPROVER chose', async () => {
    const { request } = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    const approved = await bodyOf(
      await authPost(
        `/api/companies/${published.id}/join-requests/${request.id}/approve`,
        adminToken,
        { role: COMPANY_ROLES.VIEWER },
      ),
    );
    assert.equal(approved.request.status, 'approved');
    assert.equal(approved.request.grantedRole, COMPANY_ROLES.VIEWER);

    const member = await CompanyMember.findOne({
      companyId: published.id,
      userId: joiner.user._id,
    });
    assert.equal(member.status, MEMBERSHIP_STATUS.ACTIVE);
    assert.equal(member.role, COMPANY_ROLES.VIEWER, 'the approver chose viewer, not recruiter');

    // The company surface now admits them.
    assert.equal(
      (await authGet(`/api/companies/${published.id}/dashboard`, joiner.accessToken)).status,
      200,
    );
  });

  test('a requester cannot obtain ownership by asking for it', async () => {
    // The request body rejects `owner` outright at the edge.
    const asked = await authPost(
      `/api/companies/${published.id}/join-requests`,
      joiner.accessToken,
      { requestedRole: COMPANY_ROLES.OWNER },
    );
    assert.equal(asked.status, 400);

    const { request } = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    // And approval cannot grant it either.
    const res = await authPost(
      `/api/companies/${published.id}/join-requests/${request.id}/approve`,
      adminToken,
      { role: COMPANY_ROLES.OWNER },
    );
    assert.equal(res.status, 400);

    const owners = await CompanyMember.countDocuments({
      companyId: published.id,
      role: COMPANY_ROLES.OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
    assert.equal(owners, 1, 'the company still has exactly one owner');
  });

  test('declining records the decision and grants nothing', async () => {
    const { request } = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    const declined = await bodyOf(
      await authPost(
        `/api/companies/${published.id}/join-requests/${request.id}/decline`,
        adminToken,
      ),
    );
    assert.equal(declined.request.status, 'declined');
    assert.equal(
      await CompanyMember.countDocuments({ companyId: published.id, userId: joiner.user._id }),
      0,
    );

    // A resolved request cannot be decided twice.
    assert.equal(
      (
        await authPost(
          `/api/companies/${published.id}/join-requests/${request.id}/approve`,
          adminToken,
          {},
        )
      ).status,
      409,
    );

    // And it does not block asking again later.
    assert.equal(
      (await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}))
        .status,
      201,
    );
  });

  test('the requester can see and withdraw their own request', async () => {
    const { request } = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    const mine = await bodyOf(await authGet('/api/me/join-requests', joiner.accessToken));
    assert.equal(mine.requests.length, 1);
    assert.equal(mine.requests[0].company.name, PUBLISHED_NAME);

    assert.equal(
      (await authPost(`/api/me/join-requests/${request.id}/withdraw`, joiner.accessToken)).status,
      200,
    );

    const after = await bodyOf(await authGet('/api/me/join-requests', joiner.accessToken));
    assert.equal(after.requests.length, 0);
  });

  test('one person cannot withdraw another person\'s request', async () => {
    const { request } = await bodyOf(
      await authPost(`/api/companies/${published.id}/join-requests`, joiner.accessToken, {}),
    );

    const res = await authPost(`/api/me/join-requests/${request.id}/withdraw`, adminToken);
    assert.equal(res.status, 404);
  });
});

/**
 * Updated for ADR-025: a conversation is between two PEOPLE, keyed on the pair of user ids.
 *
 * Two employees who each write to one candidate hold two separate conversations, the company is
 * context on each, and the owner cannot open the recruiter's — reported as absent, not forbidden.
 * The PRD §11.2 guarantees these tests always protected are unchanged: the candidate sees an
 * individual's NAME and never an email address.
 */
describe('Recruiter identity in chat (PRD §11.2)', () => {
  test('the candidate sees the individual recruiter name, and never their email', async () => {
    const candidate = await onboard(CANDIDATE, { name: 'Chris Candidate' });
    const profile = await CandidateProfile.create({
      userId: candidate.user._id,
      status: CANDIDATE_VISIBILITY.DISCOVERABLE,
      contactVisibility: CONTACT_VISIBILITY.HIDDEN,
      publishedAt: new Date(),
      headline: 'SAT maths tutor',
    });

    // Two different employees write to the same candidate — two conversations, one per person.
    await authPost('/api/me/conversations', owner.accessToken, {
      candidateId: String(profile._id),
      companyId: published.id,
      body: 'Hello from the owner.',
    });
    await authPost('/api/me/conversations', recruiterToken, {
      candidateId: String(profile._id),
      companyId: published.id,
      body: 'And a follow-up from me.',
    });

    const { conversations: list } = await bodyOf(
      await authGet('/api/me/conversations', candidate.accessToken),
    );
    assert.equal(list.length, 2, 'one conversation per person, not per company');

    /* Each is titled by the person it is with, with the company kept alongside as context. */
    assert.deepEqual(
      list.map((row) => row.other.name).sort(),
      ['Olive Owner', 'Rita Recruiter'],
      'the candidate is talking to people, and each conversation names one',
    );
    for (const row of list) {
      assert.equal(row.company.name, PUBLISHED_NAME, 'company context is kept, not replaced');
      assert.equal(row.isRequest, true, 'a first message from a stranger is a request');
    }

    /* Each conversation carries only its own author's message. */
    for (const [name, body] of [
      ['Olive Owner', 'Hello from the owner.'],
      ['Rita Recruiter', 'And a follow-up from me.'],
    ]) {
      const row = list.find((item) => item.other.name === name);
      const thread = await bodyOf(
        await authGet(`/api/me/conversations/${row.id}`, candidate.accessToken),
      );

      const theirs = thread.messages.filter((m) => !m.mine);
      assert.deepEqual(
        theirs.map((m) => m.senderName),
        [name],
        'each message names the individual who sent it',
      );
      assert.equal(theirs[0].body, body, "and no one else's message is in this conversation");

      // Names only. The recruiter's address must not travel with the thread.
      const serialised = JSON.stringify(thread);
      assert.ok(!serialised.includes(OWNER), 'owner email must not be exposed');
      assert.ok(!serialised.includes(RECRUITER), 'recruiter email must not be exposed');
    }
  });

  test("a colleague's conversation is private — absent to the owner, not forbidden", async () => {
    const candidate = await onboard(CANDIDATE, { name: 'Chris Candidate' });
    const profile = await CandidateProfile.create({
      userId: candidate.user._id,
      status: CANDIDATE_VISIBILITY.DISCOVERABLE,
      contactVisibility: CONTACT_VISIBILITY.HIDDEN,
      publishedAt: new Date(),
      headline: 'SAT maths tutor',
    });

    const { conversationId } = await bodyOf(
      await authPost('/api/me/conversations', recruiterToken, {
        candidateId: String(profile._id),
        companyId: published.id,
        body: 'Opening message.',
      }),
    );

    /*
     * The recruiter's conversation is theirs. The owner is told it does not exist — a 403 would
     * confirm that this candidate is in conversation with this teammate.
     */
    assert.equal(
      (await authGet(`/api/me/conversations/${conversationId}`, owner.accessToken)).status,
      404,
      "an owner does not inherit a colleague's conversation (ADR-025)",
    );
    const { conversations: ownerInbox } = await bodyOf(
      await authGet('/api/me/conversations', owner.accessToken),
    );
    assert.equal(ownerInbox.length, 0, "the owner's inbox does not list a colleague's chat");

    /* The company-scoped routes are gone, not merely restricted. */
    assert.equal(
      (await authGet(`/api/companies/${published.id}/conversations`, owner.accessToken)).status,
      404,
    );

    /* The two people see the same conversation, each from their own side. */
    const asRecruiter = await bodyOf(
      await authGet(`/api/me/conversations/${conversationId}`, recruiterToken),
    );
    assert.equal(asRecruiter.messages[0].mine, true);
    assert.equal(asRecruiter.messages[0].senderName, 'Rita Recruiter');
    assert.equal(asRecruiter.conversation.other.name, 'Chris Candidate');
  });
});
