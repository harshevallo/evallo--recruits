import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { CandidateProfile } from './candidateProfile.model.js';

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

  const existing = await CandidateProfile.findOne({ userId: user._id });
  // Idempotent: returning the existing profile is friendlier than a conflict, and the unique
  // index means a duplicate was never possible anyway.
  if (existing) return sendSuccess(res, existing.toOwnerView());

  const profile = await CandidateProfile.create({
    userId: user._id,
    headline: req.body?.headline,
    lastActiveAt: new Date(),
  });

  return sendCreated(res, profile.toOwnerView());
}

/** GET /api/me/candidate-profile */
export async function getCandidateProfile(req, res) {
  const user = await requireAppUser(req);
  const profile = await CandidateProfile.findOne({ userId: user._id });

  if (!profile) throw ApiError.notFound('You have not created a candidate profile yet.');

  return sendSuccess(res, profile.toOwnerView());
}
