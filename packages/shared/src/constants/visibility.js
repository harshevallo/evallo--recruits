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
  /**
   * Everything `discoverable` allows, PLUS a portfolio anyone on the internet may read.
   *
   * A SUPERSET, not a replacement: a candidate who chooses this is still in recruiter search, so
   * opting into a public page never costs them the discovery they already had.
   *
   * Deliberately a sixth state rather than a reinterpretation of `discoverable`. Everyone
   * currently on `discoverable` chose it when it meant "authenticated recruiters"; widening that
   * word would publish people who never agreed to it. Reached only by an explicit user action —
   * nothing migrates into it.
   *
   * What "public" covers is narrower than what a recruiter sees: no contact details, no documents,
   * no assessment scores, no media, no city. See `portfolio.service.js` — the `public` audience.
   */
  PUBLIC: 'public',
  /** Hidden from NEW searches; existing authorized companies retain access. */
  PAUSED: 'paused',
  /** Unavailable for active use; retained subject to policy. */
  ARCHIVED: 'archived',
});

export const CANDIDATE_VISIBILITY_VALUES = Object.freeze(Object.values(CANDIDATE_VISIBILITY));

/**
 * States that may appear in recruiter search results before per-company checks are applied.
 *
 * `public` sits beside `discoverable` because it is a superset of it: someone who published a
 * portfolio to the open internet plainly wants recruiters to find them too, and omitting it would
 * make opting into a public page REMOVE them from search — a trap, not a feature.
 */
export const SEARCHABLE_VISIBILITY_STATES = Object.freeze([
  CANDIDATE_VISIBILITY.DISCOVERABLE,
  CANDIDATE_VISIBILITY.PUBLIC,
]);

/**
 * The only state whose portfolio an anonymous visitor may read.
 *
 * A single-member list on purpose, and a named constant rather than a bare comparison, so the one
 * place that answers "may the internet see this candidate" is greppable.
 */
export const PUBLICLY_READABLE_VISIBILITY_STATES = Object.freeze([CANDIDATE_VISIBILITY.PUBLIC]);

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
