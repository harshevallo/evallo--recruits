/**
 * Rate limiters — PRD §16.4 (brute force), §16.3 (anti-spam).
 *
 * Limiters are defined here and attached per-route by the module that needs them. Only the
 * global limiter is applied application-wide.
 */

import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '@evallo/shared';
import { RATE_LIMITS } from '../config/constants.js';
import { env } from '../config/env.js';

function buildLimiter({ windowMs, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    max,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // Rate limiting would make tests non-deterministic.
    skip: () => env.isTest,
    handler: (req, res) => {
      req.log?.warn('rate limit exceeded', { path: req.originalUrl, ip: req.ip });
      res.status(429).json({
        success: false,
        error: { code: ERROR_CODES.RATE_LIMITED, message },
      });
    },
  });
}

/** Broad protection against traffic floods. Applied in app.js. */
export const globalLimiter = buildLimiter({
  ...RATE_LIMITS.GLOBAL,
  message: 'Too many requests. Please try again shortly.',
});

/**
 * Credential endpoints. Counts only FAILED requests, so this throttles brute force (AUTH-04)
 * without penalising a user who signs in successfully several times in a row.
 */
export const authLimiter = buildLimiter({
  ...RATE_LIMITS.AUTH,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

/** For unauthenticated writes such as the early-access form (M-M). */
export const publicWriteLimiter = buildLimiter({
  ...RATE_LIMITS.PUBLIC_WRITE,
  message: 'Too many submissions. Please try again later.',
});
