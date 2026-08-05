import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { createCompany, listCompanyMembers } from './company.service.js';
import * as companyService from './company.service.js';
import {
  serialisePublicCompany,
  findActiveIntents,
} from '../public/companyPublic.service.js';
import { getCompanyDashboard } from './dashboard.service.js';

async function requireAppUser(req) {
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/** POST /api/companies — create a company and become its owner. */
export async function postCompany(req, res) {
  const user = await requireAppUser(req);
  const company = await createCompany(user._id, req.body);

  return sendCreated(res, {
    id: String(company._id),
    name: company.name,
    slug: company.slug,
    status: company.status,
    // The creator is always the owner. Returned so the client can update context immediately.
    role: 'owner',
  });
}

/** GET /api/companies/:companyId/members — requires membership + member:manage. */
export async function getCompanyMembers(req, res) {
  const members = await listCompanyMembers(req.company._id);

  return sendSuccess(res, {
    company: { id: String(req.company._id), name: req.company.name, slug: req.company.slug },
    // Echoed so the caller can see the role this response was authorised by.
    yourRole: req.membership.role,
    members,
  });
}

/* ── REC-02 setup wizard ──────────────────────────────────────────────────────────────────── */

/** GET /api/companies/:companyId/editor — current values, step progress, publish blockers. */
export async function getCompanyEditor(req, res) {
  return sendSuccess(res, await companyService.getCompanyEditor(req.params.companyId));
}

/** PATCH /api/companies/:companyId/steps/:stepKey — save one wizard step. */
export async function saveCompanyStep(req, res) {
  return sendSuccess(
    res,
    await companyService.saveCompanyStep(
      req.params.companyId,
      req.params.stepKey,
      req.body?.values ?? {},
    ),
  );
}

/* ── REC-06 preview and publish ───────────────────────────────────────────────────────────── */

/**
 * GET /api/companies/:companyId/preview — the page exactly as the public will see it.
 *
 * Uses the SAME serialiser as PUB-02 (`serialisePublicCompany`), so what a recruiter reviews is
 * what gets published. Only reachability differs: this route requires `company:edit`, whereas the
 * public route requires the company to be published.
 */
export async function getCompanyPreview(req, res) {
  const company = await companyService.findCompany(req.params.companyId);
  const intents = await findActiveIntents(company._id);

  return sendSuccess(res, {
    preview: serialisePublicCompany(company.toObject(), intents),
    publish: companyService.buildPublishChecklist(company),
    status: company.status,
    publishedAt: company.publishedAt ?? null,
    publicUrl: `/companies/${company.slug}`,
  });
}

/** POST /api/companies/:companyId/publish */
export async function publishCompany(req, res) {
  const company = await companyService.publishCompany(req.params.companyId);
  return sendSuccess(res, {
    status: company.status,
    publishedAt: company.publishedAt,
    slug: company.slug,
  });
}

/** POST /api/companies/:companyId/unpublish */
export async function unpublishCompany(req, res) {
  const company = await companyService.unpublishCompany(req.params.companyId);
  return sendSuccess(res, { status: company.status, slug: company.slug });
}

/* ── REC-10 company home ──────────────────────────────────────────────────────────────────── */

/**
 * GET /api/companies/:companyId/dashboard
 *
 * Open to any ACTIVE member — the company home is the landing page after switching context, and
 * a viewer with no access to it would have nowhere to land. Which SECTIONS come back is decided
 * per permission inside the service.
 */
export async function getDashboard(req, res) {
  return sendSuccess(res, await getCompanyDashboard(req.company, req.membership));
}
