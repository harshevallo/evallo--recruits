/** REC-15 company-side messaging endpoints. */

import { sendSuccess } from '../../lib/response.js';
import * as messaging from './companyMessaging.service.js';

/** GET /api/companies/:companyId/conversations */
export async function listCompanyConversations(req, res) {
  return sendSuccess(res, await messaging.listCompanyConversations(req.company._id, req.user._id));
}

/** GET /api/companies/:companyId/conversations/:conversationId */
export async function getCompanyConversation(req, res) {
  return sendSuccess(
    res,
    await messaging.getCompanyConversation(req.company._id, req.params.conversationId, req.user._id),
  );
}

/** POST /api/companies/:companyId/conversations/:conversationId/messages */
export async function postCompanyReply(req, res) {
  return sendSuccess(
    res,
    await messaging.replyAsCompany(
      req.company._id,
      req.user._id,
      req.params.conversationId,
      req.body.body,
    ),
    { status: 201 },
  );
}

/** POST /api/companies/:companyId/conversations — opens a thread with a candidate. */
export async function postStartConversation(req, res) {
  return sendSuccess(
    res,
    await messaging.sendCompanyMessage(req.company._id, req.user._id, req.body),
    { status: 201 },
  );
}
