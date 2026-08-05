/**
 * Invitation endpoints — REC-01 (the invitee's side) and REC-07 (the company's side).
 *
 * The two surfaces are authorised completely differently, which is why they are two route files
 * even though they share a service:
 *   /api/me/invitations/*                     the caller is NOT a member — scoped by user id
 *   /api/companies/:companyId/invitations/*   the caller IS a member — scoped by member:manage
 */

import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import * as invitations from './invitation.service.js';

/**
 * The personal surface runs `authenticate` only, which attaches an id — not a user. Matching an
 * address-bound invitation needs the account's email AND its verified flag, so the record is
 * loaded here rather than trusting anything the client sent.
 */
async function currentUser(req) {
  if (req.user) return req.user; // company routes already resolved it
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/* ── REC-07 — the company's side ──────────────────────────────────────────────────────────── */

/** GET /api/companies/:companyId/invitations */
export async function listInvitations(req, res) {
  return sendSuccess(res, {
    invitations: await invitations.listCompanyInvitations(req.company._id),
    // Echoed so the UI can hide controls the caller's role does not allow, without guessing.
    yourRole: req.membership.role,
  });
}

/** POST /api/companies/:companyId/invitations */
export async function createInvitation(req, res) {
  const invitation = await invitations.inviteMember({
    company: req.company,
    membership: req.membership,
    inviter: req.user,
    email: req.body.email,
    role: req.body.role,
  });

  return sendCreated(res, { invitation });
}

/** POST /api/companies/:companyId/invitations/:invitationId/resend */
export async function resendInvitation(req, res) {
  return sendSuccess(
    res,
    await invitations.resendInvitation({
      company: req.company,
      inviter: req.user,
      invitationId: req.params.invitationId,
    }),
  );
}

/** POST /api/companies/:companyId/invitations/:invitationId/cancel */
export async function cancelInvitation(req, res) {
  return sendSuccess(
    res,
    await invitations.cancelInvitation({
      company: req.company,
      invitationId: req.params.invitationId,
    }),
  );
}

/* ── REC-01 — the invitee's side ──────────────────────────────────────────────────────────── */

/** GET /api/me/invitations */
export async function getMyInvitations(req, res) {
  return sendSuccess(res, await invitations.listPendingInvitations(await currentUser(req)));
}

/** POST /api/me/invitations/:invitationId/accept */
export async function acceptMyInvitation(req, res) {
  return sendSuccess(
    res,
    await invitations.acceptInvitation(await currentUser(req), req.params.invitationId),
  );
}

/** POST /api/me/invitations/:invitationId/decline */
export async function declineMyInvitation(req, res) {
  return sendSuccess(
    res,
    await invitations.declineInvitation(await currentUser(req), req.params.invitationId),
  );
}
