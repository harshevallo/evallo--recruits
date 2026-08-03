/**
 * Derives what a user can do — from their data, never from a stored role.
 *
 * "Candidate" means a CandidateProfile exists. "Recruiter" means an active CompanyMember exists.
 * Both can be true at once, and the company list carries a separate role per company.
 *
 * Nothing here reads a role field on User, and nothing here should ever be cached onto one.
 */

import { MEMBERSHIP_STATUS, permissionsFor } from '@evallo/shared';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { CompanyMember } from '../memberships/companyMember.model.js';
import { Company, companyInitials } from '../companies/company.model.js';

/**
 * @param {import('mongoose').Types.ObjectId} userId
 * @returns {Promise<{
 *   hasCandidateProfile: boolean,
 *   candidateProfile: object|null,
 *   companies: object[],
 *   isRecruiterAnywhere: boolean
 * }>}
 */
export async function getUserCapabilities(userId) {
  const [candidateProfile, memberships] = await Promise.all([
    CandidateProfile.findOne({ userId }),
    CompanyMember.find({ userId, status: MEMBERSHIP_STATUS.ACTIVE }).lean(),
  ]);

  const companyIds = memberships.map((m) => m.companyId);

  const companies = companyIds.length
    ? await Company.find({ _id: { $in: companyIds } })
        .select('name slug logoUrl status isCurrentlyHiring')
        .lean()
    : [];

  const companyById = new Map(companies.map((c) => [String(c._id), c]));

  const memberContexts = memberships
    .map((membership) => {
      const company = companyById.get(String(membership.companyId));
      if (!company) return null;

      return {
        companyId: String(company._id),
        name: company.name,
        slug: company.slug,
        logoUrl: company.logoUrl ?? null,
        // Computed, not read off the document: this is a lean query, so virtuals do not run.
        initials: companyInitials(company.name),
        status: company.status,
        /** Role IN THIS COMPANY. The same user may hold a different role elsewhere. */
        role: membership.role,
        /** Resolved once here so the client never re-implements the matrix. */
        permissions: permissionsFor(membership),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    hasCandidateProfile: Boolean(candidateProfile),
    candidateProfile: candidateProfile ? candidateProfile.toOwnerView() : null,
    companies: memberContexts,
    isRecruiterAnywhere: memberContexts.length > 0,
  };
}
