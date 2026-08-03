/**
 * Password hashing — bcrypt (ADR-005: cost >= 12).
 *
 * bcryptjs (pure JS) is used rather than the native `bcrypt` to avoid a compile step on Windows.
 * Same algorithm and hash format; portable across machines with no build tools.
 */

import bcrypt from 'bcryptjs';

const COST = 12;

/** @param {string} plain @returns {Promise<string>} */
export function hashPassword(plain) {
  return bcrypt.hash(plain, COST);
}

/** @param {string} plain @param {string} hash @returns {Promise<boolean>} */
export function verifyPassword(plain, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}
