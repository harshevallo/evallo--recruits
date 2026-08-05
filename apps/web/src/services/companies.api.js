/**
 * Authenticated company endpoints.
 */

import { apiClient, unwrap, unwrapWithMeta } from './apiClient.js';

/**
 * Create a company. The creator becomes its owner.
 * This adds a membership — it does not change who the user is.
 */
export async function createCompany(payload) {
  const response = await apiClient.post('/companies', payload);
  return unwrap(response);
}

/** Team list. Requires `member:manage` at this company. */
export async function fetchCompanyMembers(companyIdOrSlug, options = {}) {
  const response = await apiClient.get(`/companies/${companyIdOrSlug}/members`, {
    signal: options.signal,
  });
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

/** CAN-09 — PRD §11.2 accept / decline a company-initiated conversation. */
export async function respondToConversation(conversationId, accepted) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/respond`, {
    accepted,
  });
  return unwrap(response);
}

/** CAN-09 — PRD §11.2 mute / unmute. A muted thread stays readable. */
export async function setConversationMuted(conversationId, muted) {
  const response = await apiClient.put(`/me/conversations/${conversationId}/mute`, { muted });
  return unwrap(response);
}

/* ── REC-01 invitations ───────────────────────────────────────────────────────────────────── */

/** Company invitations addressed to the signed-in user. */
export async function fetchMyInvitations(options = {}) {
  const response = await apiClient.get('/me/invitations', { signal: options.signal });
  return unwrap(response);
}

export async function acceptInvitation(invitationId) {
  const response = await apiClient.post(`/me/invitations/${invitationId}/accept`);
  return unwrap(response);
}

export async function declineInvitation(invitationId) {
  const response = await apiClient.post(`/me/invitations/${invitationId}/decline`);
  return unwrap(response);
}

/* ── REC-02 setup wizard ──────────────────────────────────────────────────────────────────── */

export async function fetchCompanyEditor(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/editor`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function saveCompanyStep(companySlug, stepKey, values) {
  const response = await apiClient.patch(`/companies/${companySlug}/steps/${stepKey}`, { values });
  return unwrap(response);
}

/* ── REC-06 preview and publish ───────────────────────────────────────────────────────────── */

export async function fetchCompanyPreview(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/preview`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function publishCompany(companySlug) {
  const response = await apiClient.post(`/companies/${companySlug}/publish`);
  return unwrap(response);
}

export async function unpublishCompany(companySlug) {
  const response = await apiClient.post(`/companies/${companySlug}/unpublish`);
  return unwrap(response);
}

/* ── REC-07 team invitations ──────────────────────────────────────────────────────────────── */

/** Outstanding invitations for a company. Requires `member:manage`. */
export async function fetchCompanyInvitations(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/invitations`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function inviteTeamMember(companySlug, { email, role }) {
  const response = await apiClient.post(`/companies/${companySlug}/invitations`, { email, role });
  return unwrap(response);
}

export async function resendCompanyInvitation(companySlug, invitationId) {
  const response = await apiClient.post(
    `/companies/${companySlug}/invitations/${invitationId}/resend`,
  );
  return unwrap(response);
}

export async function cancelCompanyInvitation(companySlug, invitationId) {
  const response = await apiClient.post(
    `/companies/${companySlug}/invitations/${invitationId}/cancel`,
  );
  return unwrap(response);
}

/* ── REC-08 team management · REC-09 ownership transfer ───────────────────────────────────── */

/** Change one member's role. Requires `member:manage`; owner changes also need `company:transfer`. */
export async function changeMemberRole(companySlug, memberId, role) {
  const response = await apiClient.patch(`/companies/${companySlug}/members/${memberId}`, { role });
  return response.data.data;
}

/** Remove a member. The row is retained as `removed` — access is revoked, history is not. */
export async function removeCompanyMember(companySlug, memberId) {
  const response = await apiClient.delete(`/companies/${companySlug}/members/${memberId}`);
  return response.data.data;
}

/** REC-09 — hand ownership to another active member. The caller becomes an admin. */
export async function transferCompanyOwnership(companySlug, memberId) {
  const response = await apiClient.post(
    `/companies/${companySlug}/members/${memberId}/transfer-ownership`,
  );
  return response.data.data;
}

/* ── REC-10 company home ──────────────────────────────────────────────────────────────────── */

/** The company dashboard. Open to any active member; sections vary by permission. */
export async function fetchCompanyDashboard(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/dashboard`, {
    signal: options.signal,
  });
  return response.data.data;
}

/* ── REC-11 interest inbox ────────────────────────────────────────────────────────────────── */

/**
 * The company's interest inbox. Requires `interest:view`, which PRD §4.2 grants to every role.
 *
 * Pagination meta arrives beside `data` in the envelope, so it is merged in here rather than
 * being quietly dropped by the usual `data`-only unwrap.
 */
export async function fetchCompanyInterests(companySlug, params = {}, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/interests`, {
    params,
    signal: options.signal,
  });
  const { data, meta } = unwrapWithMeta(response);
  return { ...data, meta };
}

/** Move an interest along. `withdrawn` is not settable here — that is the candidate's decision. */
export async function updateInterestStatus(companySlug, interestId, status) {
  const response = await apiClient.patch(`/companies/${companySlug}/interests/${interestId}`, {
    status,
  });
  return response.data.data;
}

/** Marks `submitted → viewed` on open. Never drags a further-along status backwards. */
export async function markInterestViewed(companySlug, interestId) {
  const response = await apiClient.post(
    `/companies/${companySlug}/interests/${interestId}/viewed`,
  );
  return response.data.data;
}
