/**
 * AUTH-01 — self-hosted email + password authentication (ADR-005).
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

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const CREDS = { name: 'Auth Tester', email: 'auth-test@example.com', password: 'Password123' };

/** AUTH-01 now takes an email only. */
const signupBody = { email: CREDS.email };

/**
 * Drives the PRD onboarding chain to a usable account:
 * AUTH-01 signup → verify-email (returns setupToken) → AUTH-03 set-password.
 * Returns the access token and refresh cookie from the session set-password creates.
 */
async function completeOnboarding(email = CREDS.email, password = CREDS.password) {
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
    password,
    confirmPassword: password,
  });
  const body = await res.json();

  return { accessToken: body.data.accessToken, cookie: cookieFrom(res), setupToken };
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie');
  return raw?.match(/evallo_rt=([^;]+)/)?.[1] ?? null;
}

/**
 * An account that has a password but has NOT verified its email. Unreachable through the PRD flow
 * (set-password implies verification), so it is built directly to exercise the login guard.
 */
async function signupWithPassword(creds = CREDS) {
  const { hashPassword } = await import('../../src/lib/password.js');
  return User.create({
    email: creds.email,
    passwordHash: await hashPassword(creds.password),
    emailVerified: false,
  });
}

/** Marks an account verified without going through the link. */
async function markVerified(email) {
  await User.updateOne({ email }, { $set: { emailVerified: true } });
}

/** A usable, signed-in account: full onboarding, then a fresh login. */
async function authedSession(creds = CREDS) {
  await completeOnboarding(creds.email, creds.password);
  const res = await jsonPost('/api/auth/login', {
    email: creds.email,
    password: creds.password,
  });
  const body = await res.json();
  return { accessToken: body.data.accessToken, cookie: cookieFrom(res) };
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/**
 * Cleanup is scoped to THIS suite's own fixture address — nothing wider.
 *
 * Two earlier mistakes are deliberately avoided here. Sessions and tokens were once cleared with
 * an unscoped `deleteMany({})`, which signed out every real user in the shared development
 * database. The user filter was then `/@example\.com$/`, which still matched the fixtures of
 * every OTHER suite and deleted their users mid-run — orphaning the candidate profiles those
 * suites had created. Match one address.
 */
const FIXTURE_EMAILS = [CREDS.email];

async function cleanupFixtures() {
  const fixtures = await User.find({ email: { $in: FIXTURE_EMAILS } })
    .select('_id')
    .lean();
  const ids = fixtures.map((u) => u._id);

  if (ids.length > 0) {
    await Session.deleteMany({ userId: { $in: ids } });
    await VerificationToken.deleteMany({ userId: { $in: ids } });
  }
  await VerificationToken.deleteMany({ email: { $in: FIXTURE_EMAILS } });
  await User.deleteMany({ email: { $in: FIXTURE_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

describe('POST /api/auth/signup (AUTH-01)', () => {
  test('creates an UNVERIFIED account from the email alone', async () => {
    const res = await jsonPost('/api/auth/signup', signupBody);
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.data.user.email, CREDS.email);
    assert.equal(body.data.user.emailVerified, false);
    assert.equal(body.data.emailVerificationRequired, true);
  });

  test('PRD §21.1: stores NO password and NO name at signup', async () => {
    await jsonPost('/api/auth/signup', signupBody);

    const stored = await User.findOne({ email: CREDS.email }).select('+passwordHash');
    assert.ok(!stored.passwordHash, 'no credential before email ownership is proven');
    assert.ok(!stored.name, 'name is collected later, at AUTH-04');
  });

  test('ignores a password or name if a client sends them anyway', async () => {
    await jsonPost('/api/auth/signup', CREDS); // includes name + password
    const stored = await User.findOne({ email: CREDS.email }).select('+passwordHash');

    assert.ok(!stored.passwordHash, 'schema strips it — cannot be smuggled in');
    assert.ok(!stored.name);
  });

  test('SECURITY: signup does NOT authenticate — no token, no cookie, no session', async () => {
    const res = await jsonPost('/api/auth/signup', signupBody);
    const body = await res.json();

    assert.ok(!body.data.accessToken, 'no access token issued');
    assert.equal(cookieFrom(res), null, 'no refresh cookie set');

    const user = await User.findOne({ email: CREDS.email });
    const sessions = await Session.countDocuments({ userId: user._id });
    assert.equal(sessions, 0, 'no auth session created during signup');
  });

  test('issues an email-verification token', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });
    const token = await VerificationToken.findOne({ userId: user._id, purpose: 'email_verification' });
    assert.ok(token, 'verification token created');
    assert.ok(token.tokenHash, 'stored as a hash, not raw');
  });

  test('rejects a duplicate email', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const res = await jsonPost('/api/auth/signup', signupBody);
    assert.equal(res.status, 409);
  });

  test('rejects a malformed email', async () => {
    const res = await jsonPost('/api/auth/signup', { email: 'not-an-email' });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.details.email);
  });
});

describe('POST /api/auth/set-password (AUTH-03)', () => {
  /** Signs up and verifies, returning the single-use setup token. */
  async function reachSetPassword() {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });
    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: CREDS.email,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const verified = await jsonPost('/api/auth/verify-email', { token: raw });
    return (await verified.json()).data;
  }

  test('verify-email hands back a setup token when no credential exists yet', async () => {
    const data = await reachSetPassword();
    assert.equal(data.verified, true);
    assert.equal(data.needsPassword, true);
    assert.ok(data.setupToken, 'setup token returned');
  });

  test('stores the password only after email ownership is proven, then signs the user in', async () => {
    const { setupToken } = await reachSetPassword();
    const res = await jsonPost('/api/auth/set-password', {
      token: setupToken,
      password: CREDS.password,
      confirmPassword: CREDS.password,
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(body.data.accessToken, 'session established for onboarding');
    assert.ok(cookieFrom(res), 'refresh cookie set');

    const stored = await User.findOne({ email: CREDS.email }).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$2[aby]\$/, 'bcrypt hash');
    assert.notEqual(stored.passwordHash, CREDS.password, 'not plaintext');
    assert.equal(stored.emailVerified, true);
  });

  test('never returns the password or its hash to the client', async () => {
    const { setupToken } = await reachSetPassword();
    const res = await jsonPost('/api/auth/set-password', {
      token: setupToken,
      password: CREDS.password,
      confirmPassword: CREDS.password,
    });
    const serialised = JSON.stringify(await res.json());
    assert.ok(!serialised.includes('passwordHash'));
    assert.ok(!serialised.includes(CREDS.password));
  });

  test('the setup token is single-use', async () => {
    const { setupToken } = await reachSetPassword();
    const payload = {
      token: setupToken,
      password: CREDS.password,
      confirmPassword: CREDS.password,
    };
    assert.equal((await jsonPost('/api/auth/set-password', payload)).status, 200);
    assert.equal((await jsonPost('/api/auth/set-password', payload)).status, 400);
  });

  test('rejects an unknown token', async () => {
    const res = await jsonPost('/api/auth/set-password', {
      token: 'not-a-real-token',
      password: CREDS.password,
      confirmPassword: CREDS.password,
    });
    assert.equal(res.status, 400);
  });

  test('rejects a weak password', async () => {
    const { setupToken } = await reachSetPassword();
    const res = await jsonPost('/api/auth/set-password', {
      token: setupToken,
      password: 'short',
      confirmPassword: 'short',
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.details.password);
  });

  test('rejects a mismatched confirmation', async () => {
    const { setupToken } = await reachSetPassword();
    const res = await jsonPost('/api/auth/set-password', {
      token: setupToken,
      password: CREDS.password,
      confirmPassword: 'DifferentPass123',
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.details.confirmPassword);
  });
});

describe('POST /api/auth/login', () => {
  // The state AUTH-03 leaves behind: a credential exists. Verification is toggled per test.
  beforeEach(async () => {
    await signupWithPassword();
  });

  test('SECURITY: blocks login until the email is verified', async () => {
    const res = await jsonPost('/api/auth/login', { email: CREDS.email, password: CREDS.password });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.error.code, 'EMAIL_NOT_VERIFIED');
    assert.ok(!body.data?.accessToken, 'no token for an unverified account');
    assert.equal(cookieFrom(res), null, 'no cookie for an unverified account');
  });

  test('logs in once the email is verified', async () => {
    await markVerified(CREDS.email);
    const res = await jsonPost('/api/auth/login', { email: CREDS.email, password: CREDS.password });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.data.accessToken);
    assert.ok(cookieFrom(res));
  });

  test('checks verification AFTER the password, so it is not a verification oracle', async () => {
    // Wrong password on an unverified account still returns the generic 401, not 403.
    const res = await jsonPost('/api/auth/login', { email: CREDS.email, password: 'WrongPass123' });
    assert.equal(res.status, 401);
  });

  test('rejects a wrong password with a generic message', async () => {
    await markVerified(CREDS.email);
    const res = await jsonPost('/api/auth/login', { email: CREDS.email, password: 'WrongPass123' });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.doesNotMatch(body.error.message.toLowerCase(), /password is|email not|no account/);
  });

  test('returns the same error for an unknown email', async () => {
    const res = await jsonPost('/api/auth/login', { email: 'nobody@example.com', password: CREDS.password });
    assert.equal(res.status, 401);
  });

  describe('AUTH-04 remember me', () => {
    test('unticked → session cookie (no Max-Age) and a short server session', async () => {
      await markVerified(CREDS.email);
      const res = await jsonPost('/api/auth/login', {
        email: CREDS.email,
        password: CREDS.password,
        rememberMe: false,
      });

      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.equal(res.status, 200);
      assert.ok(!/max-age/i.test(setCookie), 'must be a session cookie');

      const user = await User.findOne({ email: CREDS.email });
      const session = await Session.findOne({ userId: user._id }).sort({ createdAt: -1 });
      assert.equal(session.ttlDays, 1, 'short server-side lifetime');
    });

    test('ticked → persistent cookie with Max-Age and the full lifetime', async () => {
      await markVerified(CREDS.email);
      const res = await jsonPost('/api/auth/login', {
        email: CREDS.email,
        password: CREDS.password,
        rememberMe: true,
      });

      const setCookie = res.headers.get('set-cookie') ?? '';
      assert.ok(/max-age=\d+/i.test(setCookie), 'must persist across browser restarts');

      const user = await User.findOne({ email: CREDS.email });
      const session = await Session.findOne({ userId: user._id }).sort({ createdAt: -1 });
      assert.equal(session.ttlDays, undefined, 'default (long) lifetime');
    });

    test('rotation does not upgrade a short session to a long one', async () => {
      await markVerified(CREDS.email);
      const login = await jsonPost('/api/auth/login', {
        email: CREDS.email,
        password: CREDS.password,
        rememberMe: false,
      });
      const cookie = cookieFrom(login);

      const refreshed = await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${cookie}` });
      const setCookie = refreshed.headers.get('set-cookie') ?? '';

      assert.equal(refreshed.status, 200);
      assert.ok(!/max-age/i.test(setCookie), 'still a session cookie after rotation');

      const user = await User.findOne({ email: CREDS.email });
      const session = await Session.findOne({ userId: user._id }).sort({ createdAt: -1 });
      assert.equal(session.ttlDays, 1, 'short lifetime inherited');
    });
  });

  describe('AUTH-04 failed-attempt throttling', () => {
    test('locks the account after repeated wrong passwords, then reports 429', async () => {
      await markVerified(CREDS.email);

      // Sequential by necessity: the lockout counter depends on the previous attempt.
      for (let i = 0; i < 10; i += 1) {
        await jsonPost('/api/auth/login', { email: CREDS.email, password: 'WrongPass123' });
      }

      // Even the CORRECT password is refused while locked.
      const res = await jsonPost('/api/auth/login', {
        email: CREDS.email,
        password: CREDS.password,
      });
      const body = await res.json();

      assert.equal(res.status, 429);
      assert.equal(body.error.code, 'ACCOUNT_LOCKED');
    });

    test('a successful sign-in clears the failure counter', async () => {
      await markVerified(CREDS.email);

      await jsonPost('/api/auth/login', { email: CREDS.email, password: 'WrongPass123' });
      let user = await User.findOne({ email: CREDS.email });
      assert.equal(user.failedLoginAttempts, 1);

      await jsonPost('/api/auth/login', { email: CREDS.email, password: CREDS.password });
      user = await User.findOne({ email: CREDS.email });
      assert.equal(user.failedLoginAttempts, 0);
      assert.ok(!user.lockUntil);
    });
  });
});

describe('GET /api/me', () => {
  test('rejects a request with no token', async () => {
    const res = await authGet('/api/me');
    assert.equal(res.status, 401);
  });

  test('rejects a forged token', async () => {
    const res = await authGet('/api/me', 'not.a.jwt');
    assert.equal(res.status, 401);
  });

  test('returns the user and derived capabilities for a valid token', async () => {
    const { accessToken } = await authedSession();

    const res = await authGet('/api/me', accessToken);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.user.email, CREDS.email);
    assert.ok(body.data.capabilities, 'capabilities derived, not stored');
    assert.equal(body.data.capabilities.hasCandidateProfile, false);
    assert.deepEqual(body.data.capabilities.companies, []);
    assert.ok(!('role' in body.data.user), 'no global user role');
  });
});

describe('POST /api/auth/refresh', () => {
  test('rotates the refresh token and issues a new access token', async () => {
    const { cookie: firstCookie } = await authedSession();

    const res = await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${firstCookie}` });
    const body = await res.json();
    const secondCookie = cookieFrom(res);

    assert.equal(res.status, 200);
    assert.ok(body.data.accessToken);
    assert.ok(secondCookie);
    assert.notEqual(secondCookie, firstCookie, 'refresh token rotated');
  });

  test('detects reuse of a rotated token and revokes the family', async () => {
    const { cookie: firstCookie } = await authedSession();

    // Use it once — this rotates it, so firstCookie is now spent.
    await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${firstCookie}` });

    // Present the spent token again → reuse detected.
    const reuse = await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${firstCookie}` });
    assert.equal(reuse.status, 401, 'reused token rejected');

    /*
     * Revocation is family-scoped by design (ADR-005): the compromised chain dies, unrelated
     * sessions on other devices survive. Onboarding leaves one such session behind, so scope
     * the assertion to the family the reused token belonged to.
     */
    const user = await User.findOne({ email: CREDS.email });
    const compromised = await Session.findOne({ userId: user._id, revokedReason: 'reuse_detected' });
    assert.ok(compromised, 'reuse recorded');

    const active = await Session.countDocuments({
      familyId: compromised.familyId,
      revokedAt: null,
    });
    assert.equal(active, 0, 'whole family revoked on reuse');
  });

  test('rejects refresh with no cookie', async () => {
    const res = await jsonPost('/api/auth/refresh', {});
    assert.equal(res.status, 401);
  });
});

describe('email verification', () => {
  test('verifies the account with a valid token', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    // Re-issue a token we know the raw value of.
    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await jsonPost('/api/auth/verify-email', { token: raw });
    assert.equal(res.status, 200);

    const updated = await User.findOne({ email: CREDS.email });
    assert.equal(updated.emailVerified, true);
  });

  test('rejects an invalid token', async () => {
    const res = await jsonPost('/api/auth/verify-email', { token: 'nope' });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error.code, 'VERIFICATION_TOKEN_INVALID');
  });

  test('rejects an EXPIRED token with a distinct code', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() - 1000), // already past
    });

    const res = await jsonPost('/api/auth/verify-email', { token: raw });
    const body = await res.json();
    assert.equal(res.status, 410);
    assert.equal(body.error.code, 'VERIFICATION_TOKEN_EXPIRED');

    const after = await User.findOne({ email: CREDS.email });
    assert.equal(after.emailVerified, false, 'expired token must not verify');
  });

  test('token expiry window is 24 hours', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });
    const token = await VerificationToken.findOne({
      userId: user._id,
      purpose: 'email_verification',
    });

    const hours = (token.expiresAt.getTime() - token.createdAt.getTime()) / 3_600_000;
    assert.ok(Math.abs(hours - 24) < 0.05, `expected ~24h, got ${hours}h`);
  });

  test('prevents reuse — second use of the same token reports already verified', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const first = await jsonPost('/api/auth/verify-email', { token: raw });
    assert.equal(first.status, 200);

    const second = await jsonPost('/api/auth/verify-email', { token: raw });
    const body = await second.json();
    assert.equal(second.status, 409);
    assert.equal(body.error.code, 'ALREADY_VERIFIED');
  });

  test('invalidates the token after successful verification', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await jsonPost('/api/auth/verify-email', { token: raw });

    const consumed = await VerificationToken.findOne({ tokenHash: hash });
    assert.ok(consumed.consumedAt, 'token marked consumed');

    // Any other outstanding verification links for this account are invalidated too.
    const stillActive = await VerificationToken.countDocuments({
      userId: user._id,
      purpose: 'email_verification',
      consumedAt: null,
    });
    assert.equal(stillActive, 0);
  });

  test('returns the verified email so the client can prefill sign-in', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await jsonPost('/api/auth/verify-email', { token: raw });
    const body = await res.json();
    assert.equal(body.data.verified, true);
    assert.equal(body.data.email, CREDS.email);
  });

  test('SECURITY: verification does not authenticate — no token, no cookie', async () => {
    await jsonPost('/api/auth/signup', signupBody);
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'email_verification',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await jsonPost('/api/auth/verify-email', { token: raw });
    const body = await res.json();

    assert.ok(!body.data.accessToken, 'no access token');
    assert.equal(cookieFrom(res), null, 'no refresh cookie');
    assert.equal(await Session.countDocuments({ userId: user._id }), 0, 'no session created');
  });
});

describe('password reset', () => {
  test('forgot-password responds the same whether or not the account exists', async () => {
    await jsonPost('/api/auth/signup', signupBody);

    const known = await jsonPost('/api/auth/forgot-password', { email: CREDS.email });
    const unknown = await jsonPost('/api/auth/forgot-password', { email: 'ghost@example.com' });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json(), 'identical response — no enumeration');
  });

  test('reset-password sets a new password and revokes sessions', async () => {
    const { cookie } = await authedSession();
    const user = await User.findOne({ email: CREDS.email });

    const { generateVerificationToken } = await import('../../src/lib/tokens.js');
    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: 'password_reset',
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await jsonPost('/api/auth/reset-password', { token: raw, password: 'NewPassword123' });
    assert.equal(res.status, 200);

    // Old sessions are gone.
    const stillValid = await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${cookie}` });
    assert.equal(stillValid.status, 401, 'existing sessions revoked after reset');

    // Reset also verifies the email, so the new password can log in; the old one cannot.
    const good = await jsonPost('/api/auth/login', { email: CREDS.email, password: 'NewPassword123' });
    const bad = await jsonPost('/api/auth/login', { email: CREDS.email, password: CREDS.password });
    assert.equal(good.status, 200);
    assert.equal(bad.status, 401);
  });
});

describe('AUTH-04 basic personal setup', () => {
  test('the name arrives only at this step, via PATCH /api/me', async () => {
    const { accessToken } = await completeOnboarding();

    const before = await User.findOne({ email: CREDS.email });
    assert.ok(!before.name, 'no name until the user supplies one');

    const res = await fetch(`${baseUrl}/api/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: CREDS.name }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.data.user.name, CREDS.name);

    const after = await User.findOne({ email: CREDS.email });
    assert.equal(after.name, CREDS.name);
  });
});

describe('AUTH-05 first-action router', () => {
  const post = (token) =>
    fetch(`${baseUrl}/api/me/complete-onboarding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

  test('a freshly onboarded user has not completed the router yet', async () => {
    const { accessToken } = await completeOnboarding();
    const body = await (await authGet('/api/me', accessToken)).json();
    assert.equal(body.data.user.onboardingCompletedAt, null);
  });

  test('stamps onboardingCompletedAt and creates NOTHING', async () => {
    const { accessToken } = await completeOnboarding();

    const res = await post(accessToken);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.ok(body.data.user.onboardingCompletedAt, 'timestamp recorded');

    // PRD §21.1 / ADR-001: the router is navigation, not a role.
    assert.equal(body.data.capabilities.hasCandidateProfile, false);
    assert.deepEqual(body.data.capabilities.companies, []);
    assert.ok(!('role' in body.data.user), 'no role written anywhere');
  });

  test('is idempotent — a second call does not move the timestamp', async () => {
    const { accessToken } = await completeOnboarding();

    const first = await (await post(accessToken)).json();
    const second = await (await post(accessToken)).json();

    assert.equal(
      second.data.user.onboardingCompletedAt,
      first.data.user.onboardingCompletedAt,
      'first stamp wins',
    );
  });

  test('requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/me/complete-onboarding`, { method: 'POST' });
    assert.equal(res.status, 401);
  });
});

describe('logout', () => {
  test('revokes the session so its refresh token no longer works', async () => {
    const { cookie } = await authedSession();

    const out = await jsonPost('/api/auth/logout', {}, { Cookie: `evallo_rt=${cookie}` });
    assert.equal(out.status, 200);

    const after = await jsonPost('/api/auth/refresh', {}, { Cookie: `evallo_rt=${cookie}` });
    assert.equal(after.status, 401, 'refresh fails after logout');
  });
});
