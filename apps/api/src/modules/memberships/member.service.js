/**
 * Team management — REC-08 (roles and removal) and REC-09 (ownership transfer).
 *
 * Sits beside invitation.service.js because both act on the same `CompanyMember` rows: an
 * invitation, an active membership and a removed one are three states of one document. Keeping
 * them in one module is what stops "who belongs to this company" from having two answers.
 *
 * Every function here changes somebody's authority, so each one re-reads the target membership
 * from the database. Nothing trusts a role, a membership id, or a company that arrived in the
 * request body (ADR-006).
 */

import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  PERMISSIONS,
  can,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CompanyMember } from './companyMember.model.js';
import { User } from '../users/user.model.js';

/**
 * Loads an ACTIVE membership belonging to this company.
 *
 * Scoped by `companyId`, so a membership at another company is invisible rather than forbidden —
 * a 403 here would confirm that a membership id exists somewhere, which is the same disclosure
 * the invitation routes avoid.
 */
async function findActiveMember(companyId, memberId) {
  const member = await CompanyMember.findOne({
    _id: memberId,
    companyId,
    status: MEMBERSHIP_STATUS.ACTIVE,
  });

  if (!member) throw ApiError.notFound('Member not found.');
  return member;
}

/** Active owners of a company, excluding one membership. Used by every last-owner guard. */
function countOtherOwners(companyId, exceptMemberId) {
  return CompanyMember.countDocuments({
    companyId,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    _id: { $ne: exceptMemberId },
  });
}

/**
 * Guards every route into an owner-less company (PRD §21.2: "removing the last owner fails").
 *
 * Demotion and removal are the same danger wearing two hats, so both go through here rather than
 * each carrying its own copy of the count.
 */
async function assertNotLastOwner(member, action) {
  if (member.role !== COMPANY_ROLES.OWNER) return;

  if ((await countOtherOwners(member.companyId, member._id)) === 0) {
    throw ApiError.conflict(
      `This is the company's only owner, so they cannot be ${action}. Make someone else an owner first, or transfer ownership.`,
    );
  }
}

/**
 * PRIVILEGE ESCALATION GUARD, shared by role changes and ownership transfer.
 *
 * `member:manage` belongs to admins as well as owners, but `company:transfer` is owner-only. An
 * admin who could promote someone to owner — or demote the owner above them — would have taken
 * ownership by another name, so anything touching an owner requires the transfer permission.
 */
function assertMayAlterOwnership(actorMembership, message) {
  if (!can(actorMembership, PERMISSIONS.COMPANY_TRANSFER)) {
    throw ApiError.forbidden(message);
  }
}

/** The shape the team screen renders. Mirrors listCompanyMembers so both lists agree. */
function toMemberView(member, user) {
  return {
    id: String(member._id),
    role: member.role,
    status: member.status,
    showOnPublicTeam: member.showOnPublicTeam ?? false,
    joinedAt: member.acceptedAt ?? member.createdAt ?? null,
    user: user
      ? {
          id: String(user._id),
          name: user.name ?? null,
          email: user.email,
          avatarUrl: user.avatarUrl ?? null,
        }
      : null,
  };
}

async function hydrate(member) {
  const user = member.userId
    ? await User.findById(member.userId).select('name email avatarUrl').lean()
    : null;

  return toMemberView(member.toObject ? member.toObject() : member, user);
}

/* ── REC-08 — change a member's role ──────────────────────────────────────────────────────── */

/**
 * REC-08 — change one member's role within this company.
 *
 * @param {object} args
 * @param {object} args.company           Resolved by resolveCompanyContext
 * @param {object} args.actorMembership   The CALLER's membership — decides what they may grant
 * @param {string} args.memberId
 * @param {string} args.role              Already constrained to a known role by validation
 */
export async function changeMemberRole({ company, actorMembership, memberId, role }) {
  const member = await findActiveMember(company._id, memberId);

  /*
   * Changing your own role is refused outright. The dangerous case is an owner demoting
   * themselves while they are the only owner, which the last-owner guard already catches — but
   * the harmless-looking cases are still a footgun, and there is no legitimate reason to need it.
   */
  if (String(member._id) === String(actorMembership._id)) {
    throw ApiError.conflict('You cannot change your own role. Ask another owner or admin.');
  }

  if (member.role === role) {
    // Idempotent: the caller already has what they asked for, so this is not an error.
    return { member: await hydrate(member), changed: false };
  }

  // Promoting TO owner, or changing the role OF an owner, both require `company:transfer`.
  if (role === COMPANY_ROLES.OWNER) {
    assertMayAlterOwnership(actorMembership, 'Only an owner can make someone else an owner.');
  }

  if (member.role === COMPANY_ROLES.OWNER) {
    assertMayAlterOwnership(actorMembership, "Only an owner can change another owner's role.");
    await assertNotLastOwner(member, 'demoted');
  }

  member.role = role;
  await member.save();

  return { member: await hydrate(member), changed: true };
}

/* ── REC-08 — remove a member ─────────────────────────────────────────────────────────────── */

/**
 * REC-08 — remove someone from the company.
 *
 * Marked `removed`, never deleted: PRD §21.6 keeps the audit trail, and the partial unique index
 * on `{userId, companyId}` means the retained row also stops the same person being added twice.
 * Revocation is immediate because every permission check reads this row per request (ADR-006).
 */
export async function removeMember({ company, actorMembership, memberId }) {
  const member = await findActiveMember(company._id, memberId);

  /*
   * Self-removal is refused. An owner who removed themselves while holding the only owner seat
   * would lock the company out permanently, and even for a non-owner this is better served by an
   * explicit "leave company" action that can say what is about to be lost.
   */
  if (String(member._id) === String(actorMembership._id)) {
    throw ApiError.conflict('You cannot remove yourself from a company you manage.');
  }

  if (member.role === COMPANY_ROLES.OWNER) {
    assertMayAlterOwnership(actorMembership, 'Only an owner can remove another owner.');
    await assertNotLastOwner(member, 'removed');
  }

  member.status = MEMBERSHIP_STATUS.REMOVED;
  member.removedAt = new Date();
  await member.save();

  return { removed: true, id: String(member._id) };
}

/* ── REC-09 — ownership transfer ──────────────────────────────────────────────────────────── */

/**
 * REC-09 — hand ownership to another active member.
 *
 * PRD §4.2 requires exactly one owner to exist at all times, so this is deliberately NOT
 * "promote them, then demote me": that sequence passes through a two-owner state, and if the
 * second step failed it would stay there. Instead the promotion and the demotion are written
 * together and the result is asserted before returning.
 *
 * The outgoing owner becomes an ADMIN rather than losing access — the PRD describes a transfer,
 * not a resignation, and someone who mis-clicks should not lock themselves out of their own
 * company.
 */
export async function transferOwnership({ company, actorMembership, memberId }) {
  assertMayAlterOwnership(actorMembership, 'Only an owner can transfer ownership.');

  const successor = await findActiveMember(company._id, memberId);

  if (String(successor._id) === String(actorMembership._id)) {
    throw ApiError.conflict('You already own this company.');
  }

  if (successor.role === COMPANY_ROLES.OWNER) {
    throw ApiError.conflict('That member is already an owner of this company.');
  }

  const outgoing = await CompanyMember.findById(actorMembership._id);
  if (!outgoing || outgoing.status !== MEMBERSHIP_STATUS.ACTIVE) {
    throw ApiError.conflict('Your membership is no longer active.');
  }

  /*
   * No transaction is available on a standalone MongoDB (ADR/known issue I-03), so the order is
   * chosen so that a crash between the two writes leaves the SAFE state: promote first, and a
   * failure leaves two owners — recoverable by transferring again. Demoting first would leave a
   * company with no owner at all, which nothing in the product can repair.
   */
  successor.role = COMPANY_ROLES.OWNER;
  await successor.save();

  outgoing.role = COMPANY_ROLES.ADMIN;
  await outgoing.save();

  /*
   * PRD §21.2 requires exactly one owner. Asserting it here turns a silent data problem into a
   * loud one at the moment it is created, rather than at some later read.
   */
  const owners = await CompanyMember.countDocuments({
    companyId: company._id,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
  });

  if (owners !== 1) {
    throw ApiError.internal(`Ownership transfer left ${owners} owners; expected exactly one.`);
  }

  return {
    transferred: true,
    owner: await hydrate(successor),
    you: await hydrate(outgoing),
  };
}
