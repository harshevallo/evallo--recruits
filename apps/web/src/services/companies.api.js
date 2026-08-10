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

/* ── SET-02 company settings ──────────────────────────────────────────────────────────────── */

/**
 * The company's own audit trail (PRD §14.3, §16.1). Requires `company:settings`.
 *
 * Pagination meta arrives beside `data`, so it is merged in rather than dropped by the usual
 * `data`-only unwrap.
 */
export async function fetchCompanyAudit(companySlug, params = {}, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/audit`, {
    params,
    signal: options.signal,
  });
  const { data, meta } = unwrapWithMeta(response);
  return { ...data, meta };
}

/* ── REC-01 company search and join requests ──────────────────────────────────────────────── */

/**
 * Find a company to join. Published companies only — an unpublished one is not discoverable, so
 * the honest route into it is an invitation from someone already inside.
 *
 * Each row carries a `relationship` (`none` | `member` | `invited` | `requested`) so the selector
 * offers the right action instead of letting someone request what they already have.
 */
export async function searchCompanies(q, options = {}) {
  const response = await apiClient.get('/companies/search', {
    params: { q, limit: options.limit ?? 10 },
    signal: options.signal,
  });
  return unwrap(response);
}

/** Ask to join. Idempotent — asking twice returns the same pending request. */
export async function requestToJoinCompany(companyId, { message, requestedRole } = {}) {
  const response = await apiClient.post(`/companies/${companyId}/join-requests`, {
    message,
    requestedRole,
  });
  return unwrap(response);
}

/** My outstanding requests, so a pending ask stays visible. */
export async function fetchMyJoinRequests(options = {}) {
  const response = await apiClient.get('/me/join-requests', { signal: options.signal });
  return unwrap(response);
}

export async function withdrawJoinRequest(requestId) {
  const response = await apiClient.post(`/me/join-requests/${requestId}/withdraw`);
  return unwrap(response);
}

/** The approver's queue. Requires `member:manage`. */
export async function fetchCompanyJoinRequests(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/join-requests`, {
    params: { includeResolved: String(options.includeResolved ?? false) },
    signal: options.signal,
  });
  return unwrap(response);
}

/** Approving grants an ACTIVE membership with the role the APPROVER chose, never the requester. */
export async function approveJoinRequest(companySlug, requestId, role) {
  const response = await apiClient.post(
    `/companies/${companySlug}/join-requests/${requestId}/approve`,
    role ? { role } : {},
  );
  return unwrap(response);
}

export async function declineJoinRequest(companySlug, requestId) {
  const response = await apiClient.post(
    `/companies/${companySlug}/join-requests/${requestId}/decline`,
  );
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

/* ── REC-12 talent search ─────────────────────────────────────────────────────────────────── */

/**
 * Search candidates this company may discover. Requires `candidate:search`.
 *
 * Pagination meta arrives beside `data` in the envelope, so it is merged in here rather than
 * being quietly dropped by the usual `data`-only unwrap.
 */
export async function searchCandidates(companySlug, params = {}, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/search/candidates`, {
    params,
    signal: options.signal,
  });
  const { data, meta } = unwrapWithMeta(response);
  return { ...data, meta };
}

/* ── REC-13 candidate viewer ──────────────────────────────────────────────────────────────── */

/**
 * One candidate, as this company is permitted to see them. Requires `candidate:view`.
 *
 * `source` records how the recruiter arrived, which PRD §21.4 requires in the access log — so it
 * is passed deliberately rather than defaulted away.
 */
export async function fetchCandidate(companySlug, candidateId, source = 'direct', options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/candidates/${candidateId}`, {
    params: { source },
    signal: options.signal,
  });
  return response.data.data;
}

/* ── REC-05 / REC-16 hiring intents ───────────────────────────────────────────────────────── */

/** Every intent, including closed and archived. Any active member may read. */
export async function fetchHiringIntents(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/hiring-intents`, {
    signal: options.signal,
  });
  return unwrap(response);
}

/** Creates a DRAFT. Activating is a separate, audited step. Requires `hiring:manage`. */
export async function createHiringIntent(companySlug, values) {
  const response = await apiClient.post(`/companies/${companySlug}/hiring-intents`, values);
  return unwrap(response);
}

export async function updateHiringIntent(companySlug, intentId, values) {
  const response = await apiClient.patch(
    `/companies/${companySlug}/hiring-intents/${intentId}`,
    values,
  );
  return unwrap(response);
}

/** Activate / pause / close / archive. `reason` is kept with the audit record. */
export async function changeHiringIntentStatus(companySlug, intentId, status, reason = null) {
  const response = await apiClient.patch(
    `/companies/${companySlug}/hiring-intents/${intentId}/status`,
    { status, reason },
  );
  return unwrap(response);
}

/* ── REC-14 pipeline ──────────────────────────────────────────────────────────────────────── */

/** The board: every stage in PRD §7.9 order, each with its entries. Requires `pipeline:view`. */
export async function fetchPipeline(companySlug, { includeClosed = false } = {}, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/pipeline`, {
    params: { includeClosed: String(includeClosed) },
    signal: options.signal,
  });
  return unwrap(response);
}

/** Idempotent: a candidate already in an active entry returns that entry rather than duplicating. */
export async function addToPipeline(companySlug, payload) {
  const response = await apiClient.post(`/companies/${companySlug}/pipeline`, payload);
  return unwrap(response);
}

/**
 * Moves an entry. `reasonCode` is required for `rejected` and `outcome.roleTitle` for `hired` —
 * the server enforces both, so a caller cannot skip them by omitting the field.
 */
export async function changePipelineStage(companySlug, entryId, payload) {
  const response = await apiClient.patch(
    `/companies/${companySlug}/pipeline/${entryId}/stage`,
    payload,
  );
  return unwrap(response);
}

/** Basic assignment. `null` unassigns. */
export async function assignPipelineEntry(companySlug, entryId, ownerId) {
  const response = await apiClient.patch(`/companies/${companySlug}/pipeline/${entryId}/owner`, {
    ownerId,
  });
  return unwrap(response);
}

export async function updatePipelineEntry(companySlug, entryId, values) {
  const response = await apiClient.patch(`/companies/${companySlug}/pipeline/${entryId}`, values);
  return unwrap(response);
}

/* ── Shortlist ────────────────────────────────────────────────────────────────────────────── */

export async function fetchSavedCandidates(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/saved-candidates`, {
    signal: options.signal,
  });
  return unwrap(response);
}

/** Saving is silent to the candidate — PRD §21.4. No notification is raised anywhere. */
export async function saveCandidate(companySlug, candidateId) {
  const response = await apiClient.post(`/companies/${companySlug}/saved-candidates`, {
    candidateId,
  });
  return unwrap(response);
}

export async function unsaveCandidate(companySlug, candidateId) {
  const response = await apiClient.delete(
    `/companies/${companySlug}/saved-candidates/${candidateId}`,
  );
  return unwrap(response);
}

/* ── Internal notes ───────────────────────────────────────────────────────────────────────── */

/** Company-private. There is no candidate-facing counterpart, by design (PRD §21.4). */
export async function fetchCandidateNotes(companySlug, candidateId, options = {}) {
  const response = await apiClient.get(
    `/companies/${companySlug}/candidates/${candidateId}/notes`,
    { signal: options.signal },
  );
  return unwrap(response);
}

export async function createCandidateNote(companySlug, candidateId, body) {
  const response = await apiClient.post(
    `/companies/${companySlug}/candidates/${candidateId}/notes`,
    { body },
  );
  return unwrap(response);
}

export async function deleteCandidateNote(companySlug, noteId) {
  const response = await apiClient.delete(`/companies/${companySlug}/notes/${noteId}`);
  return unwrap(response);
}

/* ── REC-15 company messaging ─────────────────────────────────────────────────────────────── */

export async function fetchCompanyConversations(companySlug, options = {}) {
  const response = await apiClient.get(`/companies/${companySlug}/conversations`, {
    signal: options.signal,
  });
  return unwrap(response);
}

export async function fetchCompanyConversation(companySlug, conversationId, options = {}) {
  const response = await apiClient.get(
    `/companies/${companySlug}/conversations/${conversationId}`,
    { signal: options.signal },
  );
  return unwrap(response);
}

export async function sendCompanyReply(companySlug, conversationId, body) {
  const response = await apiClient.post(
    `/companies/${companySlug}/conversations/${conversationId}/messages`,
    { body },
  );
  return unwrap(response);
}

/**
 * Opens a thread with a candidate, or continues the existing one.
 *
 * `{ candidateId, companyId }` is unique, so a second "message" from a search result continues the
 * conversation rather than forking it — which is what a recruiter expects and what the schema
 * requires.
 */
export async function startCompanyConversation(companySlug, { candidateId, body, interestId }) {
  const response = await apiClient.post(`/companies/${companySlug}/conversations`, {
    candidateId,
    body,
    interestId,
  });
  return unwrap(response);
}
