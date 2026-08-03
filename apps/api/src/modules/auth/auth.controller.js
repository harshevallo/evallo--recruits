/**
 * Auth HTTP layer. Maps requests to auth.service; owns the refresh-token cookie.
 */

import { env } from '../../config/env.js';
import { sendSuccess, sendCreated } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import * as authService from './auth.service.js';
import { rotateSession, revokeSession } from './session.service.js';
import { signAccessToken } from '../../lib/tokens.js';
import { User } from '../users/user.model.js';

const REFRESH_COOKIE = 'evallo_rt';

/**
 * Cookie options. httpOnly so JavaScript (and any XSS) cannot read it; SameSite=Lax so it rides
 * top-level navigations but not cross-site POSTs; Path scoped to the auth routes that use it.
 */
function refreshCookieOptions({ persistent = true } = {}) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    /**
     * Omitting maxAge makes it a SESSION cookie — discarded when the browser closes. That is
     * what "remember me" unticked must do (AUTH-04); the server-side session is short too.
     */
    ...(persistent
      ? { maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 }
      : {}),
  };
}

function setRefreshCookie(res, rawToken, { persistent = true } = {}) {
  res.cookie(REFRESH_COOKIE, rawToken, refreshCookieOptions({ persistent }));
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

function requestContext(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') ?? undefined };
}

/** The body returned by every endpoint that establishes a session. */
function authPayload(user, accessToken) {
  return { accessToken, user: user.toPublicProfile() };
}

export async function signup(req, res) {
  const { user } = await authService.signup(req.body);

  // SECURITY: no access token, no refresh cookie. The account must verify its email and then
  // sign in to obtain a session. Return only the public profile and the pending-verification flag.
  return sendCreated(res, {
    user: user.toPublicProfile(),
    emailVerificationRequired: true,
  });
}

export async function login(req, res) {
  const { user, accessToken, rawRefreshToken, rememberMe } = await authService.login(
    req.body,
    requestContext(req),
  );
  setRefreshCookie(res, rawRefreshToken, { persistent: rememberMe });
  return sendSuccess(res, authPayload(user, accessToken));
}

export async function google(req, res) {
  const { user, accessToken, rawRefreshToken } = await authService.googleAuth(
    req.body.credential,
    requestContext(req),
  );
  setRefreshCookie(res, rawRefreshToken);
  return sendSuccess(res, authPayload(user, accessToken));
}

/**
 * Exchange the refresh cookie for a new access token, rotating the refresh token.
 * The client calls this on boot (silent sign-in) and after any 401.
 */
export async function refresh(req, res) {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) throw ApiError.unauthenticated('No active session.');

  const result = await rotateSession(rawToken, requestContext(req));

  if (!result || result.reuseDetected) {
    clearRefreshCookie(res);
    throw ApiError.unauthenticated('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(result.session.userId);
  if (!user) {
    clearRefreshCookie(res);
    throw ApiError.unauthenticated('Account not found.');
  }

  // A short-lived family (remember-me unticked) keeps its session-scoped cookie on rotation.
  setRefreshCookie(res, result.rawRefreshToken, {
    persistent: result.session.ttlDays == null,
  });
  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: result.session._id,
  });

  return sendSuccess(res, authPayload(user, accessToken));
}

export async function logout(req, res) {
  await revokeSession(req.cookies?.[REFRESH_COOKIE], 'logout');
  clearRefreshCookie(res);
  return sendSuccess(res, { ok: true });
}

/**
 * Marks the address verified. Returns a one-time `setupToken` when the account still has no
 * password, so the client can continue to AUTH-03. No session is created here.
 */
export async function verifyEmail(req, res) {
  return sendSuccess(res, await authService.verifyEmail(req.body.token));
}

/** AUTH-03 — set the password and start the session (PRD §6.1 steps 4→7). */
export async function setPassword(req, res) {
  const { user, accessToken, rawRefreshToken } = await authService.setPassword(
    req.body.token,
    req.body.password,
    requestContext(req),
  );

  // Onboarding continues straight into the app, so this session persists.
  setRefreshCookie(res, rawRefreshToken, { persistent: true });
  return sendSuccess(res, authPayload(user, accessToken));
}

/**
 * POST /api/auth/resend-verification — unauthenticated, by email.
 * Privacy-safe: always the same response regardless of account state.
 */
export async function resendVerification(req, res) {
  await authService.resendVerification(req.body.email);
  return sendSuccess(res, {
    message: 'If that account still needs verification, a new link has been sent.',
  });
}

/** POST /api/auth/change-email — unauthenticated, changes an UNVERIFIED account's email. */
export async function changeEmail(req, res) {
  const result = await authService.changeEmail(req.body.currentEmail, req.body.email);
  return sendSuccess(res, { ...result, message: 'Email updated. Check your new inbox.' });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body.email);
  // Always the same response, regardless of whether the account exists.
  return sendSuccess(res, {
    message: 'If an account exists for that email, a reset link has been sent.',
  });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body.token, req.body.password);
  return sendSuccess(res, { ok: true });
}

/** Marks the server's Google-configured state so the client shows/hides the button correctly. */
export function authConfig(_req, res) {
  return sendSuccess(res, { googleEnabled: env.isGoogleConfigured });
}
