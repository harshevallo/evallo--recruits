/**
 * Refresh-token session lifecycle — rotation and reuse detection (ADR-005).
 */

import mongoose from 'mongoose';
import {
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
} from '../../lib/tokens.js';
import { Session } from './session.model.js';

/**
 * Issue a brand-new session family (fresh login).
 *
 * @returns {Promise<{ session: object, rawRefreshToken: string }>}
 */
export async function createSession(userId, context = {}) {
  const rawRefreshToken = generateRefreshToken();
  const familyId = new mongoose.Types.ObjectId();

  const session = await Session.create({
    userId,
    familyId,
    refreshTokenHash: hashToken(rawRefreshToken),
    // A short-lived session when "remember me" is off (AUTH-04).
    expiresAt: refreshTokenExpiry(context.ttlDays),
    ttlDays: context.ttlDays,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  return { session, rawRefreshToken };
}

/**
 * Rotate a refresh token.
 *
 * Returns the new session + raw token on success. Detects two failures:
 *   - unknown/expired token  → null (client must re-authenticate)
 *   - REUSE of a rotated token → revokes the whole family and returns { reuseDetected: true }
 *
 * @param {string} rawToken
 * @returns {Promise<{ session, rawRefreshToken } | { reuseDetected: true } | null>}
 */
export async function rotateSession(rawToken, context = {}) {
  const current = await Session.findOne({ refreshTokenHash: hashToken(rawToken) });

  if (!current) return null;

  // Already rotated or explicitly revoked → this token should never be presented again.
  if (current.revokedAt) {
    await Session.updateMany(
      { familyId: current.familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'reuse_detected' } },
    );
    return { reuseDetected: true };
  }

  if (current.expiresAt.getTime() < Date.now()) return null;

  const rawRefreshToken = generateRefreshToken();
  const next = await Session.create({
    userId: current.userId,
    familyId: current.familyId,
    refreshTokenHash: hashToken(rawRefreshToken),
    // Inherit the family's original lifetime — rotation must not extend a short session.
    expiresAt: refreshTokenExpiry(current.ttlDays),
    ttlDays: current.ttlDays,
    userAgent: context.userAgent,
    ip: context.ip,
  });

  current.revokedAt = new Date();
  current.revokedReason = 'rotated';
  current.replacedBy = next._id;
  await current.save();

  return { session: next, rawRefreshToken };
}

/** Revoke a single session (logout). Safe to call with an unknown token. */
export async function revokeSession(rawToken, reason = 'logout') {
  if (!rawToken) return;
  await Session.updateOne(
    { refreshTokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}

/** Revoke every active session for a user (e.g. after a password change). */
export async function revokeAllSessions(userId, reason = 'password_change') {
  await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  );
}
