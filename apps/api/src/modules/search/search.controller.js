/**
 * REC-12 talent search endpoint.
 *
 * Company-scoped: `req.company` and `req.membership` arrive resolved by the middleware chain, so
 * nothing here re-derives which company is searching.
 */

import { sendSuccess } from '../../lib/response.js';
import { searchCandidates } from './search.service.js';

/** GET /api/companies/:companyId/search/candidates */
export async function getCandidateSearch(req, res) {
  const { candidates, meta } = await searchCandidates(req.company, req.query);

  return sendSuccess(
    res,
    { candidates, yourRole: req.membership.role },
    { meta },
  );
}
