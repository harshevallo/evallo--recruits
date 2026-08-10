/** REC-05 / REC-16 hiring intent endpoints. Company-scoped via the middleware chain. */

import { sendSuccess } from '../../lib/response.js';
import * as intents from './hiringIntent.service.js';

/** GET /api/companies/:companyId/hiring-intents */
export async function listIntents(req, res) {
  return sendSuccess(res, await intents.listHiringIntents(req.company._id));
}

/** POST /api/companies/:companyId/hiring-intents */
export async function postIntent(req, res) {
  return sendSuccess(
    res,
    { intent: await intents.createHiringIntent(req.company._id, req.user._id, req.body) },
    { status: 201 },
  );
}

/** GET /api/companies/:companyId/hiring-intents/:intentId */
export async function getIntent(req, res) {
  return sendSuccess(res, {
    intent: await intents.getHiringIntent(req.company._id, req.params.intentId),
  });
}

/** PATCH /api/companies/:companyId/hiring-intents/:intentId */
export async function patchIntent(req, res) {
  return sendSuccess(res, {
    intent: await intents.updateHiringIntent(
      req.company._id,
      req.params.intentId,
      req.user._id,
      req.body,
    ),
  });
}

/** PATCH /api/companies/:companyId/hiring-intents/:intentId/status */
export async function patchIntentStatus(req, res) {
  return sendSuccess(res, {
    intent: await intents.changeHiringIntentStatus(
      req.company._id,
      req.params.intentId,
      req.user._id,
      req.body.status,
      req.body.reason ?? null,
    ),
  });
}
