/**
 * Direct messaging endpoints — the personal surface (ADR-025).
 *
 * Every route is `/api/me/conversations…`, because a conversation belongs to the two people in it
 * and to no company. There is deliberately no `/api/companies/:companyId/conversations` any more:
 * a company context is something a person may START a conversation THROUGH (`companyId` in the
 * body), never something a conversation can be read through.
 */

import { ApiError } from '../../lib/ApiError.js';
import { sendSuccess, sendCreated } from '../../lib/response.js';
import { auditContext } from '../audit/audit.service.js';
import { User } from '../users/user.model.js';
import * as messaging from './messaging.service.js';

async function currentUser(req) {
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/** GET /api/me/conversations */
export async function listConversations(req, res) {
  return sendSuccess(res, await messaging.listConversations(req.authUser.userId));
}

/** GET /api/me/conversations/summary — the badge counts. */
export async function getConversationSummary(req, res) {
  return sendSuccess(res, await messaging.conversationSummary(req.authUser.userId));
}

/** GET /api/me/conversations/:conversationId */
export async function getConversation(req, res) {
  return sendSuccess(
    res,
    await messaging.getConversation(req.authUser.userId, req.params.conversationId),
  );
}

/** POST /api/me/conversations — start one, or continue the one the pair already has. */
export async function postStartConversation(req, res) {
  const user = await currentUser(req);
  return sendCreated(res, await messaging.startConversation(user, req.body, auditContext(req)));
}

/** POST /api/me/conversations/:conversationId/messages */
export async function postMessage(req, res) {
  const user = await currentUser(req);
  return sendCreated(
    res,
    await messaging.sendMessage(user, req.params.conversationId, req.body.body, auditContext(req)),
  );
}

/** POST /api/me/conversations/:conversationId/respond — PRD §11.2 accept / decline. */
export async function postRespond(req, res) {
  return sendSuccess(
    res,
    await messaging.respondToRequest(
      req.authUser.userId,
      req.params.conversationId,
      req.body.accepted,
    ),
  );
}

/** PUT /api/me/conversations/:conversationId/mute — PRD §11.2 mute / unmute. */
export async function putMute(req, res) {
  return sendSuccess(
    res,
    await messaging.setConversationMuted(
      req.authUser.userId,
      req.params.conversationId,
      req.body.muted,
    ),
  );
}

/** POST /api/me/conversations/:conversationId/report — PRD §8.2 safety/reporting. */
export async function postReport(req, res) {
  return sendSuccess(
    res,
    await messaging.reportConversation(
      req.authUser.userId,
      req.params.conversationId,
      req.body.reason,
    ),
  );
}
