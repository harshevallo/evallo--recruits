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

  // A block beats everything — checked first so no later branch can accidentally grant access.
  if (isBlocked(profile, companyId)) return denied(ACCESS_DENIED.BLOCKED);

  if (profile.status === CANDIDATE_VISIBILITY.DRAFT) return denied(ACCESS_DENIED.NOT_PUBLISHED);
  if (profile.status === CANDIDATE_VISIBILITY.ARCHIVED) return denied(ACCESS_DENIED.ARCHIVED);

  /*
   * `private` and `paused` are reachable only by a company that already holds access. For
   * `private` that is the whole point (§21.3: share with one company without becoming globally
   * discoverable); for `paused` it is what "disappears from NEW searches but remains available to
   * previously authorized companies" means.
   */
  if (profile.status === CANDIDATE_VISIBILITY.PRIVATE) {
    if (!(await hasActiveGrant(profile._id, companyId))) return denied(ACCESS_DENIED.PRIVATE_NO_GRANT);
  }

  if (profile.status === CANDIDATE_VISIBILITY.PAUSED) {
    if (!(await hasActiveGrant(profile._id, companyId))) return denied(ACCESS_DENIED.PAUSED_NO_GRANT);
  }

  return {
    visible: true,
    reason: null,
    contactRevealed: await resolveContact(profile, companyId, hints),
  };
}

/**
 * The MongoDB filter for candidates a company may find in search (REC-12).
 *
 * Enforced inside the query rather than by filtering results afterwards, because PRD §21.4
 * requires blocks and visibility to be applied "before results are displayed, not after
 * ranking" — a post-filter would let an excluded candidate influence paging and facet counts.
 *
 * Only `discoverable` appears: `private` and `paused` are reachable through a grant but are
 * explicitly excluded from search by §4.3, and a grant is not a search result.
 */
export function searchableCandidateFilter(companyId) {
  return {
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    blockedCompanyIds: { $ne: companyId },
  };
}
