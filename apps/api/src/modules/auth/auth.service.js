/**
 * Authentication business logic — AUTH-01 (ADR-005).
 *
 * Social tokens (Google) are used ONLY to verify identity. After verification the backend always
 * issues its OWN access + refresh tokens; the provider token is discarded and never authorizes
 * an API call.
 */

import { OAuth2Client } from 'google-auth-library';
import {
  USER_STATUS,
  ERROR_CODES,
  RESEND_COOLDOWN_SECONDS,
  SHORT_SESSION_TTL_DAYS,
} from '@evallo/shared';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { logger } from '../../lib/logger.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  signAccessToken,
  generateVerificationToken,
  hashToken,
} from '../../lib/tokens.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email/index.js';
import { User, AUTH_PROVIDERS } from '../users/user.model.js';
import { VerificationToken, TOKEN_PURPOSE } from './verificationToken.model.js';
import { createSession, revokeAllSessions } from './session.service.js';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
/** Short: it is used immediately, on the very next screen. */
const PASSWORD_SETUP_TTL_MS = 30 * 60 * 1000;

/**
 * Failed sign-in throttle (AUTH-04).
 *
 * Deliberately lenient: a lockout is itself a denial-of-service vector against a known email, so
 * the threshold is high enough that a legitimate user mistyping will not hit it, and the lock is
 * short enough to be a speed bump for attackers rather than a way to lock someone out for long.
 */
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const googleClient = env.isGoogleConfigured
  ? new OAuth2Client(env.GOOGLE_CLIENT_ID)
  : null;

/** Issues our access token for a fresh session, plus the raw refresh token for the cookie. */
async function issueTokens(user, context) {
  const { session, rawRefreshToken } = await createSession(user._id, context);
  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: session._id,
  });
  return { accessToken, rawRefreshToken };
}

/**
 * Issues a single-use verification token, invalidating any previous one, and emails the link.
 *
 * Invalidating the prior token is what makes "resend" safe: the older link stops working, so a
 * user can't accidentally verify with a stale email while a newer one is outstanding.
 *
 * Never throws on email failure — a delivery hiccup must not fail signup.
 */
async function issueAndSendVerification(user) {
  // One outstanding verification token per user.
  await VerificationToken.updateMany(
    { userId: user._id, purpose: TOKEN_PURPOSE.EMAIL_VERIFICATION, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const { raw, hash } = generateVerificationToken();

  await VerificationToken.create({
    tokenHash: hash,
    purpose: TOKEN_PURPOSE.EMAIL_VERIFICATION,
    userId: user._id,
    email: user.email,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  const url = `${env.APP_URL}/verify-email?token=${raw}`;
  // EmailService never throws — it reports the outcome so signup is not failed by a mail hiccup.
  const result = await sendVerificationEmail({ to: user.email, name: user.name, url });
  if (!result.delivered) {
    logger.warn('Verification email not delivered — user can resend', {
      userId: String(user._id),
      error: result.error,
    });
  }
}

/**
 * Seconds remaining before this user may resend, based on their most recent verification token.
 * Returns 0 when a resend is allowed. The token's createdAt is the "verificationSentAt" clock.
 */
async function resendCooldownRemaining(userId) {
  const latest = await VerificationToken.findOne({
    userId,
    purpose: TOKEN_PURPOSE.EMAIL_VERIFICATION,
  })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  if (!latest) return 0;

  const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * AUTH-01 — create account from an email address alone.
 *
 * No password and no name are collected here (PRD §21.1). The account exists but holds no
 * credential until AUTH-03, and authenticates nobody.
 */
export async function signup(input) {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    // Do not reveal whether the email is taken via a distinct code — but a signup form needs
    // actionable feedback, so we return a conflict pointing the user to sign in.
    throw ApiError.conflict('An account with this email already exists. Try signing in.', {
      email: 'This email is already registered',
    });
  }

  const user = await User.create({
    email: input.email,
    // No passwordHash and no name yet — see AUTH-03 / AUTH-04.
    provider: AUTH_PROVIDERS.PASSWORD,
    emailVerified: false,
  });

  await issueAndSendVerification(user);

  // SECURITY: signup does NOT authenticate the user. No access token, no refresh cookie, no
  // auth session is created here. A password account holds a session only AFTER its email is
  // verified and it logs in. (Google is different — see googleAuth — because Google has already
  // verified the email.)
  return { user, emailVerificationRequired: true };
}

/**
 * Resend the verification email for an unverified account (AUTH-02).
 *
 * Unauthenticated by email: after signup the user has no session (email is not yet verified),
 * so the Verification Sent screen identifies the account by the email it already knows.
 *
 * Privacy-safe: always resolves the same way regardless of whether the account exists or is
 * already verified, so this cannot be used to probe account state. A server-side cooldown
 * prevents mail spam; the client also counts down for UX.
 *
 * @param {string} email  Already normalised by the schema
 * @returns {Promise<{ ok: true }>}
 */
export async function resendVerification(email) {
  const user = await User.findOne({ email });

  if (user && !user.emailVerified) {
    const remaining = await resendCooldownRemaining(user._id);
    if (remaining === 0) {
      await issueAndSendVerification(user);
    }
    // Within the cooldown: silently skip sending. The client's countdown covers the UX.
  }

  return { ok: true };
}

/**
 * Change an unverified account's email, then send a fresh verification (AUTH-02).
 *
 * Unauthenticated by (currentEmail → newEmail): the pre-verification user has no session. Only
 * unverified accounts can be changed this way; a verified email is an account-settings concern.
 *
 * @param {string} currentEmail  Already normalised by the schema
 * @param {string} newEmail      Already normalised by the schema
 * @returns {Promise<{ email: string }>}
 */
export async function changeEmail(currentEmail, newEmail) {
  if (newEmail === currentEmail) {
    throw ApiError.validation('That is already your email address.', {
      email: 'Enter a different email address',
    });
  }

  const user = await User.findOne({ email: currentEmail });

  // Act only on an unverified account. Respond the same for "not found" and "already verified"
  // so this does not reveal account state — except the duplicate-email check below, which is
  // the same information signup already exposes.
  if (!user || user.emailVerified) {
    return { email: newEmail };
  }

  const taken = await User.findOne({ email: newEmail }).select('_id').lean();
  if (taken) {
    throw ApiError.conflict('That email is already in use.', {
      email: 'This email is already registered',
    });
  }

  user.email = newEmail;
  user.emailVerified = false;
  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict('That email is already in use.', {
        email: 'This email is already registered',
      });
    }
    throw error;
  }

  await issueAndSendVerification(user);
  return { email: user.email };
}

/** Log in with email + password. */
export async function login(input, context = {}) {
  // passwordHash is select:false, so ask for it explicitly.
  const user = await User.findOne({ email: input.email }).select('+passwordHash');

  // Same error whether the email is unknown or the password is wrong — no account enumeration.
  const invalid = ApiError.unauthenticated('Incorrect email or password.');

  if (!user || !user.passwordHash) throw invalid;
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account is not active.');
  }

  /**
   * Per-account lockout (AUTH-04). The IP limiter alone does not stop a distributed attack on
   * one account, so repeated failures lock that account briefly.
   */
  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
    throw new ApiError(
      ERROR_CODES.ACCOUNT_LOCKED,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const ok = await verifyPassword(input.password, user.passwordHash);

  if (!ok) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const update = { failedLoginAttempts: attempts };

    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      update.failedLoginAttempts = 0; // start a fresh count after the lock expires
      update.lockUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      logger.warn('Account locked after repeated failed sign-ins', { userId: String(user._id) });
    }

    await User.updateOne({ _id: user._id }, { $set: update });
    throw invalid;
  }

  // SECURITY: enforced AFTER the password check, so login cannot be used as an oracle for
  // whether an address is verified. An unverified account cannot obtain a session.
  if (!user.emailVerified) {
    throw new ApiError(
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      'Please verify your email before signing in. Check your inbox for the verification link.',
    );
  }

  user.lastLoginAt = new Date();
  // A successful sign-in clears the throttle.
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  // "Remember me" unticked → short server-side session; the cookie is also made session-scoped.
  const ttlDays = input.rememberMe ? undefined : SHORT_SESSION_TTL_DAYS;
  const tokens = await issueTokens(user, { ...context, ttlDays });

  return { user, ...tokens, rememberMe: Boolean(input.rememberMe) };
}

/**
 * Verify a Google ID token and sign the user in with OUR tokens.
 *
 * Links to an existing account by googleId, else by verified email, else creates one.
 */
export async function googleAuth(credential, context = {}) {
  if (!googleClient) {
    throw new ApiError('SERVER_ERROR', 'Google sign-in is not configured on this server.', {
      status: 503,
    });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthenticated('Could not verify your Google sign-in.');
  }

  if (!payload?.email || !payload.email_verified) {
    throw ApiError.unauthenticated('Your Google account has no verified email.');
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();

  let user =
    (await User.findOne({ googleId })) ?? (await User.findOne({ email }));

  if (user) {
    // Link Google to an existing password account, and trust Google's verified email.
    if (!user.googleId) user.googleId = googleId;
    if (!user.emailVerified) user.emailVerified = true;
    if (!user.profilePicture && payload.picture) user.profilePicture = payload.picture;
    if (!user.name && payload.name) user.name = payload.name;
    user.lastLoginAt = new Date();
    await user.save();
  } else {
    user = await User.create({
      name: payload.name,
      email,
      googleId,
      provider: AUTH_PROVIDERS.GOOGLE,
      emailVerified: true, // Google already verified it.
      profilePicture: payload.picture,
      lastLoginAt: new Date(),
    });
  }

  const tokens = await issueTokens(user, context);
  return { user, ...tokens };
}

/** Consume an email-verification token. */
export async function verifyEmail(rawToken) {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: TOKEN_PURPOSE.EMAIL_VERIFICATION,
  });

  // Unknown token — never existed, or already pruned by the TTL index.
  if (!record) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      'This verification link is not valid. It may have already been used.',
    );
  }

  const user = await User.findById(record.userId);
  if (!user) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      'This verification link is not valid.',
    );
  }

  /**
   * Reuse of a consumed token. If the account is verified, this is almost always the user
   * re-opening the same link (or a mail scanner pre-fetching it) — report it as already
   * verified so the UI can send them to sign in rather than showing a scary error.
   */
  if (record.consumedAt) {
    if (user.emailVerified) {
      throw new ApiError(
        ERROR_CODES.ALREADY_VERIFIED,
        'Your email is already verified. You can sign in.',
      );
    }
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      'This verification link has already been used.',
    );
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
      'This verification link has expired. Request a new one to continue.',
    );
  }

  // Verified in the meantime via a newer link — treat as success-equivalent, not an error path.
  if (user.emailVerified) {
    record.consumedAt = new Date();
    await record.save();
    throw new ApiError(
      ERROR_CODES.ALREADY_VERIFIED,
      'Your email is already verified. You can sign in.',
    );
  }

  /**
   * Consume atomically: only the request that flips consumedAt from null wins. Two concurrent
   * clicks on the same link therefore cannot both verify, and the loser gets the
   * already-verified path above rather than a double write.
   */
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: record._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  if (!claimed) {
    throw new ApiError(
      ERROR_CODES.ALREADY_VERIFIED,
      'Your email is already verified. You can sign in.',
    );
  }

  user.emailVerified = true;
  await user.save();

  // Invalidate any other outstanding verification links for this account.
  await VerificationToken.updateMany(
    {
      userId: user._id,
      purpose: TOKEN_PURPOSE.EMAIL_VERIFICATION,
      consumedAt: null,
    },
    { $set: { consumedAt: new Date() } },
  );

  /**
   * AUTH-03 hand-off. An account with no credential yet needs to reach the set-password screen,
   * and it has no session to authenticate with. Ownership was just proven, so we mint a
   * short-lived single-use setup token for exactly that step.
   *
   * Accounts that already have a password (e.g. re-verifying after an email change) get none —
   * there is nothing to set up.
   */
  const needsPassword = !user.passwordHash;
  let setupToken = null;

  if (needsPassword) {
    await VerificationToken.updateMany(
      { userId: user._id, purpose: TOKEN_PURPOSE.PASSWORD_SETUP, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );

    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: TOKEN_PURPOSE.PASSWORD_SETUP,
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + PASSWORD_SETUP_TTL_MS),
    });
    setupToken = raw;
  }

  return { verified: true, email: user.email, needsPassword, setupToken };
}

/**
 * AUTH-03 — create the credential, after verification.
 *
 * This is the FIRST point at which a password is stored, and the first legitimate session: the
 * address has been proven, so PRD §6.1 continues straight through to basic setup and the
 * workspace without a separate sign-in.
 *
 * @param {string} rawToken  Setup token from verify-email
 * @param {string} password
 */
export async function setPassword(rawToken, password, context = {}) {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: TOKEN_PURPOSE.PASSWORD_SETUP,
  });

  if (!record || record.consumedAt) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      'This setup link is not valid. It may have already been used.',
    );
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_EXPIRED,
      'This setup link has expired. Sign in to request a new verification email.',
    );
  }

  const user = await User.findById(record.userId);
  if (!user) {
    throw new ApiError(ERROR_CODES.VERIFICATION_TOKEN_INVALID, 'This setup link is not valid.');
  }

  // Claim atomically so two concurrent submits cannot both set a password.
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: record._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (!claimed) {
    throw new ApiError(
      ERROR_CODES.VERIFICATION_TOKEN_INVALID,
      'This setup link has already been used.',
    );
  }

  user.passwordHash = await hashPassword(password);
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  const tokens = await issueTokens(user, context);
  return { user, ...tokens };
}

/**
 * Begin a password reset. Always resolves the same way whether or not the account exists —
 * a privacy-safe response that prevents email enumeration (PRD §6.3).
 */
export async function forgotPassword(email) {
  const user = await User.findOne({ email }).lean();

  if (user) {
    // Invalidate any earlier unconsumed reset tokens for this user.
    await VerificationToken.updateMany(
      { userId: user._id, purpose: TOKEN_PURPOSE.PASSWORD_RESET, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );

    const { raw, hash } = generateVerificationToken();
    await VerificationToken.create({
      tokenHash: hash,
      purpose: TOKEN_PURPOSE.PASSWORD_RESET,
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    const url = `${env.APP_URL}/reset-password?token=${raw}`;
    const result = await sendPasswordResetEmail({ to: user.email, name: user.name, url });
    if (!result.delivered) {
      logger.warn('Password reset email not delivered', {
        userId: String(user._id),
        error: result.error,
      });
    }
  }

  return { ok: true };
}

/** Complete a password reset and revoke all existing sessions. */
export async function resetPassword(rawToken, newPassword) {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: TOKEN_PURPOSE.PASSWORD_RESET,
  });

  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw ApiError.validation('This reset link is invalid or has expired.');
  }

  record.consumedAt = new Date();
  await record.save();

  await User.updateOne(
    { _id: record.userId },
    { $set: { passwordHash: await hashPassword(newPassword), emailVerified: true } },
  );

  // A password change invalidates every existing session (ADR-005).
  await revokeAllSessions(record.userId, 'password_change');

  return { ok: true };
}
