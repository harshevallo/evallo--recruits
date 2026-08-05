/**
 * Company invitations — REC-01 (join) and REC-07 (invite team).
 *
 * The whole lifecycle lives here because both ends act on ONE record: an invitation IS a
 * `CompanyMember` row with status `invited`, and accepting it flips that same row to `active`.
 * Splitting "send" from "accept" across two modules is what would let the two ends drift.
 *
 * There is no invitations collection. A separate table would have to be reconciled with
 * memberships on every read, and would allow the state this design makes impossible: an
 * outstanding invitation for somebody who already belongs to the company.
 */

import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  COMPANY_ROLE_VALUES,
  PERMISSIONS,
  ERROR_CODES,
  can,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendCompanyInvitationEmail } from '../../lib/email/index.js';
import { Company, companyInitials } from '../companies/company.model.js';
import { User } from '../users/user.model.js';
import { CompanyMember } from './companyMember.model.js';

/** A resend is refused inside this window, so the button cannot be used to mail-bomb someone. */
export const RESEND_COOLDOWN_MS = 60_000;

/**
 * Roles that may be handed out through an invitation.
 *
 * `owner` is absent by default and gated separately below — see inviteMember.
 */
const INVITABLE_ROLES = COMPANY_ROLE_VALUES.filter((role) => role !== COMPANY_ROLES.OWNER);

/* ── REC-07 — invite, list, resend, cancel ────────────────────────────────────────────────── */

/**
 * Everything about an invitation the team screen shows: status, who sent it, and when.
 * `user` is null while the invitee has no account — the address is all we know about them.
 */
function toInvitationView(invite, inviter, user) {
  return {
    id: String(invite._id),
    email: invite.invitedEmail ?? user?.email ?? null,
    role: invite.role,
    status: invite.status,
    invitedAt: invite.invitedAt ?? invite.createdAt ?? null,
    lastSentAt: invite.invitationLastSentAt ?? invite.invitedAt ?? null,
    /** True once the invitee has an account, so the UI can say "will join on accepting". */
    hasAccount: Boolean(invite.userId),
    invitedBy: inviter
      ? { id: String(inviter._id), name: inviter.name ?? null, email: inviter.email }
      : null,
    user: user ? { id: String(user._id), name: user.name ?? null, email: user.email } : null,
  };
}

/** Hydrates inviters and invitees for a set of invitations in two queries, not 2N. */
async function withPeople(invites) {
  if (invites.length === 0) return [];

  const userIds = [
    ...new Set(
      invites
        .flatMap((invite) => [invite.invitedBy, invite.userId])
        .filter(Boolean)
        .map(String),
    ),
  ];

  const users = await User.find({ _id: { $in: userIds } })
    .select('name email')
    .lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));

  return invites.map((invite) =>
    toInvitationView(
      invite,
      invite.invitedBy ? byId.get(String(invite.invitedBy)) : null,
      invite.userId ? byId.get(String(invite.userId)) : null,
    ),
  );
}

/** Outstanding invitations for a company, newest first (REC-07). */
export async function listCompanyInvitations(companyId) {
  const invites = await CompanyMember.find({
    companyId,
    status: MEMBERSHIP_STATUS.INVITED,
  })
    .sort({ createdAt: -1 })
    .lean();

  return withPeople(invites);
}

/**
 * Queues the invitation email WITHOUT blocking the response.
 *
 * Awaiting delivery made this endpoint take as long as the SMTP conversation — measured at ~37
 * seconds against SendGrid from here. The browser gave up first, so the invitation was written
 * and the sender was left watching "Sending…" forever with no way to learn it had worked.
 *
 * The record is the source of truth and it is already committed; the email is a notification
 * about it. If delivery fails, the invitation still stands and the inviter can resend — which is
 * exactly the recovery EmailService's never-throw contract was designed around.
 */
function deliverInvitation({ to, name, company, inviter }) {
  sendCompanyInvitationEmail({
    to,
    name,
    companyName: company.name,
    inviterName: inviter?.name ?? null,
    // REC-01's screen is where an invitee reviews and accepts; it lists every pending invitation.
    url: `${env.APP_URL}/companies/start`,
  })
    .then((result) => {
      if (!result.delivered) {
        logger.warn('Invitation email not delivered — the inviter can resend', {
          companyId: String(company._id),
          error: result.error,
        });
      }
    })
    /*
     * EmailService already swallows send failures, so this only catches a programming error in
     * the call itself. Without it that would become an unhandled rejection and take the process
     * down on Node 22.
     */
    .catch((error) => {
      logger.error('Invitation email threw unexpectedly', {
        companyId: String(company._id),
        message: String(error.message ?? '').slice(0, 200),
      });
    });
}

/**
 * REC-07 — invite someone to a company by email address.
 *
 * The invitee need not have an account. When they do, the invitation is bound to their user id
 * immediately; when they do not, it is bound to the address and claimed on verification.
 *
 * @param {object}  args
 * @param {object}  args.company     Resolved by resolveCompanyContext
 * @param {object}  args.membership  The INVITER's membership — decides which roles they may grant
 * @param {object}  args.inviter     The inviting user document
 * @param {string}  args.email       Already normalised by the validation schema
 * @param {string}  args.role
 */
export async function inviteMember({ company, membership, inviter, email, role }) {
  if (!INVITABLE_ROLES.includes(role) && role !== COMPANY_ROLES.OWNER) {
    throw ApiError.validation('Choose a role for this teammate.', { role: 'Unknown role' });
  }

  /*
   * PRIVILEGE ESCALATION GUARD. `member:manage` is held by admins as well as owners, but
   * `company:transfer` is owner-only. Without this check an admin could not transfer ownership
   * directly, yet could mint a second owner by invitation and reach the same place.
   */
  if (role === COMPANY_ROLES.OWNER && !can(membership, PERMISSIONS.COMPANY_TRANSFER)) {
    throw ApiError.forbidden('Only an owner can invite another owner.');
  }

  if (email === inviter.email) {
    throw ApiError.conflict('You already belong to this company.', {
      email: 'This is your own address',
    });
  }

  // An invitation may be addressed to someone who has not signed up — this is allowed to be null.
  const invitee = await User.findOne({ email }).select('_id name email').lean();

  /*
   * Look the existing record up by user id OR address. Both matter: a member who joined long ago
   * is found by id even though their invitation predates `invitedEmail`, and an outstanding
   * invitation to a stranger is only findable by address.
   */
  const existing = await CompanyMember.findOne({
    companyId: company._id,
    $or: [
      ...(invitee ? [{ userId: invitee._id }] : []),
      { invitedEmail: email, status: MEMBERSHIP_STATUS.INVITED },
    ],
  });

  if (existing) {
    if (existing.status === MEMBERSHIP_STATUS.ACTIVE) {
      throw ApiError.conflict('That person is already a member of this company.', {
        email: 'Already a member',
      });
    }

    if (existing.status === MEMBERSHIP_STATUS.INVITED) {
      throw ApiError.conflict('That person already has a pending invitation.', {
        email: 'Invitation already sent',
      });
    }

    /*
     * `suspended` or `removed`: re-invite by reviving the SAME row rather than inserting a
     * second one. One person keeps one membership record per company, so the audit trail —
     * including the earlier removal — stays on a single document.
     */
    existing.role = role;
    existing.status = MEMBERSHIP_STATUS.INVITED;
    existing.invitedEmail = email;
    existing.invitedBy = inviter._id;
    existing.invitedAt = new Date();
    existing.invitationLastSentAt = new Date();
    existing.removedAt = undefined;
    existing.acceptedAt = undefined;
    await existing.save();

    deliverInvitation({ to: email, name: invitee?.name, company, inviter });
    return (await withPeople([existing.toObject()]))[0];
  }

  const now = new Date();
  const invite = await CompanyMember.create({
    companyId: company._id,
    // Bound to the account when there is one; otherwise the address carries the invitation.
    userId: invitee?._id,
    invitedEmail: email,
    role,
    status: MEMBERSHIP_STATUS.INVITED,
    invitedBy: inviter._id,
    invitedAt: now,
    invitationLastSentAt: now,
  });

  deliverInvitation({ to: email, name: invitee?.name, company, inviter });

  return (await withPeople([invite.toObject()]))[0];
}

/** Finds an outstanding invitation belonging to THIS company, or 404s. */
async function findCompanyInvitation(companyId, invitationId) {
  const invite = await CompanyMember.findOne({
    _id: invitationId,
    companyId,
    status: MEMBERSHIP_STATUS.INVITED,
  });

  // Scoped by companyId, so an invitation at another company is invisible rather than forbidden.
  if (!invite) throw ApiError.notFound('Invitation not found.');
  return invite;
}

/**
 * REC-07 — send the invitation email again.
 *
 * Rate-limited per invitation: the record already exists, so an uncapped resend button is a
 * mail-bombing tool aimed at whoever was invited.
 */
export async function resendInvitation({ company, inviter, invitationId }) {
  const invite = await findCompanyInvitation(company._id, invitationId);

  const lastSent = invite.invitationLastSentAt ?? invite.invitedAt;
  const waitMs = lastSent ? RESEND_COOLDOWN_MS - (Date.now() - lastSent.getTime()) : 0;

  if (waitMs > 0) {
    throw new ApiError(
      ERROR_CODES.RATE_LIMITED,
      `Please wait ${Math.ceil(waitMs / 1000)}s before resending this invitation.`,
    );
  }

  const email = invite.invitedEmail;
  if (!email) throw ApiError.conflict('This invitation has no email address to resend to.');

  invite.invitationLastSentAt = new Date();
  await invite.save();

  const invitee = invite.userId
    ? await User.findById(invite.userId).select('name').lean()
    : null;

  deliverInvitation({ to: email, name: invitee?.name, company, inviter });

  // `resent` means queued, not delivered — the caller is not held open for the SMTP round trip.
  return { resent: true, lastSentAt: invite.invitationLastSentAt };
}

/**
 * REC-07 — cancel an invitation.
 *
 * Marked `removed`, not deleted: PRD §21.6 keeps the audit trail. The partial unique index is
 * filtered on `invited`, so the retained row does not block a later invitation to the same
 * address.
 */
export async function cancelInvitation({ company, invitationId }) {
  const invite = await findCompanyInvitation(company._id, invitationId);

  invite.status = MEMBERSHIP_STATUS.REMOVED;
  invite.removedAt = new Date();
  await invite.save();

  return { cancelled: true, id: String(invite._id) };
}

/* ── REC-01 — the invitee's side ──────────────────────────────────────────────────────────── */

/**
 * Matches invitations addressed to this user, by account or by verified address.
 *
 * The email arm is what makes REC-07's "invite someone who hasn't signed up yet" work: the
 * invitation is bound to an address, and the person who proves they own that address claims it.
 * `emailVerified` is the whole security of that arm — without it, registering somebody else's
 * address would hand over their invitations (PRD §6.4).
 */
function invitationsAddressedTo(user) {
  const arms = [{ userId: user._id }];
  if (user.emailVerified && user.email) arms.push({ invitedEmail: user.email, userId: null });
  return { status: MEMBERSHIP_STATUS.INVITED, $or: arms };
}

/** REC-01 — invitations a user has been sent but not yet accepted. */
export async function listPendingInvitations(user) {
  const invites = await CompanyMember.find(invitationsAddressedTo(user)).lean();

  if (invites.length === 0) return [];

  const [companies, inviters] = await Promise.all([
    Company.find({ _id: { $in: invites.map((invite) => invite.companyId) } })
      .select('name slug logoUrl status')
      .lean(),
    User.find({ _id: { $in: invites.map((invite) => invite.invitedBy).filter(Boolean) } })
      .select('name email')
      .lean(),
  ]);

  const companyById = new Map(companies.map((company) => [String(company._id), company]));
  const userById = new Map(inviters.map((inviter) => [String(inviter._id), inviter]));

  return invites
    .map((invite) => {
      const company = companyById.get(String(invite.companyId));
      if (!company) return null;

      const inviter = invite.invitedBy ? userById.get(String(invite.invitedBy)) : null;

      return {
        id: String(invite._id),
        role: invite.role,
        invitedAt: invite.invitedAt ?? invite.createdAt ?? null,
        invitedBy: inviter ? { name: inviter.name ?? null, email: inviter.email } : null,
        company: {
          id: String(company._id),
          name: company.name,
          slug: company.slug,
          logoUrl: company.logoUrl ?? null,
          initials: companyInitials(company.name),
        },
      };
    })
    .filter(Boolean);
}

/**
 * REC-01 — accept an invitation.
 *
 * Scoped to the caller, so accepting is only ever possible for an invitation addressed to them.
 * Acceptance is what grants the recruiter capability: ADR-001 derives it from an ACTIVE
 * membership, so this single status change is the whole permission model.
 */
export async function acceptInvitation(user, invitationId) {
  const invite = await CompanyMember.findOne({
    _id: invitationId,
    ...invitationsAddressedTo(user),
  });

  if (!invite) throw ApiError.notFound('Invitation not found.');

  /*
   * Claim an address-bound invitation for this account. From here the record is indistinguishable
   * from a membership created any other way, which is what keeps the rest of the system — every
   * permission check, every capability read — unaware that invitations exist.
   */
  invite.userId = user._id;
  invite.status = MEMBERSHIP_STATUS.ACTIVE;
  invite.acceptedAt = new Date();
  await invite.save();

  const company = await Company.findById(invite.companyId).select('name slug').lean();

  return {
    accepted: true,
    role: invite.role,
    company: company ? { name: company.name, slug: company.slug } : null,
  };
}

/** REC-01 — decline an invitation. Recorded rather than deleted, so the audit trail survives. */
export async function declineInvitation(user, invitationId) {
  const invite = await CompanyMember.findOne({
    _id: invitationId,
    ...invitationsAddressedTo(user),
  });

  if (!invite) throw ApiError.notFound('Invitation not found.');

  invite.status = MEMBERSHIP_STATUS.REMOVED;
  invite.removedAt = new Date();
  await invite.save();

  return { declined: true };
}
