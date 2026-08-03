import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import * as candidateService from './candidate.service.js';

async function requireAppUser(req) {
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/**
 * POST /api/me/candidate-profile — start a candidate profile.
 *
 * This is the ONLY thing that makes someone a candidate. It adds a capability; it does not
 * change who they are, and it does not affect any company membership they hold.
 */
export async function createCandidateProfile(req, res) {
  const user = await requireAppUser(req);
  const { profile, created } = await candidateService.createCandidateProfile(user._id, req.body);

  return created ? sendCreated(res, profile) : sendSuccess(res, profile);
}

/**
 * GET /api/me/candidate-profile — CAN-01 candidate home.
 *
 * Returns the profile plus the completeness and pending actions derived from it, so the rules
 * live in a service rather than being re-implemented in a component.
 */
export async function getCandidateProfile(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getCandidateHome(user._id));
}

/**
 * GET /api/me/candidate-profile/builder — CAN-02.
 *
 * The whole builder state in one call: sections, the questions visible for this candidate's
 * chosen roles, current values, and per-section completion.
 */
export async function getBuilder(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getBuilder(user._id));
}

/**
 * PATCH /api/me/candidate-profile/sections/:sectionKey — CAN-02 save (and save-and-exit).
 *
 * A partial section is a valid save: PRD §8.3 lets candidates skip and return later, so only
 * malformed answers are rejected. Missing required answers surface at publish time instead.
 */
export async function saveBuilderSection(req, res) {
  const user = await requireAppUser(req);
  const result = await candidateService.saveSection(
    user._id,
    req.params.sectionKey,
    req.body?.values ?? {},
  );

  if (result.errors) throw ApiError.validation('Some answers need attention.', result.errors);

  return sendSuccess(res, result.builder);
}

/* ── CAN-03 preview and publish ────────────────────────────────────────────────────────────── */

/** GET /api/me/candidate-profile/preview — the exact recruiter rendering (PRD §8.8). */
export async function getPreview(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getProfilePreview(user));
}

/** POST /api/me/candidate-profile/publish */
export async function publishProfile(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.publish(user, req.body?.status));
}

/* ── CAN-04 visibility ─────────────────────────────────────────────────────────────────────── */

export async function getVisibility(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getVisibility(user));
}

export async function updateVisibility(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.setVisibility(user, req.body));
}

export async function blockCompany(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.blockCompanyForUser(user, req.body.companyId));
}

export async function unblockCompany(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.unblockCompanyForUser(user, req.params.companyId));
}

/* ── CAN-06 save · CAN-07 interest · CAN-08 my interests ──────────────────────────────────── */

export async function getCompanyRelationship(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getCompanyRelationshipForUser(user, req.params.slug));
}

export async function saveCompany(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.saveCompanyForUser(user, req.params.slug));
}

export async function unsaveCompany(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.unsaveCompanyForUser(user, req.params.slug));
}

/** PRD §8.7 step 6 — what the company will receive, shown before consent. */
export async function getConsentDisclosure(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getConsentDisclosure(user));
}

export async function submitInterest(req, res) {
  const user = await requireAppUser(req);
  const result = await candidateService.submitInterestForUser(user, req.params.slug, req.body);
  return result.status === 'submitted' ? sendCreated(res, result) : sendSuccess(res, result);
}

export async function listInterests(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.listInterestsForUser(user));
}

export async function withdrawInterest(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.withdrawInterestForUser(user, req.params.interestId));
}

/* ── CAN-09 messages ───────────────────────────────────────────────────────────────────────── */

export async function listConversations(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.listConversationsForUser(user));
}

export async function getConversation(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(res, await candidateService.getConversationForUser(user, req.params.conversationId));
}

export async function replyToConversation(req, res) {
  const user = await requireAppUser(req);
  return sendCreated(
    res,
    await candidateService.replyForUser(user, req.params.conversationId, req.body.body),
  );
}

export async function reportConversation(req, res) {
  const user = await requireAppUser(req);
  return sendSuccess(
    res,
    await candidateService.reportConversationForUser(user, req.params.conversationId, req.body.reason),
  );
}
