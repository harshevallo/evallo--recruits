/**
 * REC-14 pipeline and shortlist endpoints.
 *
 * Company-scoped throughout: `req.company` and `req.user` come from the middleware chain, so no
 * handler re-derives which company it is acting in or who is acting.
 */

import { sendSuccess } from '../../lib/response.js';
import * as pipeline from './pipeline.service.js';

/** GET /api/companies/:companyId/pipeline */
export async function getPipeline(req, res) {
  return sendSuccess(
    res,
    await pipeline.getPipeline(req.company._id, { includeClosed: req.query.includeClosed }),
  );
}

/**
 * GET /api/companies/:companyId/hires — REC-14.
 *
 * `pipeline:view`, the same permission as the board: this is the same data, asked a different way.
 */
export async function getHires(req, res) {
  return sendSuccess(res, await pipeline.getHires(req.company._id));
}

/** POST /api/companies/:companyId/pipeline */
export async function postPipelineEntry(req, res) {
  const entry = await pipeline.addToPipeline(req.company._id, req.user._id, req.body);
  return sendSuccess(res, { entry }, { status: 201 });
}

/** GET /api/companies/:companyId/pipeline/:entryId */
export async function getPipelineEntry(req, res) {
  return sendSuccess(res, {
    entry: await pipeline.getPipelineEntry(req.company._id, req.params.entryId),
  });
}

/** PATCH /api/companies/:companyId/pipeline/:entryId/stage */
export async function patchStage(req, res) {
  return sendSuccess(res, {
    entry: await pipeline.changeStage(
      req.company._id,
      req.params.entryId,
      req.user._id,
      req.body,
    ),
  });
}

/** PATCH /api/companies/:companyId/pipeline/:entryId/owner */
export async function patchOwner(req, res) {
  return sendSuccess(res, {
    entry: await pipeline.assignEntry(
      req.company._id,
      req.params.entryId,
      req.user._id,
      req.body.ownerId,
    ),
  });
}

/** PATCH /api/companies/:companyId/pipeline/:entryId */
export async function patchEntryDetails(req, res) {
  return sendSuccess(res, {
    entry: await pipeline.updateEntryDetails(req.company._id, req.params.entryId, req.body),
  });
}

/* ── Shortlist ─────────────────────────────────────────────────────────────────────────────── */

/** GET /api/companies/:companyId/saved-candidates */
export async function getSavedCandidates(req, res) {
  return sendSuccess(res, await pipeline.listSavedCandidates(req.company._id));
}

/** POST /api/companies/:companyId/saved-candidates */
export async function postSavedCandidate(req, res) {
  return sendSuccess(
    res,
    await pipeline.saveCandidate(req.company._id, req.user._id, req.body.candidateId),
    { status: 201 },
  );
}

/** DELETE /api/companies/:companyId/saved-candidates/:candidateId */
export async function deleteSavedCandidate(req, res) {
  return sendSuccess(
    res,
    await pipeline.unsaveCandidate(req.company._id, req.user._id, req.params.candidateId),
  );
}
