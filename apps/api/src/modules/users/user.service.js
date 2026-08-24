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

  /*
   * Allowlist: email, password, provider, platformRole, and status are never client-settable here.
   *
   * `phone` and `phoneCountry` were added 2026-08-24. `phone` had been missing since SET-01
   * shipped, which meant the settings form rendered a phone input, `updateProfileValidation`
   * accepted the value, and this loop then dropped it — the field looked editable and silently
   * saved nothing. Verified by calling this function directly: `name` persisted, `phone` came back
   * `undefined`.
   *
   * `profilePicture` was REMOVED from this list on 2026-08-24, when upload shipped (ADR-020).
   * It is now written in exactly two places — `auth.service` on Google sign-in, and
   * `media.service` on upload — both of which set a URL this system controls. While it sat here, a
   * client could PATCH it to any URL that parsed, and that value is rendered as an `<img src>` on
   * recruiter screens: an arbitrary third-party fetch from another user's browser, logging their IP
   * on request. No client ever sent the field, so removing it changes no behaviour.
   */
  const allowed = [
    'name',
    'headline',
    'phone',
    'phoneCountry',
    'location',
    'languages',
    'accountLanguages',
  ];
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
