/**
 * User profile updates — AUTH-01.
 *
 * Account provisioning now happens in auth.service (signup / googleAuth). This module holds the
 * self-service profile edit.
 */

import { ApiError } from '../../lib/ApiError.js';
import { User } from './user.model.js';

/** Updates the fields a user may edit on their own profile. */
export async function updateUserProfile(userId, updates) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found.');

  // Allowlist: email, password, provider, platformRole, and status are never client-settable here.
  const allowed = ['name', 'headline', 'profilePicture', 'location', 'languages'];
  for (const field of allowed) {
    if (updates[field] !== undefined) user[field] = updates[field];
  }

  await user.save();
  return user;
}

/**
 * AUTH-05 — records that the first-action router has been dismissed.
 *
 * Deliberately a dedicated call rather than a field on PATCH /api/me: the client can only stamp
 * "now", never an arbitrary value, and it cannot be un-set. Idempotent — the first stamp wins, so
 * a re-submission or a second tab does not move the timestamp.
 */
export async function completeOnboarding(userId) {
  const user = await User.findOneAndUpdate(
    { _id: userId, onboardingCompletedAt: { $exists: false } },
    { $set: { onboardingCompletedAt: new Date() } },
    { new: true },
  );

  // Already stamped — return the existing user unchanged.
  if (user) return user;

  const existing = await User.findById(userId);
  if (!existing) throw ApiError.notFound('User not found.');
  return existing;
}
