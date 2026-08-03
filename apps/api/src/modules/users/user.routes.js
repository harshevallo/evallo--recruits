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
import * as candidate from '../candidates/candidate.controller.js';
import { createCandidateProfileValidation } from './user.controller.js';
import {
  saveSectionValidation,
  publishValidation,
  visibilityValidation,
  blockCompanyValidation,
  unblockCompanyValidation,
  companySlugValidation,
  candidateInterestValidation,
  withdrawInterestValidation,
  conversationParamValidation,
  replyValidation,
  reportConversationValidation,
} from '../candidates/candidate.validation.js';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(getMe));
router.patch('/', validate(updateProfileValidation), asyncHandler(updateMe));

// AUTH-05 — dismisses the first-action router. Navigation state only; grants nothing.
router.post('/complete-onboarding', asyncHandler(completeOnboardingHandler));

// The candidate capability. Creating this makes the user a candidate — nothing else does.
router.get('/candidate-profile', asyncHandler(candidate.getCandidateProfile));
router.post(
  '/candidate-profile',
  validate(createCandidateProfileValidation),
  asyncHandler(candidate.createCandidateProfile),
);

// CAN-02 profile builder. Section content is question-bank configuration (ADR-007), so the
// route surface stays fixed however many questions the bank grows.
router.get('/candidate-profile/builder', asyncHandler(candidate.getBuilder));
router.patch(
  '/candidate-profile/sections/:sectionKey',
  validate(saveSectionValidation),
  asyncHandler(candidate.saveBuilderSection),
);

// CAN-03 — the exact recruiter rendering, and the publish control.
router.get('/candidate-profile/preview', asyncHandler(candidate.getPreview));
router.post(
  '/candidate-profile/publish',
  validate(publishValidation),
  asyncHandler(candidate.publishProfile),
);

// CAN-04 — discoverability, contact rules, and company blocks.
router.get('/candidate-profile/visibility', asyncHandler(candidate.getVisibility));
router.patch(
  '/candidate-profile/visibility',
  validate(visibilityValidation),
  asyncHandler(candidate.updateVisibility),
);
router.post(
  '/candidate-profile/blocked-companies',
  validate(blockCompanyValidation),
  asyncHandler(candidate.blockCompany),
);
router.delete(
  '/candidate-profile/blocked-companies/:companyId',
  validate(unblockCompanyValidation),
  asyncHandler(candidate.unblockCompany),
);

// CAN-06 — the signed-in overlay on a public company page. Company CONTENT still comes from the
// public endpoint, so the two views can never disagree about the company itself.
router.get(
  '/companies/:slug/relationship',
  validate(companySlugValidation),
  asyncHandler(candidate.getCompanyRelationship),
);
router.put(
  '/companies/:slug/saved',
  validate(companySlugValidation),
  asyncHandler(candidate.saveCompany),
);
router.delete(
  '/companies/:slug/saved',
  validate(companySlugValidation),
  asyncHandler(candidate.unsaveCompany),
);

// CAN-07 — interest submission (PRD §8.7).
router.get('/interests/consent-disclosure', asyncHandler(candidate.getConsentDisclosure));
router.post(
  '/companies/:slug/interest',
  validate(candidateInterestValidation),
  asyncHandler(candidate.submitInterest),
);

// CAN-08 — my interests.
router.get('/interests', asyncHandler(candidate.listInterests));
router.post(
  '/interests/:interestId/withdraw',
  validate(withdrawInterestValidation),
  asyncHandler(candidate.withdrawInterest),
);

// CAN-09 — messages. A candidate replies within a thread; opening one is the company's action.
router.get('/conversations', asyncHandler(candidate.listConversations));
router.get(
  '/conversations/:conversationId',
  validate(conversationParamValidation),
  asyncHandler(candidate.getConversation),
);
router.post(
  '/conversations/:conversationId/messages',
  validate(replyValidation),
  asyncHandler(candidate.replyToConversation),
);
router.post(
  '/conversations/:conversationId/report',
  validate(reportConversationValidation),
  asyncHandler(candidate.reportConversation),
);

export default router;
