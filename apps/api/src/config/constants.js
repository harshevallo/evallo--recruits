/**
 * Server-side tunables.
 *
 * Values that are operational (limits, windows, sizes) rather than contractual. Anything the
 * CLIENT also needs to know belongs in packages/shared/constants, not here.
 */

export const API_PREFIX = '/api';

export const BODY_LIMIT = '100kb';

/** Rate limits — PRD §16.4 (brute-force protection), §16.3 (anti-spam). */
export const RATE_LIMITS = Object.freeze({
  GLOBAL: { windowMs: 15 * 60 * 1000, max: 300 },
  AUTH: { windowMs: 15 * 60 * 1000, max: 10 },
  PUBLIC_WRITE: { windowMs: 60 * 60 * 1000, max: 5 },
  /*
   * Unauthenticated share-link reads (ADR-019).
   *
   * Generous enough that a candidate can send one link to a hiring committee who all open it,
   * and tight enough that the endpoint cannot be used to sweep the token space. The token itself
   * is 256 bits, so this is defence in depth against traffic cost, not against guessing.
   */
  SHARE_LINK: { windowMs: 15 * 60 * 1000, max: 60 },
});

export const PAGINATION = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

/** Mongoose connection tuning. */
export const DB = Object.freeze({
  SERVER_SELECTION_TIMEOUT_MS: 10_000,
  SOCKET_TIMEOUT_MS: 45_000,
  MAX_POOL_SIZE: 10,
});
