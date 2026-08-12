/**
 * Authentication contracts — AUTH-01 (ADR-009).
 *
 * The SAME schemas validate the React forms and the Express requests.
 */

import { z } from 'zod';
import { email, personName } from './common.schema.js';

/**
 * Password policy. Deliberately length-first: length beats composition rules for real strength,
 * and this matches the client-side strength meter.
 */
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password is too long')
  .refine((value) => /[a-zA-Z]/.test(value), 'Include at least one letter')
  .refine((value) => /[0-9]/.test(value), 'Include at least one number');

/**
 * AUTH-01 — create account.
 *
 * Email ONLY. PRD §6.2 and §21.1: the sign-up page must not ask for a password, a name, a role,
 * or company information. The password is created after email verification (AUTH-03) and the
 * name after that (AUTH-04).
 */
export const signupSchema = z.object({
  email,
});

/**
 * AUTH-03 — set password, after the email has been verified.
 *
 * `token` is the single-use setup token handed out by verify-email; it proves ownership of the
 * address, so this is the first point at which a credential may be stored.
 */
export const setPasswordSchema = z
  .object({
    token: z.string().min(1, 'Missing setup token'),
    password,
    confirmPassword: z.string().min(1, 'Re-enter your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** AUTH-04 — basic personal setup. Full name only; everything else is deferred (PRD §6.1). */
export const basicSetupSchema = z.object({
  name: personName,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  /**
   * Remember me (PRD §6.3, AUTH-10). When false the refresh token becomes a session cookie and
   * gets a short server-side lifetime, so a shared machine does not stay signed in.
   */
  rememberMe: z.boolean().optional().default(false),
});

/** Refresh lifetime when "remember me" is not ticked. */
export const SHORT_SESSION_TTL_DAYS = 1;

export const googleAuthSchema = z.object({
  /** Google ID token (JWT) from the client. Verified server-side, then discarded. */
  credential: z.string().min(1, 'Missing Google credential'),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Missing reset token'),
  password,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Missing verification token'),
});

/** Cancels a pending account deletion during the grace period (16_RETENTION_POLICY.md §2). */
export const restoreAccountSchema = z.object({
  token: z.string().min(1, 'Missing restore token'),
});

export const resendVerificationSchema = z.object({
  email,
});

export const changeEmailSchema = z.object({
  currentEmail: email,
  email,
});

/** Seconds a user must wait between verification resends. Shared so the UI counts down to it. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Client-side password strength, mirrored from the policy above. 0–4. */
export function passwordStrength(value = '') {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-zA-Z]/.test(value) && /[0-9]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}
