/**
 * System state machines — PRD §14.2.
 *
 * Each object lists the valid states; each *_TRANSITIONS map lists the legal next states.
 * Transition maps are data, not logic — services consult them, they do not perform the move.
 */

export const USER_STATUS = Object.freeze({
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETION_PENDING: 'deletion_pending',
  DELETED: 'deleted',
});

export const COMPANY_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
});

/** Overlays COMPANY_STATUS — independent dimension (PRD §9.3). */
export const MODERATION_STATUS = Object.freeze({
  NONE: 'none',
  UNDER_REVIEW: 'under_review',
  RESTRICTED: 'restricted',
  SUSPENDED: 'suspended',
});

export const HIRING_INTENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
});

/** Only ACTIVE intents accept new role-specific interest — PRD §21.5. */
export const INTENT_ACCEPTS_INTEREST = Object.freeze([HIRING_INTENT_STATUS.ACTIVE]);

export const INTEREST_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  VIEWED: 'viewed',
  CONTACTED: 'contacted',
  PROGRESSED: 'progressed',
  CLOSED: 'closed',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
});

export const INTEREST_STATUS_VALUES = Object.freeze(Object.values(INTEREST_STATUS));

/**
 * Statuses a RECRUITER may set from the REC-11 inbox.
 *
 * `withdrawn` is absent deliberately: PRD §21.5 gives withdrawal to the candidate alone, and a
 * company able to write it could fabricate someone's decision to walk away. `draft` and `expired`
 * are machine states.
 */
export const RECRUITER_INTEREST_STATUS_VALUES = Object.freeze([
  INTEREST_STATUS.VIEWED,
  INTEREST_STATUS.CONTACTED,
  INTEREST_STATUS.PROGRESSED,
  INTEREST_STATUS.CLOSED,
]);

/** REC-11 inbox sorts. None of them imply candidate quality (PRD §10.3). */
export const INTEREST_INBOX_SORTS = Object.freeze({
  NEWEST: 'newest',
  OLDEST: 'oldest',
  STATUS: 'status',
});

export const INTEREST_INBOX_SORT_VALUES = Object.freeze(Object.values(INTEREST_INBOX_SORTS));

/**
 * Interest states counted as "active" for the unique partial index that guarantees
 * one interest per candidate/company/intent — PRD §4.1, §21.5.
 */
export const ACTIVE_INTEREST_STATES = Object.freeze([
  INTEREST_STATUS.SUBMITTED,
  INTEREST_STATUS.VIEWED,
  INTEREST_STATUS.CONTACTED,
  INTEREST_STATUS.PROGRESSED,
]);

export const EVIDENCE_VERIFICATION = Object.freeze({
  UNVERIFIED: 'unverified',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
});

export const EARLY_ACCESS_STATUS = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  INVITED: 'invited',
  CONVERTED: 'converted',
  DECLINED: 'declined',
  SPAM: 'spam',
});

/** Marketing segmentation only — NEVER written to a User document (ADR-001, ADR-014). */
export const EARLY_ACCESS_SEGMENT = Object.freeze({
  BUSINESS: 'business',
  EDUCATOR: 'educator',
});
