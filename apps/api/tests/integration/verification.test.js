/**
 * AUTH-02 — resend verification and change email (unauthenticated, by email).
 *
 * After signup the user has NO session (email not yet verified — AUTH-01 security fix), so these
 * endpoints identify the account by email and are privacy-safe.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';

let server;
let baseUrl;

const post = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

async function signup(email = `verif.${Date.now()}.${Math.random().toString(36).slice(2)}@verif.example`) {
  await post('/api/auth/signup', { name: 'Verif', email, password: 'Password123' });
  return email;
}

/** Age the account's verification token past the 60s cooldown. Raw collection: createdAt is immutable. */
async function ageTokens(email) {
  const user = await User.findOne({ email });
  await VerificationToken.collection.updateMany(
    { userId: user._id },
    { $set: { createdAt: new Date(Date.now() - 120_000) } },
  );
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/**
 * Cleanup is scoped to THIS suite's fixtures — see the note in auth.test.js. An unscoped
 * `deleteMany({})` here signed out every real user in the shared development database.
 */
async function cleanupFixtures() {
  const fixtures = await User.find({ email: /@verif\.example$/ })
    .select('_id')
    .lean();
  const ids = fixtures.map((u) => u._id);

  if (ids.length > 0) {
    await Session.deleteMany({ userId: { $in: ids } });
    await VerificationToken.deleteMany({ userId: { $in: ids } });
  }
  await VerificationToken.deleteMany({ email: /@verif\.example$/ });
  await User.deleteMany({ email: /@verif\.example$/ });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('POST /api/auth/resend-verification', () => {
  test('is unauthenticated and privacy-safe — always 200, identical body', async () => {
    const email = await signup();
    const known = await post('/api/auth/resend-verification', { email });
    const unknown = await post('/api/auth/resend-verification', { email: 'nobody@verif.example' });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(known.body, unknown.body, 'no account enumeration');
  });

  test('within the cooldown, does NOT issue a new token (but still 200)', async () => {
    const email = await signup();
    const user = await User.findOne({ email });
    const before = await VerificationToken.countDocuments({ userId: user._id });

    const res = await post('/api/auth/resend-verification', { email });
    assert.equal(res.status, 200);

    const after = await VerificationToken.countDocuments({ userId: user._id, consumedAt: null });
    assert.equal(after, 1, 'no extra active token while cooling down');
    assert.ok(before >= 1);
  });

  test('after the cooldown, issues a NEW token and invalidates the old one', async () => {
    const email = await signup();
    await ageTokens(email);
    const user = await User.findOne({ email });

    const res = await post('/api/auth/resend-verification', { email });
    assert.equal(res.status, 200);

    const active = await VerificationToken.find({ userId: user._id, consumedAt: null });
    assert.equal(active.length, 1, 'exactly one active token after resend');
  });

  test('does not send for an already-verified account (still 200)', async () => {
    const email = await signup();
    await ageTokens(email);
    await User.updateOne({ email }, { $set: { emailVerified: true } });
    const user = await User.findOne({ email });
    const before = await VerificationToken.countDocuments({ userId: user._id, consumedAt: null });

    const res = await post('/api/auth/resend-verification', { email });
    assert.equal(res.status, 200);

    const after = await VerificationToken.countDocuments({ userId: user._id, consumedAt: null });
    assert.equal(after, before, 'no new token issued for a verified account');
  });

  test('rejects a malformed email', async () => {
    const res = await post('/api/auth/resend-verification', { email: 'not-an-email' });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/change-email', () => {
  test('changes an unverified account email, keeps it unverified, sends a new verification', async () => {
    const email = await signup();
    const newEmail = `changed.${Date.now()}@verif.example`;

    const res = await post('/api/auth/change-email', { currentEmail: email, email: newEmail });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, newEmail);

    const user = await User.findOne({ email: newEmail });
    assert.ok(user, 'email updated');
    assert.equal(user.emailVerified, false);
    assert.equal(await User.findOne({ email }), null, 'old email gone');
    assert.equal(
      await VerificationToken.countDocuments({ userId: user._id, consumedAt: null }),
      1,
      'fresh verification token for the new email',
    );
  });

  test('rejects a new email already used by another account', async () => {
    const other = await signup();
    const email = await signup();

    const res = await post('/api/auth/change-email', { currentEmail: email, email: other });
    assert.equal(res.status, 409);
    assert.ok(res.body.error.details.email);
  });

  test('rejects a malformed new email', async () => {
    const email = await signup();
    const res = await post('/api/auth/change-email', { currentEmail: email, email: 'not-an-email' });
    assert.equal(res.status, 400);
  });

  test('rejects changing to the same email', async () => {
    const email = await signup();
    const res = await post('/api/auth/change-email', { currentEmail: email, email });
    assert.equal(res.status, 400);
  });

  test('is a privacy-safe no-op for a non-existent current email (200, no change)', async () => {
    const res = await post('/api/auth/change-email', {
      currentEmail: 'ghost@verif.example',
      email: `new.${Date.now()}@verif.example`,
    });
    assert.equal(res.status, 200);
    assert.equal(await User.findOne({ email: /^new\./ }), null, 'no account created or changed');
  });

  test('does not change an already-verified account (200 no-op)', async () => {
    const email = await signup();
    await User.updateOne({ email }, { $set: { emailVerified: true } });
    const newEmail = `changed.${Date.now()}@verif.example`;

    const res = await post('/api/auth/change-email', { currentEmail: email, email: newEmail });
    assert.equal(res.status, 200);
    assert.ok(await User.findOne({ email }), 'verified account keeps its email');
    assert.equal(await User.findOne({ email: newEmail }), null);
  });
});
