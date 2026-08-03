import { z } from 'zod';
import { sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from './user.model.js';
import { updateUserProfile, completeOnboarding } from './user.service.js';
import { getUserCapabilities } from './capability.service.js';

/**
 * Loads the authenticated user from the id in the verified access token.
 * The user always exists here — the token was issued for a real account — but guard anyway.
 */
async function currentUser(req) {
  const user = await User.findById(req.authUser.userId);
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/**
 * Builds the /api/me response.
 *
 * `capabilities` is DERIVED on every call — from whether a CandidateProfile exists and which
 * CompanyMember rows are active. Never stored on the user, so revoking a membership takes effect
 * on the next request.
 */
async function meResponse(user) {
  const capabilities = await getUserCapabilities(user._id);
  return { user: user.toPublicProfile(), capabilities };
}

/** GET /api/me */
export async function getMe(req, res) {
  const user = await currentUser(req);
  return sendSuccess(res, await meResponse(user));
}

/** PATCH /api/me */
export async function updateMe(req, res) {
  const user = await updateUserProfile(req.authUser.userId, req.body);
  return sendSuccess(res, await meResponse(user));
}

/**
 * POST /api/me/complete-onboarding — AUTH-05.
 *
 * Marks the first-action router as seen. Creates NOTHING: no candidate profile, no company, no
 * role. The choice the user made is navigation only (TRD §5.2).
 */
export async function completeOnboardingHandler(req, res) {
  const user = await completeOnboarding(req.authUser.userId);
  return sendSuccess(res, await meResponse(user));
}

export const createCandidateProfileValidation = {
  body: z.object({ headline: z.string().trim().max(200).optional() }),
};
