/**
 * Company routes — authenticated.
 *
 * Note the middleware chain on company-scoped routes:
 *   authenticate → resolveCompanyContext → requirePermission
 *
 * Layer 1 proves who you are. Layer 2 finds your membership in THIS company. Layer 3 checks the
 * permission that membership grants. No step is skippable, and none of it reads a role from
 * the User document.
 */

import { Router } from 'express';
import { PERMISSIONS } from '@evallo/shared';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { resolveCompanyContext } from '../../middleware/resolveCompanyContext.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { validate } from '../../middleware/validate.js';
import {
  postCompany,
  getCompanyMembers,
  getCompanyEditor,
  saveCompanyStep,
  getCompanyPreview,
  publishCompany,
  unpublishCompany,
  getDashboard,
} from './company.controller.js';
import {
  listInvitations,
  createInvitation,
  resendInvitation,
  cancelInvitation,
} from '../memberships/invitation.controller.js';
import {
  listInterests,
  patchInterestStatus,
  postInterestViewed,
} from '../interests/interestInbox.controller.js';
import {
  interestInboxValidation,
  interestStatusValidation,
  interestParamValidation,
} from '../interests/interest.validation.js';
import {
  patchMemberRole,
  deleteMember,
  postOwnershipTransfer,
} from '../memberships/member.controller.js';
import {
  createCompanyValidation,
  companyParamValidation,
  companyStepValidation,
  createInvitationValidation,
  companyInvitationParamValidation,
  companyMemberParamValidation,
  changeMemberRoleValidation,
} from './company.validation.js';

const router = Router();

router.use(authenticate);

// Any authenticated user may create a company — it grants a membership, not a new identity.
router.post('/', validate(createCompanyValidation), asyncHandler(postCompany));

/*
 * REC-10 company home.
 *
 * `resolveCompanyContext()` with no `requirePermission`: this is where every member lands after
 * switching company, so gating it on a permission would leave a viewer with no destination. The
 * service withholds the sections a caller may not see rather than the whole page.
 */
router.get(
  '/:companyId/dashboard',
  validate(companyParamValidation),
  resolveCompanyContext(),
  asyncHandler(getDashboard),
);

router.get(
  '/:companyId/members',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(getCompanyMembers),
);

/*
 * REC-08 team management and REC-09 ownership transfer.
 *
 * `member:manage` gates all three, matching the invitation routes: PRD §4.2 gives it to owners
 * and admins only. It is not the whole answer, though — promoting to owner, demoting an owner,
 * removing an owner, and transferring ownership additionally require `company:transfer`, which
 * only an owner holds. That second check lives in the service, next to the last-owner guard it
 * works with.
 */
router.patch(
  '/:companyId/members/:memberId',
  validate(changeMemberRoleValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(patchMemberRole),
);

router.delete(
  '/:companyId/members/:memberId',
  validate(companyMemberParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(deleteMember),
);

router.post(
  '/:companyId/members/:memberId/transfer-ownership',
  validate(companyMemberParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(postOwnershipTransfer),
);

/*
 * REC-07 team invitations.
 *
 * `member:manage` throughout — the permission PRD §4.2 gives owners and admins and withholds from
 * recruiters, hiring managers, and viewers. Reading the list is gated as tightly as sending an
 * invitation because the list is a roster of people's email addresses.
 *
 * Which ROLE the caller may grant is a further question the service settles: `member:manage`
 * alone does not let an admin mint another owner.
 */
router.get(
  '/:companyId/invitations',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(listInvitations),
);

router.post(
  '/:companyId/invitations',
  validate(createInvitationValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(createInvitation),
);

router.post(
  '/:companyId/invitations/:invitationId/resend',
  validate(companyInvitationParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(resendInvitation),
);

router.post(
  '/:companyId/invitations/:invitationId/cancel',
  validate(companyInvitationParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(cancelInvitation),
);

/*
 * REC-11 interest inbox.
 *
 * `interest:view` — the permission PRD §4.2 grants to EVERY company role including viewer, since
 * seeing who approached the company is not a privileged action within it. Changing an interest's
 * status is gated the same way: it records what the company did, not what the candidate decided,
 * and the statuses a recruiter may write exclude `withdrawn` entirely.
 */
router.get(
  '/:companyId/interests',
  validate(interestInboxValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.INTEREST_VIEW),
  asyncHandler(listInterests),
);

router.patch(
  '/:companyId/interests/:interestId',
  validate(interestStatusValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.INTEREST_VIEW),
  asyncHandler(patchInterestStatus),
);

router.post(
  '/:companyId/interests/:interestId/viewed',
  validate(interestParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.INTEREST_VIEW),
  asyncHandler(postInterestViewed),
);

/*
 * REC-02 setup wizard and REC-06 preview/publish.
 *
 * All of these edit or expose an unpublished page, so they sit behind the same four-layer chain
 * as every other company-scoped route (ADR-006) and require `company:edit`. A viewer or hiring
 * manager can reach the company but not its editor.
 */
router.get(
  '/:companyId/editor',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_EDIT),
  asyncHandler(getCompanyEditor),
);

router.patch(
  '/:companyId/steps/:stepKey',
  validate(companyStepValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_EDIT),
  asyncHandler(saveCompanyStep),
);

router.get(
  '/:companyId/preview',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_EDIT),
  asyncHandler(getCompanyPreview),
);

router.post(
  '/:companyId/publish',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_EDIT),
  asyncHandler(publishCompany),
);

router.post(
  '/:companyId/unpublish',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_EDIT),
  asyncHandler(unpublishCompany),
);

export default router;
