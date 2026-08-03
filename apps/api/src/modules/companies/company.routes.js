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
import { postCompany, getCompanyMembers } from './company.controller.js';
import { createCompanyValidation, companyParamValidation } from './company.validation.js';

const router = Router();

router.use(authenticate);

// Any authenticated user may create a company — it grants a membership, not a new identity.
router.post('/', validate(createCompanyValidation), asyncHandler(postCompany));

router.get(
  '/:companyId/members',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(getCompanyMembers),
);

export default router;
