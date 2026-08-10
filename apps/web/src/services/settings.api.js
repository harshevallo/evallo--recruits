/**
 * SET-01 account settings endpoints (PRD Appendix A, §15, §16.1).
 *
 * Account identity only. Candidate professional visibility lives in `companies.api.js`
 * (`fetchVisibility` / `updateVisibility`) and is NOT duplicated here — the settings screen links to
 * that authority rather than re-implementing it.
 */

import { apiClient, unwrap } from './apiClient.js';

export async function fetchNotificationPreferences(options = {}) {
  const response = await apiClient.get('/me/settings/notifications', { signal: options.signal });
  return unwrap(response);
}

/** `preferences` is `{ eventKey: { email, inApp } }`. Locked events are refused by the server. */
export async function updateNotificationPreferences(preferences) {
  const response = await apiClient.patch('/me/settings/notifications', { preferences });
  return unwrap(response);
}

/** Requires the current password: an authenticated session alone must not be able to lock you out. */
export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const response = await apiClient.post('/me/settings/password', {
    currentPassword,
    newPassword,
    confirmPassword,
  });
  return unwrap(response);
}

export async function fetchSessions(options = {}) {
  const response = await apiClient.get('/me/settings/sessions', { signal: options.signal });
  return unwrap(response);
}

export async function signOutOtherSessions() {
  const response = await apiClient.post('/me/settings/sessions/sign-out-others');
  return unwrap(response);
}

export async function fetchSignInMethods(options = {}) {
  const response = await apiClient.get('/me/settings/sign-in-methods', { signal: options.signal });
  return unwrap(response);
}

/**
 * Downloads the export.
 *
 * Requested as a blob and saved client-side: the endpoint returns a file rather than an envelope, so
 * `unwrap` would corrupt it.
 */
export async function downloadAccountData() {
  const response = await apiClient.get('/me/settings/export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/json' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = 'evallo-recruit-data.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);

  return { downloaded: true };
}

/** Marks the account for deletion and signs every session out. Retention still applies (§16.1). */
export async function requestAccountDeletion(password) {
  const response = await apiClient.post('/me/settings/delete', password ? { password } : {});
  return unwrap(response);
}
