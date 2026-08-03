/**
 * Role → permission matrix — PRD §4.2, mirrored in 03_TRD.md §6.1.
 *
 * Defined ONCE here and consumed by:
 *   - apps/api  middleware/requirePermission.js   (enforcement)
 *   - apps/web  router/guards/RequirePermission   (display)
 *
 * The server is the only enforcement point. The client copy exists so the UI does not offer
 * actions the API will reject.
 */

import { COMPANY_ROLES } from '../constants/roles.js';
import { PERMISSIONS as P } from '../constants/permissions.js';

/**
 * Permissions granted to a role unconditionally.
 * Roles whose access is narrowed by assignment (hiring manager) are handled in can.js —
 * a matrix cannot express "only for assigned intents".
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [COMPANY_ROLES.OWNER]: Object.freeze([
    P.COMPANY_EDIT,
    P.COMPANY_DELETE,
    P.COMPANY_TRANSFER,
    P.COMPANY_SETTINGS,
    P.MEMBER_MANAGE,
    P.HIRING_MANAGE,
    P.CANDIDATE_SEARCH,
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
    P.PIPELINE_EDIT,
    P.MESSAGE_SEND,
    P.NOTE_WRITE,
    P.DATA_EXPORT,
  ]),

  [COMPANY_ROLES.ADMIN]: Object.freeze([
    P.COMPANY_EDIT,
    P.COMPANY_SETTINGS,
    P.MEMBER_MANAGE,
    P.HIRING_MANAGE,
    P.CANDIDATE_SEARCH,
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
    P.PIPELINE_EDIT,
    P.MESSAGE_SEND,
    P.NOTE_WRITE,
    P.DATA_EXPORT,
  ]),

  [COMPANY_ROLES.RECRUITER]: Object.freeze([
    P.HIRING_MANAGE,
    P.CANDIDATE_SEARCH,
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
    P.PIPELINE_EDIT,
    P.MESSAGE_SEND,
    P.NOTE_WRITE,
  ]),

  // Scoped to assigned intents — see ASSIGNMENT_SCOPED_PERMISSIONS below.
  [COMPANY_ROLES.HIRING_MANAGER]: Object.freeze([
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
    P.MESSAGE_SEND,
    P.NOTE_WRITE,
  ]),

  [COMPANY_ROLES.VIEWER]: Object.freeze([
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
  ]),
});

/**
 * Permissions a hiring manager holds only for records tied to their assigned hiring intents
 * (PRD §4.2: "Limited to assigned pipelines or intents").
 *
 * The matrix grants the permission; the owning service still scopes the query by
 * membership.assignedIntentIds. Both checks are required.
 */
export const ASSIGNMENT_SCOPED_PERMISSIONS = Object.freeze({
  [COMPANY_ROLES.HIRING_MANAGER]: Object.freeze([
    P.CANDIDATE_VIEW,
    P.INTEREST_VIEW,
    P.PIPELINE_VIEW,
  ]),
});
