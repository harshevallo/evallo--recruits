/**
 * CAN-03 preview · CAN-04 visibility · CAN-06 save · CAN-07 interest · CAN-08 my interests ·
 * CAN-09 messages.
 *
 * These cover the candidate side of the marketplace loop. Where the recruiter side would normally
 * act (status changes, opening a conversation), the test creates that state directly — the point
 * is to prove the candidate's half behaves correctly, not to simulate REC-xx.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY, INTEREST_STATUS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../../src/modules/candidates/candidateAnswer.model.js';
import { SavedCompany } from '../../src/modules/candidates/savedCompany.model.js';
import { ExpressionOfInterest } from '../../src/modules/interests/expressionOfInterest.model.js';
import { AccessGrant } from '../../src/modules/interests/accessGrant.model.js';
import { Conversation } from '../../src/modules/messaging/conversation.model.js';
import { Message } from '../../src/modules/messaging/message.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const EMAIL = 'journey-test@example.com';
const PASSWORD = 'Password123';
const SLUG = 'journey-academy';

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
const authPut = send('PUT');
const authDelete = send('DELETE');

/** Onboards, creates a profile, and fills everything PRD §8.5 requires for publication. */
async function readyCandidate({ complete = true } = {}) {
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

  if (complete) {
    await CandidateProfile.updateOne(
      { userId: user._id },
      {
        $set: {
          headline: 'IB Physics teacher',
          summary: 'Ten years teaching IB and A-level physics.',
          targetRoles: ['school_teacher'],
          employmentTypes: ['full_time'],
          deliveryModes: ['on_site'],
          availability: 'immediately',
          subjects: ['physics'],
          learnerSegments: ['high_school'],
        },
      },
    );

    /*
     * Location lives on the PERSONAL layer (05_DATABASE_SCHEMA §2), and PRD §8.5 makes
     * country/region and time zone required for publication — so a "complete" fixture must set
     * them on the user, not the candidate profile.
     */
    await User.updateOne(
      { _id: user._id },
      { $set: { 'location.country': 'IN', 'location.timezone': 'Asia/Kolkata' } },
    );
  }

  const profile = await CandidateProfile.findOne({ userId: user._id });
  return { accessToken, user, profile };
}

async function makeCompany() {
  return Company.create({
    slug: SLUG,
    name: 'Journey Academy',
    organizationType: 'tutoring_center',
    status: 'published',
    isCurrentlyHiring: true,
    acceptsGeneralInterest: true,
    location: { country: 'IN', city: 'Bengaluru' },
  });
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

async function cleanup() {
  const user = await User.findOne({ email: EMAIL });
  if (user) {
    const profile = await CandidateProfile.findOne({ userId: user._id });
    if (profile) {
      // Messages first — deleting their conversation would otherwise orphan them.
      const threads = await Conversation.find({ candidateId: profile._id }).select('_id').lean();
      if (threads.length > 0) {
        await Message.deleteMany({ conversationId: { $in: threads.map((t) => t._id) } });
      }

      await Promise.all([
        CandidateAnswer.deleteMany({ candidateId: profile._id }),
        SavedCompany.deleteMany({ candidateId: profile._id }),
        ExpressionOfInterest.deleteMany({ candidateId: profile._id }),
        AccessGrant.deleteMany({ candidateId: profile._id }),
        Conversation.deleteMany({ candidateId: profile._id }),
      ]);
    }
    await CandidateProfile.deleteMany({ userId: user._id });
    await Session.deleteMany({ userId: user._id });
    await VerificationToken.deleteMany({ userId: user._id });
  }
  await User.deleteMany({ email: EMAIL });
  await Company.deleteMany({ slug: SLUG });
}

beforeEach(cleanup);

describe('CAN-03 profile preview', () => {
  test('returns the recruiter rendering, not the raw profile', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    const { profile } = body.data;

    // PRD §8.8 blocks.
    assert.equal(profile.header.headline, 'IB Physics teacher');
    assert.deepEqual(profile.expertise.subjects, ['physics']);
    assert.equal(profile.introduction, 'Ten years teaching IB and A-level physics.');
    assert.ok(profile.evidence, 'evidence block present even while empty');
  });

  test('hides contact and says why (private-field indicators)', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();

    assert.equal(body.data.profile.contact, null, 'default rule is hidden');
    const contactField = body.data.privateFields.find((f) => f.field === 'contact');
    assert.ok(contactField?.reason, 'the reason is stated, not just the fact');
  });

  test('reveals contact only when the candidate rule allows it', async () => {
    const { accessToken } = await readyCandidate();

    await authPatch('/api/me/candidate-profile/visibility', accessToken, {
      contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
    });

    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    assert.equal(body.data.profile.contact.email, EMAIL);
  });

  test('an incomplete profile cannot publish, and the gaps are named', async () => {
    const { accessToken } = await readyCandidate({ complete: false });

    const preview = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    assert.equal(preview.data.publish.canPublish, false);
    assert.ok(preview.data.publish.blockers.length > 0);

    const res = await authPost('/api/me/candidate-profile/publish', accessToken, {});
    assert.equal(res.status, 400);
  });

  test('publishing a complete profile makes it discoverable', async () => {
    const { accessToken, user } = await readyCandidate();

    const res = await authPost('/api/me/candidate-profile/publish', accessToken, {});
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.publish.isPublished, true);
    assert.ok(body.data.publish.publishedAt);

    const stored = await CandidateProfile.findOne({ userId: user._id });
    assert.equal(stored.status, CANDIDATE_VISIBILITY.DISCOVERABLE);
  });

  test('publishing as private is allowed (PRD §4.3 leaves the choice to the candidate)', async () => {
    const { accessToken, user } = await readyCandidate();
    await authPost('/api/me/candidate-profile/publish', accessToken, { status: 'private' });

    const stored = await CandidateProfile.findOne({ userId: user._id });
    assert.equal(stored.status, CANDIDATE_VISIBILITY.PRIVATE);
  });
});

describe('CAN-04 visibility settings', () => {
  test('reports the current state, blocks, and what still prevents publishing', async () => {
    const { accessToken } = await readyCandidate({ complete: false });
    const body = await (await authGet('/api/me/candidate-profile/visibility', accessToken)).json();

    assert.equal(body.data.visibility.status, CANDIDATE_VISIBILITY.DRAFT);
    assert.equal(body.data.visibility.contactVisibility, CONTACT_VISIBILITY.HIDDEN);
    assert.deepEqual(body.data.blockedCompanies, []);
    assert.ok(body.data.publishBlockers.length > 0);
  });

  test('refuses to leave draft while publication requirements are unmet', async () => {
    const { accessToken } = await readyCandidate({ complete: false });

    const res = await authPatch('/api/me/candidate-profile/visibility', accessToken, {
      status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(body.error.details.status, 'the gaps are named on the field');
  });

  test('pausing does not revoke existing access (PRD §4.3)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();

    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });
    await authPatch('/api/me/candidate-profile/visibility', accessToken, {
      status: CANDIDATE_VISIBILITY.PAUSED,
    });

    const grant = await AccessGrant.findOne({
      candidateId: profile._id,
      companyId: company._id,
    });
    assert.ok(!grant.withdrawnAt, 'paused hides from NEW searches only');
  });

  test('blocking and unblocking a company', async () => {
    const { accessToken } = await readyCandidate();
    const company = await makeCompany();

    const blocked = await (
      await authPost('/api/me/candidate-profile/blocked-companies', accessToken, {
        companyId: String(company._id),
      })
    ).json();
    assert.equal(blocked.data.length, 1);
    assert.equal(blocked.data[0].slug, SLUG);

    const unblocked = await (
      await authDelete(`/api/me/candidate-profile/blocked-companies/${company._id}`, accessToken)
    ).json();
    assert.deepEqual(unblocked.data, []);
  });

  test('a block shows in the preview as a private-field indicator', async () => {
    const { accessToken } = await readyCandidate();
    const company = await makeCompany();

    await authPost('/api/me/candidate-profile/blocked-companies', accessToken, {
      companyId: String(company._id),
    });

    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    assert.ok(body.data.privateFields.some((f) => f.field === 'blockedCompanies'));
  });

  test('rejects an unknown visibility value', async () => {
    const { accessToken } = await readyCandidate();
    const res = await authPatch('/api/me/candidate-profile/visibility', accessToken, {
      status: 'invisible',
    });
    assert.equal(res.status, 400);
  });
});

describe('CAN-06 company page, signed in', () => {
  test('reports the relationship: not saved, no interest', async () => {
    const { accessToken } = await readyCandidate();
    await makeCompany();

    const body = await (
      await authGet(`/api/me/companies/${SLUG}/relationship`, accessToken)
    ).json();

    assert.equal(body.data.saved, false);
    assert.equal(body.data.interest, null);
    assert.equal(body.data.isCurrentlyHiring, true);
  });

  test('save is idempotent, and unsave reverses it', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();

    await authPut(`/api/me/companies/${SLUG}/saved`, accessToken);
    await authPut(`/api/me/companies/${SLUG}/saved`, accessToken);

    assert.equal(
      await SavedCompany.countDocuments({ candidateId: profile._id, companyId: company._id }),
      1,
      'saving twice saves once',
    );

    await authDelete(`/api/me/companies/${SLUG}/saved`, accessToken);
    assert.equal(await SavedCompany.countDocuments({ candidateId: profile._id }), 0);
  });

  test('an unpublished company is not reachable', async () => {
    const { accessToken } = await readyCandidate();
    await Company.create({
      slug: SLUG,
      name: 'Journey Academy',
      organizationType: 'tutoring_center',
      status: 'draft',
      location: { country: 'IN' },
    });

    const res = await authGet(`/api/me/companies/${SLUG}/relationship`, accessToken);
    assert.equal(res.status, 404);
  });
});

describe('CAN-07 interest submission', () => {
  test('submitting creates the interest AND the access grant (PRD §8.7 step 7)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();

    const res = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {
      message: 'I would love to teach here.',
      consent: true,
    });

    assert.equal(res.status, 201);

    const interest = await ExpressionOfInterest.findOne({ candidateId: profile._id });
    assert.equal(interest.status, INTEREST_STATUS.SUBMITTED);
    assert.equal(interest.message, 'I would love to teach here.');
    assert.ok(interest.consent.grantedAt, 'consent is timestamped (PRD §11.1)');

    const grant = await AccessGrant.findOne({
      candidateId: profile._id,
      companyId: company._id,
    });
    assert.ok(grant, 'the company can now reach this profile');
  });

  test('is idempotent — a retry does not create a second interest', async () => {
    const { accessToken, profile } = await readyCandidate();
    await makeCompany();

    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });
    const second = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {
      consent: true,
    });
    const body = await second.json();

    assert.equal(second.status, 200);
    assert.equal(body.data.status, 'already_submitted');
    assert.equal(await ExpressionOfInterest.countDocuments({ candidateId: profile._id }), 1);
  });

  test('adopts an interest the same person submitted anonymously (PRD §8.7 steps 2–3)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();

    // The public page keys uniqueness on contact.email, so an anonymous submission occupies the
    // same slot as the authenticated one. Before the fix this permanently blocked the candidate.
    await ExpressionOfInterest.create({
      companyId: company._id,
      candidateId: null,
      contact: { name: 'Journey Tester', email: EMAIL },
      consent: { grantedAt: new Date() },
      source: 'company_page',
    });

    const res = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {
      consent: true,
    });
    const body = await res.json();

    assert.equal(body.data.status, 'submitted');
    assert.equal(body.data.adopted, true, 'the anonymous record became theirs');

    // Still exactly one record — the company is not notified twice (PRD §21.5).
    assert.equal(
      await ExpressionOfInterest.countDocuments({ companyId: company._id }),
      1,
      'adopted, not duplicated',
    );

    const mine = await (await authGet('/api/me/interests', accessToken)).json();
    assert.equal(mine.data.length, 1, 'now visible in My interests');

    const grant = await AccessGrant.findOne({
      candidateId: profile._id,
      companyId: company._id,
    });
    assert.ok(grant, 'adoption also grants access');
  });

  test('a second submission after adoption reports already_submitted', async () => {
    const { accessToken } = await readyCandidate();
    const company = await makeCompany();

    await ExpressionOfInterest.create({
      companyId: company._id,
      candidateId: null,
      contact: { name: 'Journey Tester', email: EMAIL },
      consent: { grantedAt: new Date() },
      source: 'company_page',
    });

    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });
    const again = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {
      consent: true,
    });

    assert.equal((await again.json()).data.status, 'already_submitted');
    assert.equal(await ExpressionOfInterest.countDocuments({ companyId: company._id }), 1);
  });

  test('does NOT adopt an interest belonging to a different email', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();

    await ExpressionOfInterest.create({
      companyId: company._id,
      candidateId: null,
      contact: { name: 'Someone Else', email: 'stranger@example.com' },
      consent: { grantedAt: new Date() },
      source: 'company_page',
    });

    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });

    const stranger = await ExpressionOfInterest.findOne({
      'contact.email': 'stranger@example.com',
    });
    assert.equal(stranger.candidateId, null, 'someone else’s interest is never claimed');
    assert.equal(
      await ExpressionOfInterest.countDocuments({ candidateId: profile._id }),
      1,
      'the candidate got their own record',
    );
  });

  test('requires consent', async () => {
    const { accessToken } = await readyCandidate();
    await makeCompany();

    const res = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {});
    assert.equal(res.status, 400);
  });

  test('a profile too thin to share is refused with the gaps named (PRD §8.7 step 3)', async () => {
    const { accessToken } = await readyCandidate({ complete: false });
    await makeCompany();

    const res = await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, {
      consent: true,
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.ok(body.error.details.profile);
  });

  test('the consent disclosure states exactly what the company receives', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/interests/consent-disclosure', accessToken)).json();

    assert.ok(body.data.shares.length > 0);
    assert.ok(body.data.contact.includes('hidden'), 'reflects the candidate’s own rule');
    assert.ok(body.data.grants);
  });
});

describe('CAN-08 my interests', () => {
  test('lists company, role, date and status', async () => {
    const { accessToken } = await readyCandidate();
    await makeCompany();
    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });

    const body = await (await authGet('/api/me/interests', accessToken)).json();
    const [entry] = body.data;

    assert.equal(entry.company.name, 'Journey Academy');
    assert.equal(entry.company.initials, 'JA');
    assert.equal(entry.role, null, 'general company interest');
    assert.equal(entry.status, INTEREST_STATUS.SUBMITTED);
    assert.equal(entry.canWithdraw, true);
    assert.ok(entry.submittedAt);
  });

  test('is empty for a candidate who has expressed none', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/interests', accessToken)).json();
    assert.deepEqual(body.data, []);
  });

  test('withdrawing closes the interest and revokes the access grant', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    await authPost(`/api/me/companies/${SLUG}/interest`, accessToken, { consent: true });

    const [entry] = (await (await authGet('/api/me/interests', accessToken)).json()).data;
    const res = await authPost(`/api/me/interests/${entry.id}/withdraw`, accessToken, {});

    assert.equal(res.status, 200);

    const interest = await ExpressionOfInterest.findById(entry.id);
    assert.equal(interest.status, INTEREST_STATUS.WITHDRAWN);

    const grant = await AccessGrant.findOne({
      candidateId: profile._id,
      companyId: company._id,
    });
    assert.ok(grant.withdrawnAt, 'withdrawn means the company loses access');
  });

  test('cannot withdraw another candidate’s interest', async () => {
    const { accessToken } = await readyCandidate();
    const company = await makeCompany();

    const foreign = await ExpressionOfInterest.create({
      companyId: company._id,
      candidateId: null,
      contact: { name: 'Someone Else', email: 'other@example.com' },
      consent: { grantedAt: new Date() },
    });

    const res = await authPost(`/api/me/interests/${foreign._id}/withdraw`, accessToken, {});
    assert.equal(res.status, 404);
  });
});

describe('CAN-09 messages', () => {
  /** The company side (REC-15) is not built, so a thread is created directly. */
  async function companyOpensThread(profile, company, body = 'Hello, are you available?') {
    const conversation = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      lastMessageAt: new Date(),
      lastMessagePreview: body,
      candidateUnread: 1,
    });
    await Message.create({
      conversationId: conversation._id,
      senderType: 'company',
      body,
    });
    return conversation;
  }

  test('the inbox is empty until a company opens a thread', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/conversations', accessToken)).json();
    assert.deepEqual(body.data, []);
  });

  test('lists a thread with its company, preview and unread count', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    await companyOpensThread(profile, company);

    const body = await (await authGet('/api/me/conversations', accessToken)).json();
    const [thread] = body.data;

    assert.equal(thread.company.name, 'Journey Academy');
    assert.equal(thread.unread, 1);
    assert.equal(thread.lastMessagePreview, 'Hello, are you available?');
  });

  test('opening a thread returns its messages and clears the unread count', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const body = await (
      await authGet(`/api/me/conversations/${conversation._id}`, accessToken)
    ).json();

    assert.equal(body.data.messages.length, 1);
    assert.equal(body.data.messages[0].mine, false);

    const after = await Conversation.findById(conversation._id);
    assert.equal(after.candidateUnread, 0);
  });

  test('replying appends to the thread and marks it unread for the company', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const res = await authPost(
      `/api/me/conversations/${conversation._id}/messages`,
      accessToken,
      { body: 'Yes — I am available from next month.' },
    );

    assert.equal(res.status, 201);

    const after = await Conversation.findById(conversation._id);
    assert.equal(after.companyUnread, 1);
    assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 2);
  });

  test('an empty reply is rejected', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const res = await authPost(
      `/api/me/conversations/${conversation._id}/messages`,
      accessToken,
      { body: '   ' },
    );
    assert.equal(res.status, 400);
  });

  test('cannot read or reply to another candidate’s thread', async () => {
    const { accessToken } = await readyCandidate();
    const company = await makeCompany();

    const foreign = await Conversation.create({
      candidateId: company._id, // deliberately not this candidate
      companyId: company._id,
    });

    try {
      assert.equal((await authGet(`/api/me/conversations/${foreign._id}`, accessToken)).status, 404);
      assert.equal(
        (await authPost(`/api/me/conversations/${foreign._id}/messages`, accessToken, { body: 'hi' }))
          .status,
        404,
      );
    } finally {
      // Owned by nobody real, so the suite's candidate-scoped cleanup cannot reach it.
      await Conversation.deleteOne({ _id: foreign._id });
    }
  });

  test('accepting records the state (PRD §11.2)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const res = await authPost(`/api/me/conversations/${conversation._id}/respond`, accessToken, {
      accepted: true,
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.state, 'accepted');

    const after = await Conversation.findById(conversation._id);
    assert.equal(after.candidateState, 'accepted');
    assert.ok(after.candidateRespondedAt);
  });

  test('declining closes the thread to replies but keeps the messages (PRD §16.3)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const declined = await authPost(
      `/api/me/conversations/${conversation._id}/respond`,
      accessToken,
      { accepted: false },
    );
    assert.equal((await declined.json()).data.state, 'declined');

    const reply = await authPost(
      `/api/me/conversations/${conversation._id}/messages`,
      accessToken,
      { body: 'Actually, hello again' },
    );
    assert.equal(reply.status, 400, 'a declined conversation refuses further replies');

    assert.equal(
      await Message.countDocuments({ conversationId: conversation._id }),
      1,
      'declining never deletes the record',
    );
  });

  test('declining also mutes, and accepting again re-opens replies', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const declined = await authPost(
      `/api/me/conversations/${conversation._id}/respond`,
      accessToken,
      { accepted: false },
    );
    assert.equal((await declined.json()).data.muted, true);

    await authPost(`/api/me/conversations/${conversation._id}/respond`, accessToken, {
      accepted: true,
    });

    const reply = await authPost(
      `/api/me/conversations/${conversation._id}/messages`,
      accessToken,
      { body: 'Happy to talk after all' },
    );
    assert.equal(reply.status, 201);
  });

  test('replying accepts a pending conversation implicitly', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    await authPost(`/api/me/conversations/${conversation._id}/messages`, accessToken, {
      body: 'Yes, I am interested',
    });

    const after = await Conversation.findById(conversation._id);
    assert.equal(after.candidateState, 'accepted');
  });

  test('mute toggles and is idempotent, without hiding the thread', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const muted = await authPut(`/api/me/conversations/${conversation._id}/mute`, accessToken, {
      muted: true,
    });
    assert.equal((await muted.json()).data.muted, true);

    const again = await authPut(`/api/me/conversations/${conversation._id}/mute`, accessToken, {
      muted: true,
    });
    assert.equal((await again.json()).data.muted, true, 'idempotent');

    // Still listed and readable — muting suppresses notifications, not the conversation.
    const list = await (await authGet('/api/me/conversations', accessToken)).json();
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].muted, true);

    const unmuted = await authPut(`/api/me/conversations/${conversation._id}/mute`, accessToken, {
      muted: false,
    });
    assert.equal((await unmuted.json()).data.muted, false);
  });

  test('conversation actions reject a foreign or malformed thread', async () => {
    const { accessToken } = await readyCandidate();
    const foreignId = '0'.repeat(24);

    assert.equal(
      (await authPost(`/api/me/conversations/${foreignId}/respond`, accessToken, { accepted: true }))
        .status,
      404,
    );
    assert.equal(
      (await authPut(`/api/me/conversations/${foreignId}/mute`, accessToken, { muted: true })).status,
      404,
    );
    assert.equal(
      (await authPut(`/api/me/conversations/not-an-id/mute`, accessToken, { muted: true })).status,
      400,
    );
    assert.equal(
      (await authPost(`/api/me/conversations/${foreignId}/respond`, accessToken, {})).status,
      400,
      'accepted is required',
    );
  });

  test('reporting flags the thread without deleting it (PRD §16.3)', async () => {
    const { accessToken, profile } = await readyCandidate();
    const company = await makeCompany();
    const conversation = await companyOpensThread(profile, company);

    const res = await authPost(`/api/me/conversations/${conversation._id}/report`, accessToken, {
      reason: 'Inappropriate content',
    });

    assert.equal(res.status, 200);

    const after = await Conversation.findById(conversation._id);
    assert.ok(after.reportedAt);
    assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 1);
  });
});

describe('CAN-03…09 require the candidate capability', () => {
  test('every candidate route rejects an unauthenticated caller', async () => {
    const paths = [
      '/api/me/candidate-profile/preview',
      '/api/me/candidate-profile/visibility',
      '/api/me/interests',
      '/api/me/conversations',
    ];

    for (const path of paths) {
      assert.equal((await fetch(`${baseUrl}${path}`)).status, 401, path);
    }
  });
});
