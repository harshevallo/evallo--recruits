/**
 * Baseline security middleware — PRD §16.4.
 *
 * Applied to every request before routing. Nothing here is optional.
 */

import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from '../config/env.js';

/**
 * CORS.
 *
 * `credentials: true` is required so the browser sends the httpOnly refresh cookie (ADR-005),
 * and that in turn forbids a wildcard origin — hence the exact-match allowlist. env.js already
 * rejects CLIENT_ORIGIN="*" at boot, so this cannot be misconfigured silently.
 *
 * CLIENT_ORIGIN may list several origins (apex + www, or a preview domain). Each is still matched
 * exactly; the list never widens to a pattern.
 */
export const corsMiddleware = cors({
  origin: [...env.CLIENT_ORIGINS],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  // Any custom header the client sends must be listed, or the browser blocks the request after
  // a successful preflight — the failure looks like a network error, not a CORS error.
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-landing-path'],
  exposedHeaders: ['x-request-id'],
  maxAge: 86_400,
});

/**
 * Helmet.
 *
 * CSP is left off for now: it must be defined alongside the prerendered public pages (ADR-013),
 * where the real script and style sources are known. Enabling a guessed policy now would only
 * teach us to disable it.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/**
 * Strips keys containing `$` or `.` from request payloads, blocking MongoDB operator injection
 * (e.g. `{ email: { $ne: null } }` submitted as a login body).
 */
export const sanitizeMiddleware = mongoSanitize({
  replaceWith: '_',
  allowDots: false,
});
