/**
 * REC-01 — company search and join requests (PRD §7.2).
 *
 * The recruiter entry point the founder asked for: search for the company you work at, ask to join
 * it, and let its owner or admin approve. Creating a new company stays as the fallback for a company
 * that is genuinely not here yet.
 *
 * Approval reaches into the EXISTING membership system rather than reimplementing it — it creates an
 * ordinary ACTIVE `CompanyMember` with a role the approver chose, so every downstream permission
 * check, capability read and company-context resolution behaves exactly as it does for a member
 * created any other way (ADR-001).
 */

import {
  COMPANY_ROLES,
  COMPANY_ROLE_VALUES,
  MEMBERSHIP_STATUS,
  COMPANY_STATUS,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { Company, companyInitials } from '../companies/company.model.js';
import { User } from '../users/user.model.js';
import { CompanyMember } from './companyMember.model.js';
import { CompanyJoinRequest, JOIN_REQUEST_STATUS } from './joinRequest.model.js';

/** A requester may never be granted ownership by approval — transfer is its own guarded action. */
const GRANTABLE_ROLES = COMPANY_ROLE_VALUES.filter((role) => role !== COMPANY_ROLES.OWNER);

/**
 * Company search for the join selector.
 *
 * PUBLISHED companies only. A draft company page is not publicly accessible (PRD §9.3), and this
 * search is reachable by any authenticated user — so returning drafts would turn it into a way to
 * discover that an organisation has an unpublished presence here. Published companies are already
 * listed in the PUB-01 directory, so this exposes nothing new.
 *
 * The consequence is deliberate and visible in the UI: if a colleague has created the company but
 * not published it, it will not be found and the honest answer is an invitation from them.
 */
export async function searchCompanies(query, actorUserId, { limit = 10 } = {}) {
  const term = String(query ?? '').trim();
  if (term.length < 2) return { companies: [] };

  /*
   * Anchored, escaped prefix match on an indexed field. Anchoring is what lets the index serve it;
   * an unanchored /term/ would table-scan, which matters at the volumes the founder raised.
   */
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}`, 'i');

  const companies = await Company.find({
    status: COMPANY_STATUS.PUBLISHED,
    $or: [{ name: pattern }, { slug: pattern }],
  })
    .select('name slug logoUrl organizationType location status')
    .limit(Math.min(limit, 25))
    .lean();

  if (companies.length === 0) return { companies: [] };

  const companyIds = companies.map((company) => company._id);

  // What the caller's relationship already is, so the UI offers the right action per row.
  const [memberships, requests] = await Promise.all([
    CompanyMember.find({ companyId: { $in: companyIds }, userId: actorUserId })
      .select('companyId status')
      .lean(),
    CompanyJoinRequest.find({
      companyId: { $in: companyIds },
      userId: actorUserId,
      status: JOIN_REQUEST_STATUS.PENDING,
    })
      .select('companyId')
      .lean(),
  ]);

  const membershipByCompany = new Map(
    memberships.map((row) => [String(row.companyId), row.status]),
  );
  const requestedCompanies = new Set(requests.map((row) => String(row.companyId)));

  return {
    companies: companies.map((company) => {
      const membershipStatus = membershipByCompany.get(String(company._id)) ?? null;
      return {
        id: String(company._id),
        name: company.name,
        slug: company.slug,
        logoUrl: company.logoUrl ?? null,
        initials: companyInitials(company.name),
        organizationType: company.organizationType ?? null,
        location: company.location
          ? { country: company.location.country ?? null, city: company.location.city ?? null }
          : null,
        /** Drives the row's action: join, already a member, awaiting approval, or invited. */
        relationship:
          membershipStatus === MEMBERSHIP_STATUS.ACTIVE
            ? 'member'
            : membershipStatus === MEMBERSHIP_STATUS.INVITED
              ? 'invited'
              : requestedCompanies.has(String(company._id))
                ? 'requested'
                : 'none',
      };
    }),
  };
}

function presentRequest(request, user, company) {
  return {
    id: String(request._id),
    status: request.status,
    requestedRole: request.requestedRole,
    message: request.message ?? null,
    createdAt: request.createdAt,
    decidedAt: request.decidedAt ?? null,
    grantedRole: request.grantedRole ?? null,
    user: user ? { id: String(user._id), name: user.name ?? null, email: user.email } : null,
    company: company
      ? {
          id: String(company._id),
          name: company.name,
          slug: company.slug,
          logoUrl: company.logoUrl ?? null,
          initials: companyInitials(company.name),
        }
      : null,
  };
}

/**
 * Asks to join a company.
 *
 * Refuses when the caller is already a member, and short-circuits when they hold an outstanding
 * INVITATION — being asked to join is strictly better than asking, so the honest answer is "you
 * already have an invitation, accept it" rather than queueing a redundant request.
 */
export async function requestToJoin(companyId, user, { message = null, requestedRole } = {}) {
  const company = await Company.findById(companyId).select('name slug logoUrl status').lean();
  if (!company) throw ApiError.notFound('Company not found.');

  if (company.status !== COMPANY_STATUS.PUBLISHED) {
    // Consistent with search: an unpublished company is not discoverable, so it cannot be joined
    // this way either. An invitation from someone inside is the route in.
    throw ApiError.notFound('Company not found.');
  }

  const existing = await CompanyMember.findOne({ companyId, userId: user._id })
    .select('status')
    .lean();

  if (existing?.status === MEMBERSHIP_STATUS.ACTIVE) {
    throw ApiError.conflict('You already belong to this company.');
  }

  if (existing?.status === MEMBERSHIP_STATUS.INVITED) {
    throw ApiError.conflict('You already have an invitation to this company. Accept it instead.', {
      companyId: 'An invitation is waiting for you.',
    });
  }

  if (existing?.status === MEMBERSHIP_STATUS.SUSPENDED) {
    // Asking again must not be a way around a suspension.
    throw ApiError.forbidden('Your access to this company is suspended.');
  }

  const pending = await CompanyJoinRequest.findOne({
    companyId,
    userId: user._id,
    status: JOIN_REQUEST_STATUS.PENDING,
  });

  // Idempotent: asking twice is the same request, not an error and not a duplicate row.
  if (pending) return presentRequest(pending, user, company);

  const request = await CompanyJoinRequest.create({
    companyId,
    userId: user._id,
    message,
    requestedRole:
      requestedRole && GRANTABLE_ROLES.includes(requestedRole)
        ? requestedRole
        : COMPANY_ROLES.RECRUITER,
  });

  return presentRequest(request, user, company);
}

/** The approver's queue. Pending first; history is available with `includeResolved`. */
export async function listCompanyJoinRequests(companyId, { includeResolved = false } = {}) {
  const query = { companyId };
  if (!includeResolved) query.status = JOIN_REQUEST_STATUS.PENDING;

  const requests = await CompanyJoinRequest.find(query).sort({ createdAt: -1 }).lean();
  if (requests.length === 0) return { requests: [], pendingCount: 0 };

  const users = await User.find({ _id: { $in: requests.map((row) => row.userId) } })
    .select('name email')
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return {
    requests: requests.map((request) =>
      presentRequest(request, byId.get(String(request.userId)), null),
    ),
    pendingCount: requests.filter((row) => row.status === JOIN_REQUEST_STATUS.PENDING).length,
  };
}

/** The requester's own view, so a pending ask is visible rather than vanishing. */
export async function listMyJoinRequests(user) {
  const requests = await CompanyJoinRequest.find({
    userId: user._id,
    status: JOIN_REQUEST_STATUS.PENDING,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (requests.length === 0) return { requests: [] };

  const companies = await Company.find({ _id: { $in: requests.map((row) => row.companyId) } })
    .select('name slug logoUrl')
    .lean();
  const byId = new Map(companies.map((company) => [String(company._id), company]));

  return {
    requests: requests.map((request) =>
      presentRequest(request, user, byId.get(String(request.companyId))),
    ),
  };
}

/**
 * Approves a request — the only path in this module that grants anything.
 *
 * The membership it creates is indistinguishable from one created by an accepted invitation, which
 * is what keeps every permission check unaware that join requests exist. The role comes from the
 * APPROVER, never from the request, and owner is not grantable here.
 */
export async function approveJoinRequest(companyId, requestId, approver, role) {
  const request = await CompanyJoinRequest.findOne({ _id: requestId, companyId });
  if (!request) throw ApiError.notFound('That request does not exist.');

  if (request.status !== JOIN_REQUEST_STATUS.PENDING) {
    throw ApiError.conflict('That request has already been resolved.');
  }

  const grantedRole = GRANTABLE_ROLES.includes(role) ? role : request.requestedRole;
  if (!GRANTABLE_ROLES.includes(grantedRole)) {
    throw ApiError.validation('That role cannot be granted here.', {
      role: 'Choose a role other than owner.',
    });
  }

  /*
   * Upsert rather than create: the person may hold a `removed` or `declined` row from before, and
   * the unique `{ userId, companyId }` index would reject a second one. Reusing the row is also
   * what preserves their history at this company (PRD §21.6).
   */
  await CompanyMember.findOneAndUpdate(
    { companyId, userId: request.userId },
    {
      $set: {
        role: grantedRole,
        status: MEMBERSHIP_STATUS.ACTIVE,
        acceptedAt: new Date(),
        invitedBy: approver._id,
      },
      $unset: { removedAt: '' },
      $setOnInsert: { companyId, userId: request.userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  request.status = JOIN_REQUEST_STATUS.APPROVED;
  request.decidedByUserId = approver._id;
  request.decidedAt = new Date();
  request.grantedRole = grantedRole;
  await request.save();

  const [user, company] = await Promise.all([
    User.findById(request.userId).select('name email').lean(),
    Company.findById(companyId).select('name slug logoUrl').lean(),
  ]);

  return presentRequest(request, user, company);
}

/** Declines a request. Recorded, not deleted — and it does not block asking again later. */
export async function declineJoinRequest(companyId, requestId, approver) {
  const request = await CompanyJoinRequest.findOne({ _id: requestId, companyId });
  if (!request) throw ApiError.notFound('That request does not exist.');

  if (request.status !== JOIN_REQUEST_STATUS.PENDING) {
    throw ApiError.conflict('That request has already been resolved.');
  }

  request.status = JOIN_REQUEST_STATUS.DECLINED;
  request.decidedByUserId = approver._id;
  request.decidedAt = new Date();
  await request.save();

  const user = await User.findById(request.userId).select('name email').lean();
  return presentRequest(request, user, null);
}

/** The requester changing their mind. Scoped to them, so it cannot cancel anyone else's. */
export async function withdrawJoinRequest(user, requestId) {
  const request = await CompanyJoinRequest.findOne({
    _id: requestId,
    userId: user._id,
    status: JOIN_REQUEST_STATUS.PENDING,
  });

  if (!request) throw ApiError.notFound('That request does not exist.');

  request.status = JOIN_REQUEST_STATUS.WITHDRAWN;
  request.decidedAt = new Date();
  await request.save();

  return { withdrawn: true };
}
