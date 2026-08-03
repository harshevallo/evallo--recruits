/**
 * Authenticated company endpoints.
 */

import { apiClient, unwrap } from './apiClient.js';

/**
 * Create a company. The creator becomes its owner.
 * This adds a membership — it does not change who the user is.
 */
export async function createCompany(payload) {
  const response = await apiClient.post('/companies', payload);
  return unwrap(response);
}

/** Team list. Requires `member:manage` at this company. */
export async function fetchCompanyMembers(companyIdOrSlug) {
  const response = await apiClient.get(`/companies/${companyIdOrSlug}/members`);
  return unwrap(response);
}

/** Start a candidate profile for the current user. */
export async function createCandidateProfile(payload = {}) {
  const response = await apiClient.post('/me/candidate-profile', payload);
  return unwrap(response);
}

/**
 * CAN-01 candidate home — the profile plus its derived completeness and pending actions.
 * Same endpoint as the plain profile read; the derived parts come from the server so the rules
 * live in one place.
 */
export async function fetchCandidateHome(options = {}) {
  const response = await apiClient.get('/me/candidate-profile', { signal: options.signal });
  return unwrap(response);
}

/** CAN-02 — the profile builder state (sections, questions, values, completion). */
export async function fetchProfileBuilder(options = {}) {
  const response = await apiClient.get('/me/candidate-profile/builder', {
    signal: options.signal,
  });
  return unwrap(response);
}

/** CAN-02 — save one section. Returns the refreshed builder state. */
export async function saveProfileSection(sectionKey, values) {
  const response = await apiClient.patch(`/me/candidate-profile/sections/${sectionKey}`, {
    values,
  });
  return unwrap(response);
}

/* ── CAN-03 preview and publish ────────────────────────────────────────────────────────────── */

export async function fetchProfilePreview(options = {}) {
  const response = await apiClient.get('/me/candidate-profile/preview', { signal: options.signal });
  return unwrap(response);
}

export async function publishProfile(status) {
  const response = await apiClient.post('/me/candidate-profile/publish', status ? { status } : {});
  return unwrap(response);
}

/* ── CAN-04 visibility ─────────────────────────────────────────────────────────────────────── */

export async function fetchVisibility(options = {}) {
  const response = await apiClient.get('/me/candidate-profile/visibility', {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function updateVisibility(changes) {
  const response = await apiClient.patch('/me/candidate-profile/visibility', changes);
  return unwrap(response);
}

export async function unblockCompany(companyId) {
  const response = await apiClient.delete(`/me/candidate-profile/blocked-companies/${companyId}`);
  return unwrap(response);
}

/* ── CAN-06 company relationship ───────────────────────────────────────────────────────────── */

export async function fetchCompanyRelationship(slug, options = {}) {
  const response = await apiClient.get(`/me/companies/${slug}/relationship`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function saveCompany(slug) {
  const response = await apiClient.put(`/me/companies/${slug}/saved`);
  return unwrap(response);
}

export async function unsaveCompany(slug) {
  const response = await apiClient.delete(`/me/companies/${slug}/saved`);
  return unwrap(response);
}

/* ── CAN-07 interest ───────────────────────────────────────────────────────────────────────── */

export async function fetchConsentDisclosure(options = {}) {
  const response = await apiClient.get('/me/interests/consent-disclosure', {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function submitCandidateInterest(slug, payload) {
  const response = await apiClient.post(`/me/companies/${slug}/interest`, payload);
  return unwrap(response);
}

/* ── CAN-08 my interests ───────────────────────────────────────────────────────────────────── */

export async function fetchMyInterests(options = {}) {
  const response = await apiClient.get('/me/interests', { signal: options.signal });
  return unwrap(response);
}

export async function withdrawInterest(interestId) {
  const response = await apiClient.post(`/me/interests/${interestId}/withdraw`);
  return unwrap(response);
}

/* ── CAN-09 messages ───────────────────────────────────────────────────────────────────────── */

export async function fetchConversations(options = {}) {
  const response = await apiClient.get('/me/conversations', { signal: options.signal });
  return unwrap(response);
}

export async function fetchConversation(conversationId, options = {}) {
  const response = await apiClient.get(`/me/conversations/${conversationId}`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function sendReply(conversationId, body) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/messages`, { body });
  return unwrap(response);
}

export async function reportConversation(conversationId, reason) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/report`, { reason });
  return unwrap(response);
}
