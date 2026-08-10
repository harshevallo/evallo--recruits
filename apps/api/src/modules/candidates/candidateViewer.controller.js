/**
 * REC-13 candidate viewer endpoint.
 *
 * Company-scoped: `req.company`, `req.membership` and `req.user` arrive resolved by the
 * middleware chain, so nothing here re-derives who is looking or which company they are in.
 */

import { sendSuccess } from '../../lib/response.js';
import { auditContext } from '../audit/audit.service.js';
import { getCandidateForCompany } from './candidateViewer.service.js';

/** GET /api/companies/:companyId/candidates/:candidateId */
export async function getCandidate(req, res) {
  const candidate = await getCandidateForCompany({
    company: req.company,
    actor: req.user,
    candidateId: req.params.candidateId,
    source: req.query.source,
    context: auditContext(req),
  });

  return sendSuccess(res, { ...candidate, yourRole: req.membership.role });
}
