/**
 * Company membership roles — PRD §4.2.
 *
 * A role is ALWAYS scoped to a single company (ADR-001). There is no global user role, and
 * nothing in this file should ever be written to a User document.
 */

export const COMPANY_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  RECRUITER: 'recruiter',
  HIRING_MANAGER: 'hiring_manager',
  VIEWER: 'viewer',
});

export const COMPANY_ROLE_VALUES = Object.freeze(Object.values(COMPANY_ROLES));

/** Display labels. UI copy only — never used as an identifier. */
export const COMPANY_ROLE_LABELS = Object.freeze({
  [COMPANY_ROLES.OWNER]: 'Owner',
  [COMPANY_ROLES.ADMIN]: 'Admin',
  [COMPANY_ROLES.RECRUITER]: 'Recruiter',
  [COMPANY_ROLES.HIRING_MANAGER]: 'Hiring manager',
  [COMPANY_ROLES.VIEWER]: 'Viewer',
});

/**
 * Membership lifecycle — PRD §14.2.
 * `removed` records are retained, never deleted: PRD §21.6 requires the audit trail to
 * survive removal.
 */
export const MEMBERSHIP_STATUS = Object.freeze({
  INVITED: 'invited',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REMOVED: 'removed',
});

export const MEMBERSHIP_STATUS_VALUES = Object.freeze(Object.values(MEMBERSHIP_STATUS));
