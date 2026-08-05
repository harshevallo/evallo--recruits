/**
 * Team management endpoints — REC-08 and REC-09.
 *
 * Every route here is company-scoped and reaches the service with `req.company` and
 * `req.membership` already resolved by the middleware chain, so no handler re-derives who the
 * caller is or which company they are acting in.
 */

import { sendSuccess } from '../../lib/response.js';
import * as members from './member.service.js';

/** PATCH /api/companies/:companyId/members/:memberId */
export async function patchMemberRole(req, res) {
  return sendSuccess(
    res,
    await members.changeMemberRole({
      company: req.company,
      actorMembership: req.membership,
      memberId: req.params.memberId,
      role: req.body.role,
    }),
  );
}

/** DELETE /api/companies/:companyId/members/:memberId */
export async function deleteMember(req, res) {
  return sendSuccess(
    res,
    await members.removeMember({
      company: req.company,
      actorMembership: req.membership,
      memberId: req.params.memberId,
    }),
  );
}

/** POST /api/companies/:companyId/members/:memberId/transfer-ownership */
export async function postOwnershipTransfer(req, res) {
  return sendSuccess(
    res,
    await members.transferOwnership({
      company: req.company,
      actorMembership: req.membership,
      memberId: req.params.memberId,
    }),
  );
}
