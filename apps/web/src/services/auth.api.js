/**
 * Authentication endpoints — AUTH-01.
 *
 * signup/login/google/refresh set the access token in the client and return the user. The
 * refresh token is an httpOnly cookie the browser manages; JS never touches it.
 */

import axios from 'axios';
import { apiClient, unwrap, setAccessToken, clearAccessToken } from './apiClient.js';

const baseURL = import.meta.env.VITE_API_BASE_URL;

function applySession(payload) {
  if (payload?.accessToken) setAccessToken(payload.accessToken);
  return payload?.user ?? null;
}

/**
 * Sign up with email + password.
 *
 * Does NOT authenticate: the account must verify its email and then sign in. Returns
 * `{ user, emailVerificationRequired }` — no token, no session established here.
 */
export async function signup(input) {
  return unwrap(await apiClient.post('/auth/signup', input, { skipAuth: true }));
}

export async function login(input) {
  return applySession(unwrap(await apiClient.post('/auth/login', input, { skipAuth: true })));
}

export async function googleLogin(credential) {
  return applySession(
    unwrap(await apiClient.post('/auth/google', { credential }, { skipAuth: true })),
  );
}

/** Silent sign-in on app boot: swaps the refresh cookie for a fresh access token. */
export async function bootstrapSession() {
  try {
    const response = await axios.post(`${baseURL}/auth/refresh`, {}, { withCredentials: true });
    return applySession(response.data?.data);
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function logout() {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    clearAccessToken();
  }
}

export async function forgotPassword(email) {
  return unwrap(await apiClient.post('/auth/forgot-password', { email }, { skipAuth: true }));
}

export async function resetPassword(token, password) {
  return unwrap(
    await apiClient.post('/auth/reset-password', { token, password }, { skipAuth: true }),
  );
}

/**
 * Cancels a pending account deletion during the grace period.
 *
 * `skipAuth` because the caller cannot be signed in — a `deletion_pending` account is refused by
 * both sign-in paths. The response establishes no session by design.
 */
export async function restoreAccount(token) {
  return unwrap(await apiClient.post('/auth/restore-account', { token }, { skipAuth: true }));
}

export async function verifyEmail(token) {
  return unwrap(await apiClient.post('/auth/verify-email', { token }, { skipAuth: true }));
}

/**
 * AUTH-03 — set the password using the setup token from verify-email.
 * Establishes the session, so the returned user is authenticated.
 */
export async function setPassword({ token, password, confirmPassword }) {
  return applySession(
    unwrap(
      await apiClient.post(
        '/auth/set-password',
        { token, password, confirmPassword },
        { skipAuth: true },
      ),
    ),
  );
}

/** AUTH-02 — resend the verification email for an unverified account (unauthenticated). */
export async function resendVerification(email) {
  return unwrap(await apiClient.post('/auth/resend-verification', { email }, { skipAuth: true }));
}

/** AUTH-02 — change an unverified account's email and re-send verification (unauthenticated). */
export async function changeEmail(currentEmail, email) {
  return unwrap(
    await apiClient.post('/auth/change-email', { currentEmail, email }, { skipAuth: true }),
  );
}

/** Whether Google sign-in is configured server-side. */
export async function fetchAuthConfig() {
  try {
    return unwrap(await apiClient.get('/auth/config', { skipAuth: true }));
  } catch {
    return { googleEnabled: false };
  }
}
