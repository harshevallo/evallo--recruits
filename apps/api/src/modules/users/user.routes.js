/**
 * Authenticated user routes — the "personal" surface.
 *
 * Everything here belongs to the PERSON, not to any company. Company-scoped routes live under
 * /api/companies/:companyId and go through resolveCompanyContext instead.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { ApiError } from '../../lib/ApiError.js';
import { validate } from '../../middleware/validate.js';
import * as profileEntries from '../candidates/profileEntry.controller.js';
import * as entryValidation from '../candidates/profileEntry.validation.js';

/**
 * Validates an entry body against the schema for `:kind`.
 *
 * The generic `validate()` middleware takes one fixed schema; here the shape is only known once
 * the route parameter is read, so this small wrapper picks it per request and reports failures
 * through the same field-keyed envelope as everything else (04_API_DOCUMENTATION §1).
 */
function validateEntryBody(options = {}) {
  return (req, res, next) => {
    const parsed = entryValidation.bodyFor(req.params.kind, options).safeParse(req.body ?? {});

    if (!parsed.success) {
      const details = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!details[key]) details[key] = issue.message;
      }
      return next(ApiError.validation('Some answers need attention.', details));
    }

    req.body = parsed.data;
    return next();
  };
}
import { getMe, updateMe, completeOnboardingHandler } from './user.controller.js';
import { updateProfileValidation } from './user.validation.js';
import * as candidate from '../candidates/candidate.controller.js';
import * as settings from '../settings/settings.controller.js';
import {
  getMyJoinRequests,
  postWithdrawJoinRequest,
  myJoinRequestParamValidation,
} from '../memberships/joinRequest.controller.js';
import {
  getMyInvitations,
  acceptMyInvitation,
  declineMyInvitation,
} from '../memberships/invitation.controller.js';
import { invitationParamValidation } from '../companies/company.validation.js';
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
  respondConversationValidation,
  muteConversationValidation,
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

/*
 * CAN-02 evidence entries — experience and education (PRD §8.3 sections 4–5, ADR-008).
 *
 * Personal surface only: an entry belongs to the candidate editing it, and the handler resolves
 * the profile from the session rather than from a parameter, so there is no id to substitute.
 * The body schema depends on `:kind`, so it is validated inside the handler chain where the kind
 * is known rather than by a fixed schema that would have to accept both shapes.
 */
router.get(
  '/candidate-profile/entries/:kind',
  validate(entryValidation.listEntriesValidation),
  asyncHandler(profileEntries.listEntries),
);

router.post(
  '/candidate-profile/entries/:kind',
  validate(entryValidation.listEntriesValidation),
  validateEntryBody(),
  asyncHandler(profileEntries.createEntry),
);

router.patch(
  '/candidate-profile/entries/:kind/:entryId',
  validate(entryValidation.removeEntryValidation),
  validateEntryBody({ partial: true }),
  asyncHandler(profileEntries.updateEntry),
);

router.delete(
  '/candidate-profile/entries/:kind/:entryId',
  validate(entryValidation.removeEntryValidation),
  asyncHandler(profileEntries.removeEntry),
);
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
// PRD §11.2 — accept, decline, mute. Block lives in CAN-04; report is below.
router.post(
  '/conversations/:conversationId/respond',
  validate(respondConversationValidation),
  asyncHandler(candidate.respondToConversation),
);
router.put(
  '/conversations/:conversationId/mute',
  validate(muteConversationValidation),
  asyncHandler(candidate.setConversationMuted),
);
router.post(
  '/conversations/:conversationId/report',
  validate(reportConversationValidation),
  asyncHandler(candidate.reportConversation),
);

/*
 * REC-01 — company invitations addressed to this user.
 *
 * Deliberately on the personal surface: the invitee is NOT yet a member, so
 * resolveCompanyContext could never authorise them on a company-scoped route. Ownership is the
 * user id, and every query below is scoped to it.
 */
router.get('/invitations', asyncHandler(getMyInvitations));
router.post(
  '/invitations/:invitationId/accept',
  validate(invitationParamValidation),
  asyncHandler(acceptMyInvitation),
);
router.post(
  '/invitations/:invitationId/decline',
  validate(invitationParamValidation),
  asyncHandler(declineMyInvitation),
);

/*
 * REC-01 join requests, from the requester's side.
 *
 * Same reasoning as invitations above: the requester is not a member, so this cannot be a
 * company-scoped route. Every query is scoped to the caller's user id.
 */
router.get('/join-requests', asyncHandler(getMyJoinRequests));

/*
 * SET-01 account settings (PRD Appendix A, §15, §16.1).
 *
 * Personal surface: every handler scopes to `req.authUser.userId`, so there is no id to substitute
 * and no company context to resolve.
 */
router.get('/settings/notifications', asyncHandler(settings.getNotifications));
router.patch(
  '/settings/notifications',
  validate(settings.notificationPreferencesValidation),
  asyncHandler(settings.patchNotifications),
);

router.post(
  '/settings/password',
  validate(settings.changePasswordValidation),
  asyncHandler(settings.postPassword),
);
router.get('/settings/sessions', asyncHandler(settings.getSessions));
router.post('/settings/sessions/sign-out-others', asyncHandler(settings.postSignOutOthers));
router.get('/settings/sign-in-methods', asyncHandler(settings.getSignInMethods));

router.get('/settings/export', asyncHandler(settings.getExport));
router.post(
  '/settings/delete',
  validate(settings.deleteAccountValidation),
  asyncHandler(settings.postDeleteAccount),
);
router.post(
  '/join-requests/:requestId/withdraw',
  validate(myJoinRequestParamValidation),
  asyncHandler(postWithdrawJoinRequest),
);

export default router;
