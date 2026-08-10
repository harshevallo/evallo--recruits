/**
 * CAN-02 evidence entries — experience and education (PRD §8.3, ADR-008).
 *
 * One set of handlers for both kinds; `:kind` selects the collection. The service refuses an
 * unknown kind, so the route cannot be used to reach anything that is not an entry collection.
 */

import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { CandidateProfile } from './candidateProfile.model.js';
import * as entries from './profileEntry.service.js';

/**
 * The caller's own candidate profile.
 *
 * Resolved from the session, never from a parameter — an entry belongs to the person editing it,
 * and taking an id here is what would make somebody else's history reachable.
 */
async function requireOwnProfile(req) {
  const user = await User.findById(req.authUser.userId).select('_id').lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  const profile = await CandidateProfile.findOne({ userId: user._id });
  if (!profile) throw ApiError.notFound('You do not have a candidate profile yet.');

  return profile;
}

/** GET /api/me/candidate-profile/entries/:kind */
export async function listEntries(req, res) {
  const profile = await requireOwnProfile(req);
  return sendSuccess(res, { entries: await entries.listEntries(profile, req.params.kind) });
}

/** POST /api/me/candidate-profile/entries/:kind */
export async function createEntry(req, res) {
  const profile = await requireOwnProfile(req);
  const entry = await entries.createEntry(profile, req.params.kind, req.body);
  return sendCreated(res, { entry });
}

/** PATCH /api/me/candidate-profile/entries/:kind/:entryId */
export async function updateEntry(req, res) {
  const profile = await requireOwnProfile(req);
  const entry = await entries.updateEntry(profile, req.params.kind, req.params.entryId, req.body);
  return sendSuccess(res, { entry });
}

/** DELETE /api/me/candidate-profile/entries/:kind/:entryId */
export async function removeEntry(req, res) {
  const profile = await requireOwnProfile(req);
  return sendSuccess(res, await entries.removeEntry(profile, req.params.kind, req.params.entryId));
}
