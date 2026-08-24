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

/* ── Profile photo (ADR-020) ─────────────────────────────────────────────────── */

/**
 * Uploads a prepared image. The Blob IS the body — not multipart.
 *
 * A photo upload carries one file and no fields, so `FormData` would add boundary encoding to
 * express nothing. `Content-Type` is overridden per-request because the shared client defaults to
 * `application/json`, which would send the wrong header for binary. The server does not trust this
 * value regardless — it sniffs the bytes — but sending an honest one keeps the parser happy.
 *
 * @param {Blob} blob            from `prepareProfilePhoto`
 * @param {(percent:number)=>void} [onProgress]
 * @returns {Promise<{user: object, capabilities: object}>} the standard /me envelope
 */
export async function uploadProfilePhoto(blob, onProgress) {
  const response = await apiClient.post('/me/photo', blob, {
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    /* Generous: the default 20s can be tight for a large photo on a slow mobile uplink. */
    timeout: 60_000,
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return unwrap(response);
}

/** Removes the uploaded photo. Idempotent, and leaves an external (Google) picture alone. */
export async function deleteProfilePhoto() {
  const response = await apiClient.delete('/me/photo');
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
