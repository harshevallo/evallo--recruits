/**
 * Candidate visibility states — PRD §4.3.
 *
 * These constrain recruiter access INDEPENDENTLY of the recruiter's role. A recruiter holding
 * `candidate:view` may still be denied, because the candidate controls this dimension.
 * See ADR-006 §6.2 — the check runs inside the database query, never as a post-filter.
 */

export const CANDIDATE_VISIBILITY = Object.freeze({
  /** Not discoverable, not shareable through interest. User only. */
  DRAFT: 'draft',
  /** Excluded from search. Can still be shared with a specific company via interest. */
  PRIVATE: 'private',
  /** Included in authenticated recruiter search, subject to privacy settings. */
  DISCOVERABLE: 'discoverable',
  /** Hidden from NEW searches; existing authorized companies retain access. */
  PAUSED: 'paused',
  /** Unavailable for active use; retained subject to policy. */
  ARCHIVED: 'archived',
});

export const CANDIDATE_VISIBILITY_VALUES = Object.freeze(Object.values(CANDIDATE_VISIBILITY));

/** States that may appear in recruiter search results before per-company checks are applied. */
export const SEARCHABLE_VISIBILITY_STATES = Object.freeze([CANDIDATE_VISIBILITY.DISCOVERABLE]);

/**
 * Contact reveal rules — PRD §7.10, Appendix D.
 * Default is HIDDEN. Changing that default requires an ADR.
 */
export const CONTACT_VISIBILITY = Object.freeze({
  HIDDEN: 'hidden',
  AUTHORIZED_RECRUITERS: 'authorized_recruiters',
  AFTER_INTEREST: 'after_interest',
  ON_REQUEST: 'on_request',
});

export const CONTACT_VISIBILITY_VALUES = Object.freeze(Object.values(CONTACT_VISIBILITY));
