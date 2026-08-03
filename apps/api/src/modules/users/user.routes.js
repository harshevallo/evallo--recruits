/**
 * Authenticated user routes — the "personal" surface.
 *
 * Everything here belongs to the PERSON, not to any company. Company-scoped routes live under
 * /api/companies/:companyId and go through resolveCompanyContext instead.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { getMe, updateMe, completeOnboardingHandler } from './user.controller.js';
import { updateProfileValidation } from './user.validation.js';
import {
  createCandidateProfile,
  getCandidateProfile,
} from '../candidates/candidate.controller.js';
import { createCandidateProfileValidation } from './user.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(getMe));
router.patch('/', validate(updateProfileValidation), asyncHandler(updateMe));

// AUTH-05 — dismisses the first-action router. Navigation state only; grants nothing.
router.post('/complete-onboarding', asyncHandler(completeOnboardingHandler));

// The candidate capability. Creating this makes the user a candidate — nothing else does.
router.get('/candidate-profile', asyncHandler(getCandidateProfile));
router.post(
  '/candidate-profile',
  validate(createCandidateProfileValidation),
  asyncHandler(createCandidateProfile),
);

export default router;
