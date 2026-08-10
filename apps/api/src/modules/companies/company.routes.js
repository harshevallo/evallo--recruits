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
import { getCandidateSearch } from '../search/search.controller.js';
import { getCandidate } from '../candidates/candidateViewer.controller.js';
import { candidateViewerValidation } from '../candidates/candidateViewer.validation.js';
import { candidateSearchValidation } from '../search/search.validation.js';
import {
  patchMemberRole,
  deleteMember,
  postOwnershipTransfer,
} from '../memberships/member.controller.js';
import { getCompanyAudit, companyAuditValidation } from './companyAudit.controller.js';
import {
  getCompanySearch,
  postJoinRequest,
  getJoinRequests,
  postApproveJoinRequest,
  postDeclineJoinRequest,
  companySearchValidation,
  requestToJoinValidation,
  listJoinRequestsValidation,
  decideJoinRequestValidation,
} from '../memberships/joinRequest.controller.js';
import {
  createCompanyValidation,
  companyParamValidation,
  companyStepValidation,
  createInvitationValidation,
  companyInvitationParamValidation,
  companyMemberParamValidation,
  changeMemberRoleValidation,
} from './company.validation.js';
import {
  listIntents,
  postIntent,
  getIntent,
  patchIntent,
  patchIntentStatus,
} from '../hiring-intents/hiringIntent.controller.js';
import {
  listHiringIntentsValidation,
  createHiringIntentValidation,
  hiringIntentParamValidation,
  updateHiringIntentValidation,
  changeIntentStatusValidation,
} from '../hiring-intents/hiringIntent.validation.js';
import {
  getPipeline,
  postPipelineEntry,
  getPipelineEntry,
  patchStage,
  patchOwner,
  patchEntryDetails,
  getSavedCandidates,
  postSavedCandidate,
  deleteSavedCandidate,
} from '../pipeline/pipeline.controller.js';
import {
  pipelineListValidation,
  addToPipelineValidation,
  pipelineEntryParamValidation,
  changeStageValidation,
  assignEntryValidation,
  entryDetailsValidation,
  savedCandidateValidation,
  savedCandidateParamValidation,
} from '../pipeline/pipeline.validation.js';
import {
  getNotes,
  postNote,
  deleteNote,
  listNotesValidation,
  createNoteValidation,
  deleteNoteValidation,
} from '../notes/note.controller.js';
import {
  listCompanyConversations,
  getCompanyConversation,
  postCompanyReply,
  postStartConversation,
} from '../messaging/companyMessaging.controller.js';
import {
  companyConversationListValidation,
  companyConversationParamValidation,
  companyReplyValidation,
  startConversationValidation,
} from '../messaging/companyMessaging.validation.js';

const router = Router();

router.use(authenticate);

// Any authenticated user may create a company — it grants a membership, not a new identity.
router.post('/', validate(createCompanyValidation), asyncHandler(postCompany));

/*
 * REC-01 company search, for the "join the company I work at" selector.
 *
 * MUST be declared before any `/:companyId` route: Express matches in order, so a later literal
 * would be swallowed by the parameter and `search` would be looked up as a company id.
 *
 * Authenticated but not company-scoped — the caller is by definition not a member yet. The service
 * returns PUBLISHED companies only, which is the same set PUB-01 already lists publicly.
 */
router.get('/search', validate(companySearchValidation), asyncHandler(getCompanySearch));

/*
 * Asking to join. Also not company-scoped, and deliberately so: `resolveCompanyContext` requires an
 * ACTIVE membership, which is precisely what the caller is asking for. Authorization lives in the
 * service instead — it refuses existing members, suspended people, and unpublished companies.
 */
router.post(
  '/:companyId/join-requests',
  validate(requestToJoinValidation),
  asyncHandler(postJoinRequest),
);

/* Reviewing requests IS company-scoped and needs `member:manage`, like every other team action. */
router.get(
  '/:companyId/join-requests',
  validate(listJoinRequestsValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(getJoinRequests),
);

router.post(
  '/:companyId/join-requests/:requestId/approve',
  validate(decideJoinRequestValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(postApproveJoinRequest),
);

router.post(
  '/:companyId/join-requests/:requestId/decline',
  validate(decideJoinRequestValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MEMBER_MANAGE),
  asyncHandler(postDeclineJoinRequest),
);

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
 * REC-12 talent search.
 *
 * `candidate:search` — held by owner, admin and recruiter, and withheld from hiring manager and
 * viewer (PRD §4.2, §21.4: "Only active company members with candidate:search / candidate:view
 * can use search"). The candidate's own visibility settings constrain the results independently
 * of this permission, inside the search service.
 */
router.get(
  '/:companyId/search/candidates',
  validate(candidateSearchValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_SEARCH),
  asyncHandler(getCandidateSearch),
);

/*
 * REC-13 candidate viewer.
 *
 * `candidate:view` — held by every company role (TRD §6.1), including viewer, and by a hiring
 * manager only for assigned intents. What the caller may actually SEE is decided one layer
 * further in, by the candidate's own settings: TRD §6.2 layer 4 is the part no permission can
 * override, and a recruiter holding this permission is still refused when the candidate has not
 * shared with them.
 */
router.get(
  '/:companyId/candidates/:candidateId',
  validate(candidateViewerValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(getCandidate),
);

/*
 * REC-05 / REC-16 hiring intents.
 *
 * `hiring:manage` to write, and any member may read: a hiring manager or viewer needs to know what
 * the company is hiring for to do anything useful, but declaring hiring is a company-level
 * statement (PRD §4.2, §7.5).
 */
router.get(
  '/:companyId/hiring-intents',
  validate(listHiringIntentsValidation),
  resolveCompanyContext(),
  asyncHandler(listIntents),
);

router.post(
  '/:companyId/hiring-intents',
  validate(createHiringIntentValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.HIRING_MANAGE),
  asyncHandler(postIntent),
);

router.get(
  '/:companyId/hiring-intents/:intentId',
  validate(hiringIntentParamValidation),
  resolveCompanyContext(),
  asyncHandler(getIntent),
);

router.patch(
  '/:companyId/hiring-intents/:intentId',
  validate(updateHiringIntentValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.HIRING_MANAGE),
  asyncHandler(patchIntent),
);

/* Activating, pausing and closing — the transitions PRD §11.4 makes auditable. */
router.patch(
  '/:companyId/hiring-intents/:intentId/status',
  validate(changeIntentStatusValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.HIRING_MANAGE),
  asyncHandler(patchIntentStatus),
);

/*
 * REC-14 pipeline.
 *
 * `pipeline:view` to read the board, `pipeline:edit` to move anyone through it. The candidate's own
 * visibility still applies inside the service — a permission never overrides it.
 */
router.get(
  '/:companyId/pipeline',
  validate(pipelineListValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_VIEW),
  asyncHandler(getPipeline),
);

router.post(
  '/:companyId/pipeline',
  validate(addToPipelineValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_EDIT),
  asyncHandler(postPipelineEntry),
);

router.get(
  '/:companyId/pipeline/:entryId',
  validate(pipelineEntryParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_VIEW),
  asyncHandler(getPipelineEntry),
);

router.patch(
  '/:companyId/pipeline/:entryId/stage',
  validate(changeStageValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_EDIT),
  asyncHandler(patchStage),
);

router.patch(
  '/:companyId/pipeline/:entryId/owner',
  validate(assignEntryValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_EDIT),
  asyncHandler(patchOwner),
);

router.patch(
  '/:companyId/pipeline/:entryId',
  validate(entryDetailsValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.PIPELINE_EDIT),
  asyncHandler(patchEntryDetails),
);

/*
 * Shortlist. Saving is a candidate-facing-silent act (PRD §21.4), so it sits behind
 * `candidate:view` — if you may look at them, you may keep a reference to them.
 */
router.get(
  '/:companyId/saved-candidates',
  validate(companyParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(getSavedCandidates),
);

router.post(
  '/:companyId/saved-candidates',
  validate(savedCandidateValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(postSavedCandidate),
);

router.delete(
  '/:companyId/saved-candidates/:candidateId',
  validate(savedCandidateParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(deleteSavedCandidate),
);

/*
 * Internal notes. `note:write` to add, `candidate:view` to read — a viewer who may see the
 * candidate may see the company's thinking about them, but not add to it.
 */
router.get(
  '/:companyId/candidates/:candidateId/notes',
  validate(listNotesValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(getNotes),
);

router.post(
  '/:companyId/candidates/:candidateId/notes',
  validate(createNoteValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.NOTE_WRITE),
  asyncHandler(postNote),
);

router.delete(
  '/:companyId/notes/:noteId',
  validate(deleteNoteValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.NOTE_WRITE),
  asyncHandler(deleteNote),
);

/*
 * REC-15 company-side messaging.
 *
 * The same conversations CAN-09 shows, from the other side. `message:send` to reply; reading sits
 * behind `candidate:view` because a thread contains what the candidate wrote.
 */
router.get(
  '/:companyId/conversations',
  validate(companyConversationListValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(listCompanyConversations),
);

router.get(
  '/:companyId/conversations/:conversationId',
  validate(companyConversationParamValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.CANDIDATE_VIEW),
  asyncHandler(getCompanyConversation),
);

router.post(
  '/:companyId/conversations/:conversationId/messages',
  validate(companyReplyValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MESSAGE_SEND),
  asyncHandler(postCompanyReply),
);

/* Opening a thread from a search result or the candidate viewer — the company's first contact. */
router.post(
  '/:companyId/conversations',
  validate(startConversationValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.MESSAGE_SEND),
  asyncHandler(postStartConversation),
);

/*
 * SET-02 — the company's own audit trail (PRD §14.3, §16.1).
 *
 * `company:settings`, which PRD §4.2 gives owner and admin. A recruiter can act, but reviewing who
 * accessed what is an accountability function, not a day-to-day one.
 */
router.get(
  '/:companyId/audit',
  validate(companyAuditValidation),
  resolveCompanyContext(),
  requirePermission(PERMISSIONS.COMPANY_SETTINGS),
  asyncHandler(getCompanyAudit),
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
