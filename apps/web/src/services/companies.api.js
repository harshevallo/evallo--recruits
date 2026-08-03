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
