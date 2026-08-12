/**
 * Authentication routes — AUTH-01.
 *
 * All public (no access token required). Credential and token endpoints are rate limited
 * against brute force (PRD §16.4).
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as controller from './auth.controller.js';
import {
  signupValidation,
  loginValidation,
  googleValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  verifyEmailValidation,
  setPasswordValidation,
  resendVerificationValidation,
  changeEmailValidation,
  restoreAccountValidation,
} from './auth.validation.js';

const router = Router();

router.get('/config', controller.authConfig);

router.post('/signup', authLimiter, validate(signupValidation), asyncHandler(controller.signup));
router.post('/login', authLimiter, validate(loginValidation), asyncHandler(controller.login));
router.post('/google', authLimiter, validate(googleValidation), asyncHandler(controller.google));

// Uses the refresh cookie, not a body — no schema.
router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));

router.post(
  '/verify-email',
  validate(verifyEmailValidation),
  asyncHandler(controller.verifyEmail),
);

// AUTH-03 — credential creation, authenticated by the single-use setup token from verify-email.
router.post(
  '/set-password',
  authLimiter,
  validate(setPasswordValidation),
  asyncHandler(controller.setPassword),
);

// AUTH-02 — resend and change-email are UNAUTHENTICATED by design: after signup the user has no
// session (email not yet verified), so the account is identified by email. Both are privacy-safe
// and rate limited. The service enforces a 60s resend cooldown; the client also counts down.
router.post(
  '/resend-verification',
  authLimiter,
  validate(resendVerificationValidation),
  asyncHandler(controller.resendVerification),
);
router.post(
  '/change-email',
  authLimiter,
  validate(changeEmailValidation),
  asyncHandler(controller.changeEmail),
);
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordValidation),
  asyncHandler(controller.forgotPassword),
);
/*
 * Cancels a pending account deletion (16_RETENTION_POLICY.md §2).
 *
 * UNAUTHENTICATED by necessity: a `deletion_pending` account is refused by both sign-in paths, so
 * the owner cannot reach an authenticated endpoint. The emailed single-use token is the credential,
 * and a successful restore issues NO session — signing in stays a separate, password-checked act.
 */
router.post(
  '/restore-account',
  authLimiter,
  validate(restoreAccountValidation),
  asyncHandler(controller.restoreAccount),
);

router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordValidation),
  asyncHandler(controller.resetPassword),
);

export default router;
