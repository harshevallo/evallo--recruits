/** SET-02 audit trail endpoint (PRD §14.3, §16.1). */

import { z } from 'zod';
import { sendSuccess } from '../../lib/response.js';
import { listCompanyAuditEvents } from '../audit/audit.service.js';

export const companyAuditValidation = {
  params: z.object({ companyId: z.string().trim().min(1).max(80) }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

/** GET /api/companies/:companyId/audit */
export async function getCompanyAudit(req, res) {
  const { events, meta } = await listCompanyAuditEvents(req.company._id, {
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  return sendSuccess(res, { events }, { meta });
}
