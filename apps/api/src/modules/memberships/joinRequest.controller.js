/** REC-01 company search and join-request endpoints. */

import { z } from 'zod';
import { COMPANY_ROLE_VALUES, COMPANY_ROLES } from '@evallo/shared';
import { sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import * as joinRequests from './joinRequest.service.js';

/**
 * The acting user.
 *
 * `authenticate` attaches only an id (`req.authUser`); `req.user` is a document that
 * `resolveCompanyContext` loads. Search, requesting and the `/me` routes all run WITHOUT company
 * context — the caller is not a member yet, which is the whole point — so they load the account
 * here, exactly as invitation.controller.js does for the same reason.
 */
async function currentUser(req) {
  if (req.user) return req.user;
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const companyParams = z.object({ companyId: z.string().trim().min(1).max(80) });

/** Owner is excluded: approval never hands over ownership (that is `company:transfer`). */
const grantableRole = z.enum(COMPANY_ROLE_VALUES.filter((role) => role !== COMPANY_ROLES.OWNER));

export const companySearchValidation = {
  query: z.object({
    q: z.string().trim().max(120).default(''),
    limit: z.coerce.number().int().min(1).max(25).default(10),
  }),
};

export const requestToJoinValidation = {
  params: companyParams,
  body: z.object({
    message: z.string().trim().max(500).nullish(),
    requestedRole: grantableRole.optional(),
  }),
};

export const listJoinRequestsValidation = {
  params: companyParams,
  query: z.object({
    includeResolved: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  }),
};

export const decideJoinRequestValidation = {
  params: companyParams.extend({ requestId: objectId }),
  body: z.object({ role: grantableRole.optional() }),
};

export const myJoinRequestParamValidation = { params: z.object({ requestId: objectId }) };

/** GET /api/companies/search?q= */
export async function getCompanySearch(req, res) {
  return sendSuccess(
    res,
    await joinRequests.searchCompanies(req.query.q, req.authUser.userId, {
      limit: req.query.limit,
    }),
  );
}

/** POST /api/companies/:companyId/join-requests */
export async function postJoinRequest(req, res) {
  return sendSuccess(
    res,
    {
      request: await joinRequests.requestToJoin(req.params.companyId, await currentUser(req), {
        message: req.body.message ?? null,
        requestedRole: req.body.requestedRole,
      }),
    },
    { status: 201 },
  );
}

/** GET /api/companies/:companyId/join-requests — requires `member:manage`. */
export async function getJoinRequests(req, res) {
  return sendSuccess(
    res,
    await joinRequests.listCompanyJoinRequests(req.company._id, {
      includeResolved: req.query.includeResolved,
    }),
  );
}

/** POST /api/companies/:companyId/join-requests/:requestId/approve */
export async function postApproveJoinRequest(req, res) {
  return sendSuccess(res, {
    request: await joinRequests.approveJoinRequest(
      req.company._id,
      req.params.requestId,
      req.user,
      req.body.role,
    ),
  });
}

/** POST /api/companies/:companyId/join-requests/:requestId/decline */
export async function postDeclineJoinRequest(req, res) {
  return sendSuccess(res, {
    request: await joinRequests.declineJoinRequest(
      req.company._id,
      req.params.requestId,
      req.user,
    ),
  });
}

/** GET /api/me/join-requests */
export async function getMyJoinRequests(req, res) {
  return sendSuccess(res, await joinRequests.listMyJoinRequests(await currentUser(req)));
}

/** POST /api/me/join-requests/:requestId/withdraw */
export async function postWithdrawJoinRequest(req, res) {
  return sendSuccess(
    res,
    await joinRequests.withdrawJoinRequest(await currentUser(req), req.params.requestId),
  );
}
