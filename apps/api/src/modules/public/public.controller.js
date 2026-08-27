/**
 * Maps HTTP to the public services. No business logic (ADR-011).
 */

import { sendSuccess, sendCreated } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { submitEarlyAccessRequest } from './earlyAccess.service.js';
import {
  listPublicCompanies,
  getDirectoryFacets,
  getPublicCompanyBySlug,
} from './companyPublic.service.js';
import { listPublicRoles, getRoleFacets, getPublicRoleById } from './rolePublic.service.js';
import { submitCompanyInterest } from '../interests/interest.service.js';

/** Attribution derived from the request. Never trusted from the client body. */
function buildSourceContext(req) {
  return {
    referrer: req.get('referer') ?? undefined,
    utm: req.query ?? {},
    landingPath: req.get('x-landing-path') ?? undefined,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

export async function createEarlyAccessRequest(req, res) {
  const result = await submitEarlyAccessRequest(req.body, buildSourceContext(req));

  /**
   * Both outcomes return success and the UI renders the same confirmation.
   *
   * Distinguishing them to the caller would turn this endpoint into an email-enumeration
   * oracle — the same reasoning that governs password reset in PRD §6.3.
   */
  return result.status === 'received'
    ? sendCreated(res, result)
    : sendSuccess(res, result);
}

/** PUB-01 — public company directory. */
export async function getCompanyDirectory(req, res) {
  const { companies, meta } = await listPublicCompanies(req.query);
  return sendSuccess(res, companies, { meta });
}

/** Facet counts for the directory filter panel. */
export async function getCompanyDirectoryFacets(_req, res) {
  return sendSuccess(res, await getDirectoryFacets());
}

/**
 * Candidate role search — one row per active hiring intent, across every publicly visible company.
 *
 * Distinct from the directory above: that returns organisations and can filter BY role, this
 * returns roles. Same visibility predicate, so a role cannot appear for a company that could not.
 */
export async function getRoles(req, res) {
  const { roles, meta } = await listPublicRoles(req.query);
  return sendSuccess(res, roles, { meta });
}

/** Facet counts for the role filter panel. */
export async function getRoleSearchFacets(_req, res) {
  return sendSuccess(res, await getRoleFacets());
}

/**
 * One role, by id.
 *
 * 404 covers "no such role", "closed" and "company not published" alike — see
 * `getPublicRoleById`. Telling them apart would leak which roles were withdrawn.
 */
export async function getRole(req, res) {
  const role = await getPublicRoleById(req.params.roleId);
  if (!role) throw ApiError.notFound('Role not found.');
  return sendSuccess(res, role);
}

/** PUB-02 — public company profile. */
export async function getCompanyProfile(req, res) {
  const company = await getPublicCompanyBySlug(req.params.slug);

  // 404 for unpublished as well as missing — distinguishing them would disclose the existence
  // of draft companies (PRD §9.3).
  if (!company) throw ApiError.notFound('Company not found.');

  return sendSuccess(res, company);
}

/** PUB-02 — express interest in a company or one of its open roles. */
export async function createCompanyInterest(req, res) {
  const result = await submitCompanyInterest(req.params.slug, req.body, {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  return result.status === 'submitted'
    ? sendCreated(res, result)
    : sendSuccess(res, result);
}
