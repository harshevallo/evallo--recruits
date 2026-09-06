/**
 * Direct messaging — the personal surface (ADR-025).
 *
 * Every call is `/me/conversations…` because a conversation belongs to the two people in it. There
 * is no company-scoped messaging endpoint any more: a recruiter STARTS a conversation through a
 * company (`companyId` in the body of `startConversation`), and from then on it is theirs, in the
 * same inbox whichever workspace they open.
 */

import { apiClient, unwrap } from './apiClient.js';

/** My inbox: `{ conversations, unreadTotal, pendingRequests }`, newest activity first. */
export async function fetchConversations(options = {}) {
  const response = await apiClient.get('/me/conversations', { signal: options.signal });
  return unwrap(response);
}

/** The badge counts alone: `{ unreadTotal, pendingRequests }`. */
export async function fetchConversationSummary(options = {}) {
  const response = await apiClient.get('/me/conversations/summary', { signal: options.signal });
  return unwrap(response);
}

/** One conversation with its messages. Opening it marks it read for me. */
export async function fetchConversation(conversationId, options = {}) {
  const response = await apiClient.get(`/me/conversations/${conversationId}`, {
    signal: options.signal,
  });
  return unwrap(response);
}

/**
 * Starts a conversation — or continues the one the two of you already have.
 *
 * Address the other person EITHER by `recipientUserId` (someone listed on a company page) OR by
 * `candidateId` plus `companyId` (a candidate found through a company you recruit for). The server
 * decides whether the route is legitimate; the same pair of people always lands in one thread.
 *
 * @returns {Promise<{ conversationId: string, status: string, message: object, created: boolean }>}
 */
export async function startConversation({ recipientUserId, candidateId, companyId, interestId, body }) {
  const response = await apiClient.post('/me/conversations', {
    recipientUserId,
    candidateId,
    companyId,
    interestId,
    body,
  });
  return unwrap(response);
}

export async function sendMessage(conversationId, body) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/messages`, { body });
  return unwrap(response);
}

/** PRD §11.2 — accept or decline a request someone sent me. */
export async function respondToConversation(conversationId, accepted) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/respond`, {
    accepted,
  });
  return unwrap(response);
}

/** PRD §11.2 — mute / unmute, for me only. A muted thread stays readable. */
export async function setConversationMuted(conversationId, muted) {
  const response = await apiClient.put(`/me/conversations/${conversationId}/mute`, { muted });
  return unwrap(response);
}

/** PRD §8.2 — safety/reporting. Closes the thread to the other person; deletes nothing. */
export async function reportConversation(conversationId, reason) {
  const response = await apiClient.post(`/me/conversations/${conversationId}/report`, { reason });
  return unwrap(response);
}
