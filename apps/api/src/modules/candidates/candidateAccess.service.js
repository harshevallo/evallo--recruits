/**
 * Candidate access — authorization layer 4 (ADR-006 §6.2, PRD §4.3, §16.1).
 *
 * The single answer to "may this COMPANY see this CANDIDATE, and how much of them?". REC-11's
 * inbox, REC-12's search and REC-13's viewer all resolve access through here, because three
 * copies of §4.3 would eventually disagree — and a disagreement in this direction is a privacy
 * breach, not a bug report.
 *
 * These rules constrain a recruiter INDEPENDENTLY of the role they hold. `candidate:view` says
 * the member may use the candidate surface at all; nothing in the permission matrix can override
 * a candidate's own visibility choice or a block.
 */

import {
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  ACTIVE_INTEREST_STATES,
  SEARCHABLE_VISIBILITY_STATES,
} from '@evallo/shared';
import { AccessGrant } from '../interests/accessGrant.model.js';
import { ExpressionOfInterest } from '../interests/expressionOfInterest.model.js';

/** Why a candidate is not reachable. Never returned to a recruiter — logged, or used internally. */
export const ACCESS_DENIED = Object.freeze({
  BLOCKED: 'blocked_by_candidate',
  NOT_PUBLISHED: 'not_published',
  ARCHIVED: 'archived',
  PRIVATE_NO_GRANT: 'private_without_grant',
  PAUSED_NO_GRANT: 'paused_without_prior_access',
  /*
   * A visibility value this function has no rule for.
   *
   * Reached only when `CANDIDATE_VISIBILITY` gains a member and this switch is not updated with
   * it, or when a document holds a value written before a rename. Either way the honest answer is
   * "we do not know what this means", and the safe one is no.
   */
  UNKNOWN_VISIBILITY: 'unknown_visibility_state',
});

/** True when the candidate has blocked this company. Overrides everything else (PRD §4.3). */
function isBlocked(profile, companyId) {
  return (profile.blockedCompanyIds ?? []).some((id) => String(id) === String(companyId));
}

/** An active (un-withdrawn) grant is what "previously authorized" means in §4.3. */
async function hasActiveGrant(candidateId, companyId) {
  const grant = await AccessGrant.exists({
    candidateId,
    companyId,
    withdrawnAt: { $in: [null, undefined] },
  });
  return Boolean(grant);
}

/**
 * Whether this candidate has an OPEN expression of interest in this company.
 *
 * Distinct from a grant on purpose: `after_interest` contact sharing is about the candidate
 * having reached out, and a withdrawn interest must stop revealing contact details even while
 * retention rules keep the record.
 */
async function hasOpenInterest(candidateId, companyId) {
  const interest = await ExpressionOfInterest.exists({
    candidateId,
    companyId,
    status: { $in: ACTIVE_INTEREST_STATES },
  });
  return Boolean(interest);
}

/**
 * Resolves contact visibility for one company (PRD §7.10, §4.3).
 *
 * Never a function of the recruiter's role. `on_request` resolves to hidden because the approval
 * flow does not exist yet — defaulting the other way would leak contact details on the strength
 * of an unbuilt feature.
 */
async function resolveContact(profile, companyId, { interested }) {
  switch (profile.contactVisibility) {
    case CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS:
      return true;
    case CONTACT_VISIBILITY.AFTER_INTEREST:
      return interested ?? (await hasOpenInterest(profile._id, companyId));
    case CONTACT_VISIBILITY.ON_REQUEST:
    case CONTACT_VISIBILITY.HIDDEN:
    default:
      return false;
  }
}

/**
 * May this company see this candidate at all, and may it see their contact details?
 *
 * @param {object} profile    CandidateProfile document or lean object
 * @param {string} companyId
 * @param {{ interested?: boolean }} [hints]  Pass `interested` when the caller already knows —
 *                                            the inbox does, and it saves a query per row.
 * @returns {Promise<{ visible: boolean, reason: string|null, contactRevealed: boolean }>}
 */
export async function resolveCandidateAccess(profile, companyId, hints = {}) {
  const denied = (reason) => ({ visible: false, reason, contactRevealed: false });

  const allowed = async () => ({
    visible: true,
    reason: null,
    contactRevealed: await resolveContact(profile, companyId, hints),
  });

  // A block beats everything — checked first so no later branch can accidentally grant access.
  if (isBlocked(profile, companyId)) return denied(ACCESS_DENIED.BLOCKED);

  /*
   * ── Every state decided explicitly; anything else denied ────────────────────────────────
   *
   * This was a sequence of `if` statements that denied `draft` and `archived`, conditionally
   * denied `private` and `paused`, and then FELL THROUGH to `visible: true`. Under that shape the
   * default answer to "may this company see this candidate" was YES, and the four denials were
   * exceptions carved out of it.
   *
   * That is the wrong default for an authorization function. It means adding a member to
   * `CANDIDATE_VISIBILITY` — a one-line change in a shared constants file, plausibly made by
   * someone who has never read this one — silently grants every company full access to every
   * candidate in the new state, with contact resolution applied, and no test anywhere fails.
   * The audit that preceded this change found exactly that hazard while scoping a future `PUBLIC`
   * state; the fix is worth making whether or not that state is ever built.
   *
   * A `switch` with an explicit `default` inverts it: a state must be NAMED here to be visible.
   * The rules below are the same rules, rewritten — no state's meaning changed:
   *
   *   draft         never visible to a company (§4.3 — not published)
   *   archived      never visible to a company
   *   private       only with an active grant — §21.3's "share with one company without becoming
   *                 globally discoverable"
   *   paused        only with an active grant — "disappears from NEW searches but remains
   *                 available to previously authorized companies"
   *   discoverable  visible, subject to the contact rule
   *
   * `resolveContact` already had this shape, defaulting to `false` for an unrecognised contact
   * rule. This brings the visibility half of the same function in line with it.
   */
  switch (profile.status) {
    case CANDIDATE_VISIBILITY.DRAFT:
      return denied(ACCESS_DENIED.NOT_PUBLISHED);

    case CANDIDATE_VISIBILITY.ARCHIVED:
      return denied(ACCESS_DENIED.ARCHIVED);

    case CANDIDATE_VISIBILITY.PRIVATE:
      return (await hasActiveGrant(profile._id, companyId))
        ? allowed()
        : denied(ACCESS_DENIED.PRIVATE_NO_GRANT);

    case CANDIDATE_VISIBILITY.PAUSED:
      return (await hasActiveGrant(profile._id, companyId))
        ? allowed()
        : denied(ACCESS_DENIED.PAUSED_NO_GRANT);

    case CANDIDATE_VISIBILITY.DISCOVERABLE:
      return allowed();

    /*
     * `public` is a SUPERSET of `discoverable`, so a company sees it on the same terms — including
     * the contact rule, which is unchanged and still the candidate's to set.
     *
     * The narrowing that "public" implies is NOT here. This function answers "may this COMPANY see
     * this candidate", and the answer for a public candidate is plainly yes. What an ANONYMOUS
     * visitor may see is a different and much smaller question, answered by the `public` audience
     * in `portfolio.service.js`. Conflating the two would either hide a public candidate from
     * recruiters or hand the internet a recruiter's view.
     */
    case CANDIDATE_VISIBILITY.PUBLIC:
      return allowed();

    default:
      /*
       * Includes `undefined` on a malformed document, a value from a future release, and anything
       * a migration left behind. None of them is a licence to disclose a person's profile.
       */
      return denied(ACCESS_DENIED.UNKNOWN_VISIBILITY);
  }
}

/**
 * The MongoDB filter for candidates a company may find in search (REC-12).
 *
 * Enforced inside the query rather than by filtering results afterwards, because PRD §21.4
 * requires blocks and visibility to be applied "before results are displayed, not after
 * ranking" — a post-filter would let an excluded candidate influence paging and facet counts.
 *
 * `discoverable` and `public` appear; `private` and `paused` are reachable through a grant but are
 * explicitly excluded from search by §4.3, and a grant is not a search result. `draft` and
 * `archived` are never reachable at all.
 *
 * Sourced from `SEARCHABLE_VISIBILITY_STATES` rather than named here, so the set lives in one
 * place. This was a hardcoded `status: DISCOVERABLE`, which meant a candidate opting into a public
 * portfolio would have silently VANISHED from recruiter search — the opposite of what choosing
 * more visibility should do.
 */
export function searchableCandidateFilter(companyId) {
  return {
    status: { $in: [...SEARCHABLE_VISIBILITY_STATES] },
    blockedCompanyIds: { $ne: companyId },
  };
}
