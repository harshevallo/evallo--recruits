/**
 * Permission check against the membership resolved for this request.
 *
 * Uses the SAME `can()` resolver the frontend uses to decide whether to render a control, so the
 * UI can never offer an action the API will reject. The server remains the only enforcement
 * point — the client copy is purely for display.
 *
 * Must run after resolveCompanyContext.
 */

import { can, isAssignmentScoped } from '@evallo/shared';
import { ApiError } from '../lib/ApiError.js';

/**
 * @param {string} permission  A PERMISSIONS value
 */
export function requirePermission(permission) {
  return function check(req, _res, next) {
    if (!req.membership) {
      return next(
        ApiError.internal('requirePermission used without resolveCompanyContext'),
      );
    }

    if (!can(req.membership, permission)) {
      return next(ApiError.forbidden('You do not have permission to do that.'));
    }

    /**
     * Roles limited to assigned hiring intents (hiring manager) pass the permission check but
     * must still be scoped in the query. Flagged here so the service cannot forget.
     */
    req.isAssignmentScoped = isAssignmentScoped(req.membership, permission);

    return next();
  };
}
