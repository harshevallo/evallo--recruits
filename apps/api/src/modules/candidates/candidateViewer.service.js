/**
 * REC-13 candidate viewer — the recruiter's evaluation screen (PRD §7.10, §8.8, §21.4).
 *
 * Renders through `toRecruiterView()`, the SAME document method CAN-03 previews. PRD §8.8 is
 * explicit that the candidate's preview must show "the exact same rendering and privacy state" a
 * recruiter gets, and the only way to guarantee that is for both to call one function. A second
 * renderer here would not merely duplicate code — it would let the candidate be shown a profile
 * that is not the one recruiters actually see, which is a privacy defect wearing a UI bug's
 * clothes.
 *
 * Access is resolved by `candidateAccess.service`, the same service REC-11 and REC-12 use. This
 * module contains no visibility rule of its own.
 */

import { INTEREST_STATUS, ACTIVE_INTEREST_STATES } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { AccessGrant } from '../interests/accessGrant.model.js';
import { ExpressionOfInterest } from '../interests/expressionOfInterest.model.js';
import { User } from '../users/user.model.js';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
} from '../audit/auditEvent.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { CandidateProfile } from './candidateProfile.model.js';
import { resolveCandidateAccess } from './candidateAccess.service.js';

/**
 * How this company came to be looking at this candidate — PRD §21.4 requires the SOURCE of every
 * profile access to be logged, not merely the fact of it.
 */
export const VIEW_SOURCES = Object.freeze(['search', 'interest', 'direct']);

/**
 * This company's interest history with this candidate.
 *
 * Only interests belonging to the viewing company: a candidate's approaches to OTHER companies
 * are none of this one's business, and scoping by `companyId` is what keeps it that way.
 */
async function interestHistory(candidateId, companyId) {
  const interests = await ExpressionOfInterest.find({ candidateId, companyId })
    .select('status message hiringIntentId consent createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  return interests.map((interest) => ({
    id: String(interest._id),
    status: interest.status,
    /** Frozen once withdrawn — §21.5 stops new outreach, and this screen must show why. */
    isOpen: ACTIVE_INTEREST_STATES.includes(interest.status),
    isWithdrawn: interest.status === INTEREST_STATUS.WITHDRAWN,
    message: interest.message ?? null,
    submittedAt: interest.createdAt,
    consentedAt: interest.consent?.grantedAt ?? null,
  }));
}

/**
 * REC-13 — one candidate, as this company is permitted to see them.
 *
 * Returns `404` rather than `403` when access is refused. PRD §16.1 and the API conventions both
 * require it: a `403` would confirm the profile exists and that this company merely lacks
 * permission, which is itself a disclosure about a person who has chosen not to be seen.
 *
 * @param {object} args
 * @param {object} args.company  Resolved by resolveCompanyContext
 * @param {object} args.actor    The viewing user
 * @param {string} args.candidateId
 * @param {string} [args.source] Where the recruiter arrived from, for the audit record
 * @param {object} [args.context] { ip, userAgent }
 */
export async function getCandidateForCompany({
  company,
  actor,
  candidateId,
  source = 'direct',
  context = {},
}) {
  const profile = await CandidateProfile.findById(candidateId);

  // Absent and forbidden are the same answer, deliberately indistinguishable.
  if (!profile) throw ApiError.notFound('Candidate not found.');

  const access = await resolveCandidateAccess(profile, company._id);
  if (!access.visible) throw ApiError.notFound('Candidate not found.');

  const user = await User.findById(profile.userId)
    .select('name email profilePicture location languages')
    .lean();

  /*
   * The one recruiter representation, shared with CAN-03. `contactRevealed` comes from the
   * candidate's own rule via the access service — never from the viewer's role, so an owner sees
   * exactly what a viewer sees.
   */
  const recruiterView = profile.toRecruiterView({
    name: user?.name ?? null,
    photoUrl: user?.profilePicture ?? null,
    location: user?.location ?? null,
    languages: user?.languages ?? [],
    email: user?.email,
    contactRevealed: access.contactRevealed,
  });

  const [interests, grant] = await Promise.all([
    interestHistory(profile._id, company._id),
    AccessGrant.findOne({
      candidateId: profile._id,
      companyId: company._id,
      withdrawnAt: { $in: [null, undefined] },
    })
      .select('grantedAt scope')
      .lean(),
  ]);

  /*
   * PRD §21.4 — logged with company, user, timestamp and source. A contact reveal is recorded
   * separately because §16.1 lists it as its own auditable event: seeing a profile and seeing
   * someone's email address are different disclosures.
   */
  const audit = {
    actorUserId: actor._id,
    actorCompanyId: company._id,
    targetType: AUDIT_TARGET_TYPES.CANDIDATE_PROFILE,
    targetId: profile._id,
    ...context,
  };

  recordAuditEvent({
    ...audit,
    action: AUDIT_ACTIONS.CANDIDATE_PROFILE_VIEWED,
    metadata: { source, visibility: profile.status },
  });

  if (access.contactRevealed) {
    recordAuditEvent({
      ...audit,
      action: AUDIT_ACTIONS.CANDIDATE_CONTACT_REVEALED,
      metadata: { source, rule: profile.contactVisibility },
    });
  }

  return {
    id: String(profile._id),
    profile: recruiterView,

    /*
     * Why this company may see them, in the candidate's terms rather than the system's. A
     * recruiter who knows access came from an interest — and can be withdrawn — behaves
     * differently from one who assumes the profile is simply public.
     */
    access: {
      visibility: profile.status,
      contactRevealed: access.contactRevealed,
      contactRule: profile.contactVisibility,
      viaGrant: Boolean(grant),
      grantedAt: grant?.grantedAt ?? null,
    },

    interests,
    lastActiveAt: profile.lastActiveAt ?? null,
  };
}
