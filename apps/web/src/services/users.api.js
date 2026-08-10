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

/* ── CAN-02 evidence entries — experience and education (PRD §8.3, ADR-008) ───────────────── */

/** Entries of one kind for the signed-in candidate. */
export async function fetchProfileEntries(kind, options = {}) {
  const response = await apiClient.get(`/me/candidate-profile/entries/${kind}`, {
    signal: options.signal,
  });
  return response.data.data.entries;
}

export async function createProfileEntry(kind, values) {
  const response = await apiClient.post(`/me/candidate-profile/entries/${kind}`, values);
  return response.data.data.entry;
}

/** Partial by design — editing one field must not require resending the rest. */
export async function updateProfileEntry(kind, entryId, values) {
  const response = await apiClient.patch(
    `/me/candidate-profile/entries/${kind}/${entryId}`,
    values,
  );
  return response.data.data.entry;
}

export async function deleteProfileEntry(kind, entryId) {
  const response = await apiClient.delete(`/me/candidate-profile/entries/${kind}/${entryId}`);
  return response.data.data;
}
