/**
 * Account deletion — the request, the lock-out, and the queue job (PRD §16.1, backlog B-09).
 *
 * Two things are being pinned, and the second is the one that keeps the product honest.
 *
 * 1. **Requesting deletion actually locks the account out.** Password sign-in already refused a
 *    non-active account; Google sign-in did not, so a deletion request could be undone by clicking
 *    "Continue with Google". That path is asserted here.
 *
 * 2. **The job purges nothing.** The retention period and the anonymisation policy are undecided
 *    (05_DATABASE_SCHEMA §11, ADR-014, B-09). Until they are decided, the correct behaviour is to
 *    report the queue and delete nothing — so "purged: 0" and "the user still exists afterwards"
 *    are assertions, not accidents. When the policy lands, these tests are what proves the change
 *    was deliberate.
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { USER_STATUS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import {
  reviewPendingDeletions,
  accountDeletionJob,
  purgeAccount,
  purgeEarlyAccessRequests,
  scrubAuditNetworkIdentifiers,
} from '../../src/jobs/accountDeletion.job.js';
import { runJobOnce, startJobs, stopJobs, scheduledJobs } from '../../src/jobs/jobRunner.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { Experience } from '../../src/modules/candidates/profileEntry.model.js';
import { AuditEvent } from '../../src/modules/audit/auditEvent.model.js';
import { EarlyAccessRequest } from '../../src/modules/public/earlyAccessRequest.model.js';
import { VerificationToken as Tokens } from '../../src/modules/auth/verificationToken.model.js';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';

let server;
let baseUrl;

const SUBJECT = 'del-subject@example.com';
const BYSTANDER = 'del-bystander@example.com';
const ALL_EMAILS = [SUBJECT, BYSTANDER];
const PASSWORD = 'Password123';
const DAY_MS = 24 * 60 * 60 * 1000;

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authPost = (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

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

let subject;
let bystander;

before(async () => {
  await connectDatabase();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/** Removes this suite's fixtures — before each test for isolation, and after the last one. */
async function removeFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } }).select('_id');
  const userIds = users.map((u) => u._id);

  await Promise.all([
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
  ]);
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await removeFixtures();
  stopJobs();
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  await removeFixtures();

  subject = await onboard(SUBJECT);
  bystander = await onboard(BYSTANDER);
});

/* ── the request ────────────────────────────────────────────────────────────────────────────── */

describe('POST /api/me/settings/delete', () => {
  test('requires the current password', async () => {
    const res = await authPost('/api/me/settings/delete', subject.accessToken, {
      password: 'NotMyPassword1',
    });
    assert.ok(res.status >= 400);

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.ACTIVE, 'a wrong password must not change status');
  });

  test('marks the account deletion_pending and revokes every session', async () => {
    const res = await authPost('/api/me/settings/delete', subject.accessToken, {
      password: PASSWORD,
    });
    assert.equal(res.status, 200);

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.DELETION_PENDING);
    assert.ok(user.deletionRequestedAt instanceof Date);

    const live = await Session.countDocuments({
      userId: subject.user._id,
      revokedAt: { $in: [null, undefined] },
    });
    assert.equal(live, 0, 'sessions must be revoked at request time');
  });

  test('password sign-in is refused afterwards', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    const res = await jsonPost('/api/auth/login', { email: SUBJECT, password: PASSWORD });
    assert.equal(res.status, 403);
  });

  test('SECURITY: Google sign-in is refused afterwards too', async () => {
    /*
     * The regression this exists for: `googleAuth` linked the account and issued a session without
     * ever checking `user.status`, so "Continue with Google" silently undid the deletion request
     * that password sign-in correctly refused.
     *
     * Token verification is stubbed through the service's test seam. A real Google credential
     * cannot be minted here, and calling the live endpoint would make the assertion depend on the
     * network — which proves nothing about the gate, because verification fails first.
     */
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    const { googleAuth } = await import('../../src/modules/auth/auth.service.js');
    const googlePayload = {
      email: SUBJECT,
      email_verified: true,
      sub: 'google-subject-id-1',
      name: 'Deleted Person',
    };

    await assert.rejects(
      () => googleAuth('stub', {}, { verifyToken: async () => googlePayload }),
      (error) => {
        assert.equal(error.status, 403, 'the account-status gate must refuse, not sign in');
        return true;
      },
    );

    const live = await Session.countDocuments({
      userId: subject.user._id,
      revokedAt: { $in: [null, undefined] },
    });
    assert.equal(live, 0, 'no session may exist for a deletion_pending account');

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.DELETION_PENDING, 'the refusal must not reactivate it');
    assert.equal(user.googleId, undefined, 'a refused sign-in must not link a Google identity');
  });

  test('CONTROL: the same stubbed Google sign-in succeeds for an ACTIVE account', async () => {
    // Without this, the test above would still pass if googleAuth rejected everything.
    const { googleAuth } = await import('../../src/modules/auth/auth.service.js');

    const result = await googleAuth('stub', {}, {
      verifyToken: async () => ({
        email: BYSTANDER,
        email_verified: true,
        sub: 'google-bystander-id-1',
        name: 'Active Person',
      }),
    });

    assert.ok(result.accessToken, 'an active account still signs in with Google');
    assert.equal(String(result.user._id), String(bystander.user._id));
  });

  test('an unrelated account is untouched', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    const other = await User.findById(bystander.user._id).lean();
    assert.equal(other.status, USER_STATUS.ACTIVE);

    const res = await authGet('/api/me', bystander.accessToken);
    assert.equal(res.status, 200);
  });
});

/* ── the queue job ──────────────────────────────────────────────────────────────────────────── */

describe('account-deletion review job', () => {
  async function requestDeletion({ requestedDaysAgo = 0 } = {}) {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });
    if (requestedDaysAgo > 0) {
      await User.findByIdAndUpdate(subject.user._id, {
        deletionRequestedAt: new Date(Date.now() - requestedDaysAgo * DAY_MS),
      });
    }
  }

  test('reports nothing when the queue is empty', async () => {
    const report = await reviewPendingDeletions({ retentionDays: 30 });
    const ids = report.eligibleUserIds;
    assert.ok(!ids.includes(String(subject.user._id)));
  });

  test('an active account never appears in the queue', async () => {
    const report = await reviewPendingDeletions({ retentionDays: 0 });
    assert.ok(!report.eligibleUserIds.includes(String(bystander.user._id)));
  });

  test('with NO retention policy configured, nothing is ever eligible', async () => {
    await requestDeletion({ requestedDaysAgo: 3650 });

    const report = await reviewPendingDeletions({ retentionDays: null });

    assert.equal(report.policyConfigured, false);
    assert.equal(report.eligible, 0);
    assert.ok(report.pending >= 1, 'the account is still reported as waiting');
    assert.equal(report.awaitingPolicy, report.pending);
    assert.equal(report.purged, 0);
  });

  test('with a retention policy, an account younger than the period is not eligible', async () => {
    await requestDeletion({ requestedDaysAgo: 5 });

    const report = await reviewPendingDeletions({ retentionDays: 30 });

    assert.equal(report.policyConfigured, true);
    assert.ok(!report.eligibleUserIds.includes(String(subject.user._id)));
  });

  test('with a retention policy, an account past the period IS eligible', async () => {
    await requestDeletion({ requestedDaysAgo: 45 });

    const report = await reviewPendingDeletions({ retentionDays: 30 });

    assert.ok(report.eligibleUserIds.includes(String(subject.user._id)));
    assert.ok(report.oldestRequestAgeDays >= 45);
  });

  test('POLICY GUARD: an eligible account is reported but NOT deleted', async () => {
    await requestDeletion({ requestedDaysAgo: 45 });

    const report = await reviewPendingDeletions({ retentionDays: 30 });
    assert.equal(report.purged, 0, 'the purge pass is blocked on B-09 and must stay unimplemented');

    const stillThere = await User.findById(subject.user._id).lean();
    assert.ok(stillThere, 'the user document must still exist');
    assert.equal(stillThere.status, USER_STATUS.DELETION_PENDING);
    assert.equal(stillThere.email, SUBJECT, 'nothing is anonymised without an approved policy');
  });

  test('is idempotent — a second run reports the same thing and changes nothing', async () => {
    await requestDeletion({ requestedDaysAgo: 45 });

    const first = await reviewPendingDeletions({ retentionDays: 30 });
    const second = await reviewPendingDeletions({ retentionDays: 30 });

    assert.deepEqual(first.eligibleUserIds, second.eligibleUserIds);
    assert.equal(first.pending, second.pending);

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.DELETION_PENDING);
  });

  test('the query is bounded — batchSize caps the documents read', async () => {
    await requestDeletion({ requestedDaysAgo: 45 });

    const report = await reviewPendingDeletions({ retentionDays: 30, batchSize: 1 });
    assert.ok(report.pending <= 1);
    assert.equal(report.batchSize, 1);
  });

  test('runs through the job runner and returns a summary', async () => {
    await requestDeletion({ requestedDaysAgo: 1 });

    const summary = await runJobOnce(accountDeletionJob);

    assert.ok(summary, 'the job completed');
    assert.equal(summary.purged, 0);
    assert.equal(typeof summary.pending, 'number');
  });
});

/* ── the purge itself ───────────────────────────────────────────────────────────────────────── */

describe('purgeAccount — 16_RETENTION_POLICY.md §3', () => {
  async function deletedSubjectWithContent() {
    const profile = await CandidateProfile.create({
      userId: subject.user._id,
      status: CANDIDATE_VISIBILITY.DISCOVERABLE,
      publishedAt: new Date(),
      headline: 'IB physics teacher',
      summary: 'Ten years of senior-school physics.',
      targetRoles: ['school_teacher'],
      subjects: ['physics'],
      yearsExperience: 10,
    });

    await Experience.create({
      candidateId: profile._id,
      role: 'Physics teacher',
      organization: 'A school',
      startDate: '2016-01',
    });

    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });
    return profile;
  }

  test('deletes the candidate content outright', async () => {
    const profile = await deletedSubjectWithContent();

    await purgeAccount({ _id: subject.user._id });

    assert.equal(await Experience.countDocuments({ candidateId: profile._id }), 0);
  });

  test('TOMBSTONES the profile rather than removing it, so references stay valid', async () => {
    const profile = await deletedSubjectWithContent();

    await purgeAccount({ _id: subject.user._id });

    const after = await CandidateProfile.findById(profile._id).lean();
    assert.ok(after, 'the profile row must survive as a tombstone');
    assert.equal(after.status, CANDIDATE_VISIBILITY.ARCHIVED);
    assert.ok(after.deletedAt instanceof Date);
    assert.equal(after.headline, undefined);
    assert.equal(after.summary, undefined);
    assert.deepEqual(after.targetRoles, []);
  });

  test('anonymises the user but keeps the _id the audit trail references', async () => {
    await deletedSubjectWithContent();
    const before = await User.findById(subject.user._id).lean();

    await purgeAccount({ _id: subject.user._id });

    const after = await User.findById(subject.user._id).lean();
    assert.ok(after, 'PRD §16.1 — the row survives so audit events do not dangle');
    assert.equal(String(after._id), String(before._id));
    assert.equal(after.status, USER_STATUS.DELETED);
    assert.ok(after.deletedAt instanceof Date);
    assert.notEqual(after.email, SUBJECT);
    assert.match(after.email, /@deleted\.invalid$/);
    assert.equal(after.name, 'Deleted user');
    assert.equal(after.phone, undefined);
    assert.equal(after.googleId, undefined);
  });

  test('the tombstoned profile is invisible to every recruiter path', async () => {
    // The privacy outcome must come from candidateAccess.service, not from new logic in the job.
    const profile = await deletedSubjectWithContent();
    await purgeAccount({ _id: subject.user._id });

    const { resolveCandidateAccess } = await import(
      '../../src/modules/candidates/candidateAccess.service.js'
    );
    const stored = await CandidateProfile.findById(profile._id).lean();
    const access = await resolveCandidateAccess(stored, '0123456789abcdef01234567');

    assert.equal(access.visible, false);
    assert.equal(access.reason, 'archived');
  });

  test('is idempotent — purging twice is safe and changes nothing further', async () => {
    await deletedSubjectWithContent();

    await purgeAccount({ _id: subject.user._id });
    const first = await User.findById(subject.user._id).lean();

    await purgeAccount({ _id: subject.user._id });
    const second = await User.findById(subject.user._id).lean();

    assert.equal(second.email, first.email);
    assert.equal(second.status, USER_STATUS.DELETED);
  });

  test('leaves an unrelated account completely untouched', async () => {
    await deletedSubjectWithContent();
    await purgeAccount({ _id: subject.user._id });

    const other = await User.findById(bystander.user._id).lean();
    assert.equal(other.email, BYSTANDER);
    assert.equal(other.status, USER_STATUS.ACTIVE);
  });
});

describe('the purge is armed by TWO switches', () => {
  test('a configured period alone still purges nothing', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });
    await User.findByIdAndUpdate(subject.user._id, {
      deletionRequestedAt: new Date(Date.now() - 45 * DAY_MS),
    });

    // env.ACCOUNT_DELETION_PURGE_ENABLED defaults to false and is not set under test.
    const summary = await runJobOnce(accountDeletionJob);

    assert.equal(summary.purged, 0);
    assert.equal(summary.purgeEnabled, false);

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.DELETION_PENDING, 'still pending, not deleted');
    assert.equal(user.email, SUBJECT, 'not anonymised');
  });
});

/* ── other retention windows ────────────────────────────────────────────────────────────────── */

describe('early-access retention (TD-06)', () => {
  const LEAD = 'lead-retention@example.com';

  beforeEach(async () => {
    await EarlyAccessRequest.deleteMany({ email: LEAD });
  });

  test('does nothing while unconfigured', async () => {
    await EarlyAccessRequest.create({
      email: LEAD,
      name: 'Old Lead',
      segment: 'educator',
      consentedAt: new Date(),
      lastSubmittedAt: new Date(Date.now() - 900 * DAY_MS),
    });

    const result = await purgeEarlyAccessRequests({ retentionDays: undefined });

    assert.equal(result.configured, false);
    assert.equal(result.deleted, 0);
    assert.equal(await EarlyAccessRequest.countDocuments({ email: LEAD }), 1);
  });

  test('deletes leads past the window and keeps recent ones', async () => {
    await EarlyAccessRequest.create({
      email: LEAD,
      name: 'Old Lead',
      segment: 'educator',
      consentedAt: new Date(),
      lastSubmittedAt: new Date(Date.now() - 900 * DAY_MS),
    });

    const result = await purgeEarlyAccessRequests({ retentionDays: 730 });
    assert.ok(result.deleted >= 1);
    assert.equal(await EarlyAccessRequest.countDocuments({ email: LEAD }), 0);

    await EarlyAccessRequest.create({
      email: LEAD,
      name: 'Fresh Lead',
      segment: 'educator',
      consentedAt: new Date(),
      lastSubmittedAt: new Date(),
    });
    await purgeEarlyAccessRequests({ retentionDays: 730 });
    assert.equal(await EarlyAccessRequest.countDocuments({ email: LEAD }), 1, 'recent lead kept');

    await EarlyAccessRequest.deleteMany({ email: LEAD });
  });
});

describe('audit network-identifier scrub', () => {
  test('drops ip and userAgent from old events but KEEPS the event', async () => {
    const event = await AuditEvent.create({
      actorUserId: subject.user._id,
      action: 'candidate_profile.viewed',
      targetType: 'candidateProfile',
      targetId: subject.user._id,
      ip: '203.0.113.9',
      userAgent: 'probe/1.0',
      createdAt: new Date(Date.now() - 400 * DAY_MS),
    });

    const result = await scrubAuditNetworkIdentifiers({ retentionDays: 365 });
    assert.ok(result.scrubbed >= 1);

    const after = await AuditEvent.findById(event._id).lean();
    assert.ok(after, 'PRD §16.1 — the audit event itself must survive');
    assert.equal(after.ip, undefined);
    assert.equal(after.userAgent, undefined);
    assert.equal(after.action, 'candidate_profile.viewed');

    await AuditEvent.deleteOne({ _id: event._id });
  });

  test('does nothing while unconfigured', async () => {
    const result = await scrubAuditNetworkIdentifiers({ retentionDays: undefined });
    assert.equal(result.configured, false);
    assert.equal(result.scrubbed, 0);
  });
});

/* ── the way back ───────────────────────────────────────────────────────────────────────────── */

describe('restore during the grace period', () => {
  test('the deletion request issues a single-use restore token', async () => {
    const res = await authPost('/api/me/settings/delete', subject.accessToken, {
      password: PASSWORD,
    });
    const body = (await res.json()).data;

    assert.ok(body.restorableUntil, 'the response states how long the request can be reversed');
    assert.ok(body.graceDays >= 1);

    const tokens = await Tokens.countDocuments({
      userId: subject.user._id,
      purpose: 'account_restore',
    });
    assert.equal(tokens, 1);
  });

  test('the emailed token reverses the deletion and issues NO session', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    // Mint a known token the same way the service does, so the test does not read the mailbox.
    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await Tokens.deleteMany({ userId: subject.user._id, purpose: 'account_restore' });
    await Tokens.create({
      tokenHash: hash,
      purpose: 'account_restore',
      userId: subject.user._id,
      email: SUBJECT,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });

    const res = await jsonPost('/api/auth/restore-account', { token: raw });
    assert.equal(res.status, 200);

    // SECURITY: restoring must not be a passwordless way in.
    assert.equal(res.headers.get('set-cookie'), null, 'no session cookie may be set');
    const body = (await res.json()).data;
    assert.equal(body.accessToken, undefined, 'no access token may be issued');

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.ACTIVE);
    assert.equal(user.deletionRequestedAt, undefined);

    // And sign-in works again afterwards.
    const login = await jsonPost('/api/auth/login', { email: SUBJECT, password: PASSWORD });
    assert.equal(login.status, 200);
  });

  test('the token is single-use', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await Tokens.deleteMany({ userId: subject.user._id, purpose: 'account_restore' });
    await Tokens.create({
      tokenHash: hash,
      purpose: 'account_restore',
      userId: subject.user._id,
      email: SUBJECT,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });

    assert.equal((await jsonPost('/api/auth/restore-account', { token: raw })).status, 200);
    assert.equal((await jsonPost('/api/auth/restore-account', { token: raw })).status, 400);
  });

  test('an unknown or malformed token is refused', async () => {
    assert.equal(
      (await jsonPost('/api/auth/restore-account', { token: 'nope-not-a-real-token' })).status,
      400,
    );
    assert.equal((await jsonPost('/api/auth/restore-account', {})).status, 400);
  });

  test('an already-purged account cannot be restored', async () => {
    await authPost('/api/me/settings/delete', subject.accessToken, { password: PASSWORD });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await Tokens.deleteMany({ userId: subject.user._id, purpose: 'account_restore' });
    await Tokens.create({
      tokenHash: hash,
      purpose: 'account_restore',
      userId: subject.user._id,
      email: SUBJECT,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });

    await purgeAccount({ _id: subject.user._id });

    // Restoring a status onto emptied content would produce a convincing but empty account.
    const res = await jsonPost('/api/auth/restore-account', { token: raw });
    assert.equal(res.status, 400);

    const user = await User.findById(subject.user._id).lean();
    assert.equal(user.status, USER_STATUS.DELETED);
  });
});

describe('job runner', () => {
  test('a failing job is contained, not thrown', async () => {
    const result = await runJobOnce({
      name: 'always-fails',
      run: async () => {
        throw new Error('boom');
      },
    });
    assert.equal(result, null, 'the failure is swallowed into the log and retried next tick');
  });

  test('a job cannot overlap itself', async () => {
    let started = 0;
    const slow = {
      name: 'slow-job',
      run: async () => {
        started += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {};
      },
    };

    const [first, second] = await Promise.all([runJobOnce(slow), runJobOnce(slow)]);

    assert.equal(started, 1, 'the second call was skipped while the first was running');
    assert.ok(first);
    assert.equal(second, null);
  });

  test('schedules and cancels', () => {
    startJobs([{ name: 'scheduled-probe', intervalMs: 60_000, run: async () => ({}) }]);
    assert.ok(scheduledJobs().includes('scheduled-probe'));

    stopJobs();
    assert.equal(scheduledJobs().length, 0);
  });
});
