/**
 * Permission keys — PRD §4.2.
 *
 * These are the only strings accepted by requirePermission() on the server and by the
 * RequirePermission route guard on the client. Never inline a permission string anywhere else.
 */

export const PERMISSIONS = Object.freeze({
  COMPANY_EDIT: 'company:edit',
  COMPANY_DELETE: 'company:delete',
  COMPANY_TRANSFER: 'company:transfer',
  COMPANY_SETTINGS: 'company:settings',

  MEMBER_MANAGE: 'member:manage',

  HIRING_MANAGE: 'hiring:manage',

  CANDIDATE_SEARCH: 'candidate:search',
  CANDIDATE_VIEW: 'candidate:view',

  INTEREST_VIEW: 'interest:view',

  PIPELINE_VIEW: 'pipeline:view',
  PIPELINE_EDIT: 'pipeline:edit',

  MESSAGE_SEND: 'message:send',
  NOTE_WRITE: 'note:write',

  DATA_EXPORT: 'data:export',
});

export const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));
