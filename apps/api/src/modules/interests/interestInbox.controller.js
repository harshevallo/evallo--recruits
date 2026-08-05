/**
 * REC-11 interest inbox endpoints.
 *
 * Company-scoped throughout: `req.company` and `req.membership` are resolved by the middleware
 * chain, so no handler re-derives which company it is acting in.
 */

import { sendSuccess } from '../../lib/response.js';
import * as inbox from './interestInbox.service.js';

/** GET /api/companies/:companyId/interests */
export async function listInterests(req, res) {
  const result = await inbox.listCompanyInterests(req.company, req.query);

  return sendSuccess(
    res,
    { interests: result.interests, counts: result.counts, yourRole: req.membership.role },
    { meta: result.meta },
  );
}

/** PATCH /api/companies/:companyId/interests/:interestId */
export async function patchInterestStatus(req, res) {
  return sendSuccess(
    res,
    await inbox.updateInterestStatus(req.company, req.params.interestId, req.body.status),
  );
}

/** POST /api/companies/:companyId/interests/:interestId/viewed */
export async function postInterestViewed(req, res) {
  return sendSuccess(res, await inbox.markInterestViewed(req.company, req.params.interestId));
}
