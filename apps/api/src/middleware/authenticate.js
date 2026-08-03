/**
 * Access-token verification — our own JWT (ADR-005).
 *
 * Layer 1 of the four-layer authorization model. The token carries only the user id and session
 * id; company authority is resolved per request from CompanyMember (ADR-006), never from the
 * token. On success attaches `req.authUser = { userId, sessionId }`.
 */

import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../lib/tokens.js';
import { ApiError } from '../lib/ApiError.js';
import { ERROR_CODES } from '@evallo/shared';

function bearer(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export function authenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) return next(ApiError.unauthenticated('Sign in to continue.'));

  try {
    req.authUser = verifyAccessToken(token);
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Distinct code so the client interceptor knows to refresh rather than sign out.
      return next(
        new ApiError(ERROR_CODES.TOKEN_EXPIRED, 'Your session has expired.'),
      );
    }
    return next(ApiError.unauthenticated('Your session is invalid. Please sign in again.'));
  }
}

/** Attaches identity when a valid token is present, but never rejects. */
export function optionalAuthenticate(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();

  try {
    req.authUser = verifyAccessToken(token);
  } catch {
    // Ignore — the route treats the request as anonymous.
  }
  return next();
}
