/**
 * Public (unauthenticated) endpoint bindings.
 */

import { apiClient, unwrap, unwrapWithMeta } from './apiClient.js';

/**
 * Submit an early-access / pilot waitlist request (MKT-01).
 *
 * @param {{ segment: string, name: string, email: string }} payload
 * @returns {Promise<{ status: 'received'|'already_registered' }>}
 */
export async function submitEarlyAccess(payload) {
  const response = await apiClient.post('/public/early-access', payload, {
    headers: { 'x-landing-path': window.location.pathname },
  });
  return unwrap(response);
}

/**
 * Public company directory — PUB-01.
 *
 * @param {URLSearchParams|object} params
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function fetchPublicCompanies(params, options = {}) {
  const response = await apiClient.get('/public/companies', {
    params,
    signal: options.signal,
  });
  return unwrapWithMeta(response);
}

/**
 * Candidate role search — one result per active hiring intent, across every visible company.
 *
 * Separate from `fetchPublicCompanies`: that returns organisations and can filter by role, this
 * returns roles with their company attached as context.
 */
export async function fetchPublicRoles(params, options = {}) {
  const response = await apiClient.get('/public/roles', { params, signal: options.signal });
  return unwrapWithMeta(response);
}

/** Facet counts for the role filter panel. */
export async function fetchRoleFacets(options = {}) {
  const response = await apiClient.get('/public/roles/facets', { signal: options.signal });
  return unwrap(response);
}

/** Facet counts for the directory filter panel. */
export async function fetchDirectoryFacets(options = {}) {
  const response = await apiClient.get('/public/companies/facets', {
    signal: options.signal,
  });
  return unwrap(response);
}

/**
 * Public company profile — PUB-02.
 *
 * @param {string} slug
 * @returns {Promise<object>}
 */
export async function fetchCompanyBySlug(slug, options = {}) {
  const response = await apiClient.get(`/public/companies/${slug}`, {
    signal: options.signal,
  });
  return unwrap(response);
}

/**
 * A candidate portfolio, addressed by its share token — ADR-019.
 *
 * `skipAuth` deliberately. The share page must behave identically for a signed-out stranger and
 * for a signed-in recruiter who happens to have the link: sending an Authorization header would
 * make the page's behaviour depend on who is looking, and a 401 on it would drag the visitor
 * through the token-refresh path for a resource that needs no account at all.
 *
 * @param {string} token
 * @returns {Promise<{ profile: object, meta: { indexable: boolean, updatedAt: string|null } }>}
 */
export async function fetchSharedPortfolio(token, options = {}) {
  const response = await apiClient.get(`/portfolio/${encodeURIComponent(token)}`, {
    signal: options.signal,
    skipAuth: true,
  });
  return unwrap(response);
}

/**
 * Express interest in a company or one of its open roles — PUB-02.
 *
 * @param {string} slug
 * @param {{ name, email, message?, hiringIntentId?, consent: true }} payload
 * @returns {Promise<{ status: 'submitted'|'already_submitted' }>}
 */
export async function submitCompanyInterest(slug, payload) {
  const response = await apiClient.post(`/public/companies/${slug}/interest`, payload);
  return unwrap(response);
}
