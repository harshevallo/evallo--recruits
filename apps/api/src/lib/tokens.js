/**
 * Token issuance and verification — ADR-005.
 *
 *   Access token   short-lived JWT, returned in the response body, held in memory by the client.
 *   Refresh token  opaque random value, set as an httpOnly cookie, stored HASHED in `sessions`,
 *                  rotated on every use with reuse detection.
 *
 * The access token carries only `{ sub: userId, sid: sessionId }` — no roles and no company
 * context. Company authority is resolved per request from CompanyMember (ADR-001/006), so it
 * must never be baked into a token that lives for fifteen minutes.
 */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_ISSUER = 'evallo-recruit';

/**
 * @param {{ userId: string, sessionId: string }} claims
 * @returns {string}
 */
export function signAccessToken({ userId, sessionId }) {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    issuer: ACCESS_ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

/**
 * @param {string} token
 * @returns {{ userId: string, sessionId: string }}
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError
 */
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ACCESS_ISSUER });
  return { userId: payload.sub, sessionId: payload.sid };
}

/** A high-entropy opaque refresh token. Never a JWT — it is a bearer secret, stored hashed. */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/** SHA-256 for storage. The raw token exists only in the cookie; the database keeps the hash. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Random single-use token for email verification and password reset. Returns raw + hash. */
export function generateVerificationToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

/**
 * @param {number} [ttlDays] Overrides the configured lifetime — used for short ("remember me"
 *                           unticked) sessions.
 */
export function refreshTokenExpiry(ttlDays) {
  const days = ttlDays ?? env.REFRESH_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
