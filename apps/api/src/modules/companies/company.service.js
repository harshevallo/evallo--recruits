/**
 * Company creation and team access.
 */

import mongoose from 'mongoose';
import { COMPANY_ROLES, COMPANY_STATUS, MEMBERSHIP_STATUS } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { logger } from '../../lib/logger.js';
import { supportsTransactions } from '../../lib/db.js';
import { Company } from './company.model.js';
import { CompanyMember } from '../memberships/companyMember.model.js';

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Appends -2, -3 … until the slug is free. */
async function uniqueSlug(base) {
  const root = base || 'company';
  let candidate = root;
  let suffix = 1;

  // Sequential by necessity: each probe depends on the previous result.
  while (await Company.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${root}-${suffix}`.slice(0, 60);
  }

  return candidate;
}

/**
 * Create a company and make the creator its owner.
 *
 * A user may create any number of companies — this does not change who they are, it adds a
 * membership. Their candidate profile, if any, is untouched.
 *
 * The two writes must not diverge: a company with no owner is unreachable, and an owner
 * membership pointing at nothing is orphaned. Uses a transaction where the deployment supports
 * one and compensates explicitly where it does not.
 */
export async function createCompany(userId, input) {
  const slug = await uniqueSlug(slugify(input.name));

  const companyData = {
    name: input.name,
    organizationType: input.organizationType,
    slug,
    location: input.location,
    tagline: input.tagline,
    description: input.tagline ? { short: input.tagline } : undefined,
    status: COMPANY_STATUS.DRAFT,
  };

  const ownerMembership = {
    userId,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  };

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const [company] = await Company.create([companyData], { session });
        await CompanyMember.create([{ ...ownerMembership, companyId: company._id }], { session });
        created = company;
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  /*
   * Standalone MongoDB — no transactions available. Create the company, then the membership,
   * and roll the company back if the membership fails. Not atomic, but it never leaves an
   * owner-less company behind, which is the outcome that actually matters.
   */
  const company = await Company.create(companyData);
  try {
    await CompanyMember.create({ ...ownerMembership, companyId: company._id });
    return company;
  } catch (error) {
    await Company.deleteOne({ _id: company._id }).catch((cleanupError) => {
      logger.error('Failed to roll back company after membership error', {
        companyId: String(company._id),
        message: cleanupError.message,
      });
    });
    throw error;
  }
}

/** Team list for a company. Requires an active membership and `member:manage`. */
export async function listCompanyMembers(companyId) {
  return CompanyMember.find({ companyId, status: MEMBERSHIP_STATUS.ACTIVE })
    .populate('userId', 'name email avatarUrl')
    .lean()
    .then((members) =>
      members.map((member) => ({
        id: String(member._id),
        role: member.role,
        status: member.status,
        showOnPublicTeam: member.showOnPublicTeam,
        user: member.userId
          ? {
              id: String(member.userId._id),
              name: member.userId.name ?? null,
              email: member.userId.email,
              avatarUrl: member.userId.avatarUrl ?? null,
            }
          : null,
        joinedAt: member.acceptedAt ?? member.createdAt,
      })),
    );
}

/** Guards the last-owner rule: a company must always have at least one active owner. */
export async function assertNotLastOwner(companyId, membershipId) {
  const owners = await CompanyMember.countDocuments({
    companyId,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    _id: { $ne: membershipId },
  });

  if (owners === 0) {
    throw ApiError.conflict('A company must always have at least one owner.');
  }
}
