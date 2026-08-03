/**
 * Authenticated user endpoints — AUTH-01.
 * Every call requires a valid access token, attached by apiClient.
 */

import { apiClient, unwrap } from './apiClient.js';

/** The current user plus derived capabilities (candidate profile, company memberships). */
export async function fetchCurrentUser() {
  const response = await apiClient.get('/me');
  return unwrap(response);
}

/** Update the current user's own profile. */
export async function updateCurrentUser(updates) {
  const response = await apiClient.patch('/me', updates);
  return unwrap(response);
}

/**
 * AUTH-05 — records that the first-action router has been seen, so it never shows again.
 * Creates nothing; the user's choice is a redirect, not a role.
 */
export async function completeOnboarding() {
  const response = await apiClient.post('/me/complete-onboarding');
  return unwrap(response);
}
