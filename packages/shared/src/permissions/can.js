/**
 * Permission resolver — pure, environment-agnostic, used by BOTH apps.
 *
 * Two implementations of one rule guarantee a UI that offers actions the API rejects, so there
 * is exactly one (07_PROJECT_STRUCTURE.md §2).
 *
 * IMPORTANT: this answers "does this role grant this permission?" — layer 3 of the four-layer
 * authorization model (ADR-006). It does NOT answer:
 *   - layer 2, is the membership active for this company  → resolveCompanyContext
 *   - layer 4, does the CANDIDATE permit this company     → policies/candidateVisibility
 * Never treat a `true` from this function as sufficient authorization on its own.
 */

import { MEMBERSHIP_STATUS } from '../constants/roles.js';
import { ROLE_PERMISSIONS, ASSIGNMENT_SCOPED_PERMISSIONS } from './matrix.js';

/**
 * @typedef {Object} Membership
 * @property {string}   role                  One of COMPANY_ROLES
 * @property {string}   status                One of MEMBERSHIP_STATUS
 * @property {string[]} [permissionOverrides] Explicit grants beyond the role
 * @property {string[]} [assignedIntentIds]   Scopes assignment-limited roles
 */

/**
 * Does this membership grant the permission?
 *
 * @param {Membership|null|undefined} membership
 * @param {string} permission
 * @returns {boolean}
 */
export function can(membership, permission) {
  if (!membership || !permission) return false;

  // Fail closed: only an active membership carries any authority (PRD §21.6).
  if (membership.status !== MEMBERSHIP_STATUS.ACTIVE) return false;

  if (membership.permissionOverrides?.includes(permission)) return true;

  const granted = ROLE_PERMISSIONS[membership.role];
  return Array.isArray(granted) && granted.includes(permission);
}

/** True when EVERY permission is granted. */
export function canAll(membership, permissions = []) {
  return permissions.every((permission) => can(membership, permission));
}

/** True when AT LEAST ONE permission is granted. */
export function canAny(membership, permissions = []) {
  return permissions.some((permission) => can(membership, permission));
}

/**
 * Is this permission limited to the membership's assigned intents?
 *
 * Callers that get `true` must additionally scope their query by `membership.assignedIntentIds`.
 * This function reports the constraint; it does not enforce it.
 *
 * @returns {boolean}
 */
export function isAssignmentScoped(membership, permission) {
  if (!membership) return false;
  const scoped = ASSIGNMENT_SCOPED_PERMISSIONS[membership.role];
  return Array.isArray(scoped) && scoped.includes(permission);
}

/** All permissions this membership currently holds. For UI use; not an authorization decision. */
export function permissionsFor(membership) {
  if (!membership || membership.status !== MEMBERSHIP_STATUS.ACTIVE) return [];
  const base = ROLE_PERMISSIONS[membership.role] ?? [];
  const overrides = membership.permissionOverrides ?? [];
  return [...new Set([...base, ...overrides])];
}
