/**
 * Public company directory — PUB-01 (PRD §9.1).
 *
 * Reads ONLY published, unrestricted companies and their active hiring intents.
 * This module may never touch a candidate collection (PRD §21.2).
 */

import {
  COMPANY_STATUS,
  MODERATION_STATUS,
  HIRING_INTENT_STATUS,
  COMPANY_DIRECTORY_SORTS,
} from '@evallo/shared';
import { Company, companyInitials } from '../companies/company.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';

/**
 * The public visibility predicate. Every directory query starts from this — a company is
 * publicly listable only when published and not moderation-restricted (PRD §9.3).
 */
function publiclyVisible() {
  return {
    status: COMPANY_STATUS.PUBLISHED,
    moderationStatus: { $in: [MODERATION_STATUS.NONE, null] },
  };
}

/** Fields safe to serve anonymously. Nothing else leaves this module. */
const PUBLIC_FIELDS =
  'name slug organizationType tagline logoUrl location educationServices subjects ' +
  'deliveryModes isCurrentlyHiring acceptsGeneralInterest description.short updatedAt';

function buildFilter(query) {
  const filter = publiclyVisible();

  if (query.q) filter.$text = { $search: query.q };
  if (query.organizationType) filter.organizationType = { $in: query.organizationType };
  if (query.service) filter.educationServices = { $in: query.service };
  if (query.deliveryMode) filter.deliveryModes = { $in: query.deliveryMode };
  if (query.country) filter['location.country'] = query.country;
  if (query.hiringOnly) filter.isCurrentlyHiring = true;

  return filter;
}

function buildSort(query) {
  if (query.sort === COMPANY_DIRECTORY_SORTS.NAME) return { name: 1 };
  if (query.sort === COMPANY_DIRECTORY_SORTS.RECENT) return { updatedAt: -1 };
  // Relevance: text score when searching, otherwise hiring companies first.
  if (query.q) return { score: { $meta: 'textScore' }, updatedAt: -1 };
  return { isCurrentlyHiring: -1, updatedAt: -1 };
}

/**
 * Companies matching a `roleCategory` filter, resolved through their ACTIVE hiring intents.
 * Returns null when the filter is not in play, so the caller can skip the extra stage.
 */
async function companyIdsForRoleCategories(roleCategories) {
  if (!roleCategories) return null;

  return HiringIntent.distinct('companyId', {
    status: HIRING_INTENT_STATUS.ACTIVE,
    roleCategories: { $in: roleCategories },
  });
}

/**
 * Paginated directory listing with each company's active hiring roles attached.
 *
 * @param {object} query  Already validated by companyDirectoryQuerySchema
 */
export async function listPublicCompanies(query) {
  const filter = buildFilter(query);

  const roleFilteredIds = await companyIdsForRoleCategories(query.roleCategory);
  if (roleFilteredIds) {
    if (roleFilteredIds.length === 0) {
      return { companies: [], meta: { page: query.page, limit: query.limit, total: 0, totalPages: 1, hasMore: false } };
    }
    filter._id = { $in: roleFilteredIds };
  }

  const skip = (query.page - 1) * query.limit;

  const projection = query.q
    ? { score: { $meta: 'textScore' } }
    : {};

  const [companies, total] = await Promise.all([
    Company.find(filter, projection)
      .select(PUBLIC_FIELDS)
      .sort(buildSort(query))
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Company.countDocuments(filter),
  ]);

  // `.lean()` does not run virtuals, so `initials` — the avatar fallback for a company with no
  // logo (PRD §7.3 makes the logo optional) — has to be computed here.
  const withRoles = (await attachActiveRoles(companies)).map((company) => ({
    ...company,
    initials: companyInitials(company.name),
  }));

  return {
    companies: withRoles,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasMore: query.page * query.limit < total,
    },
  };
}

/**
 * Attaches active hiring roles to each company in one query rather than N.
 * PRD §7.4: the public page shows role categories, employment types, and delivery mode.
 */
async function attachActiveRoles(companies) {
  if (companies.length === 0) return [];

  const ids = companies.map((c) => c._id);

  const intents = await HiringIntent.find({
    companyId: { $in: ids },
    status: HIRING_INTENT_STATUS.ACTIVE,
  })
    .select('companyId title roleCategories employmentTypes deliveryModes locations')
    .lean();

  const byCompany = new Map();
  for (const intent of intents) {
    const key = String(intent.companyId);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(intent);
  }

  return companies.map((company) => {
    const roles = byCompany.get(String(company._id)) ?? [];
    return {
      ...company,
      id: String(company._id),
      activeRoles: roles.map((r) => ({
        id: String(r._id),
        title: r.title ?? null,
        roleCategories: r.roleCategories ?? [],
        employmentTypes: r.employmentTypes ?? [],
        deliveryModes: r.deliveryModes ?? [],
      })),
      activeRoleCount: roles.length,
    };
  });
}

/**
 * Full public company profile — PUB-02 (PRD §7.4, §13).
 *
 * Returns null when the company is not publicly visible, so the caller can 404 without
 * distinguishing "does not exist" from "not published".
 *
 * @param {string} slug
 */
export async function getPublicCompanyBySlug(slug) {
  const company = await Company.findOne({ ...publiclyVisible(), slug })
    .select(
      'name slug organizationType tagline logoUrl coverImageUrl website foundingYear sizeRange ' +
        'location locations serviceRegions deliveryModes educationServices subjects ' +
        'description isCurrentlyHiring acceptsGeneralInterest publicContact verifiedDomains ' +
        'seo createdAt updatedAt',
    )
    .lean();

  if (!company) return null;

  company.initials = companyInitials(company.name);

  const intents = await HiringIntent.find({
    companyId: company._id,
    status: HIRING_INTENT_STATUS.ACTIVE,
  })
    .select(
      'title roleCategories specializations employmentTypes deliveryModes locations ' +
        'experienceLevels minYears availability compensation description createdAt',
    )
    .sort({ createdAt: -1 })
    .lean();

  return {
    ...company,
    id: String(company._id),
    isVerified: (company.verifiedDomains ?? []).length > 0,
    // Never expose the raw verification records publicly — only the resulting badge.
    verifiedDomains: undefined,
    openRoles: intents.map((intent) => ({
      ...intent,
      id: String(intent._id),
      _id: undefined,
      compensation:
        intent.compensation?.visibility === 'public' ? intent.compensation : undefined,
    })),
    openRoleCount: intents.length,
  };
}

/**
 * Facet counts for the filter panel, computed against the same public visibility predicate.
 * Kept independent of the current filters so counts stay stable while the user refines.
 */
export async function getDirectoryFacets() {
  const base = publiclyVisible();

  const [byType, byService, byDelivery, byCountry, hiringCount, total] = await Promise.all([
    Company.aggregate([{ $match: base }, { $group: { _id: '$organizationType', count: { $sum: 1 } } }]),
    Company.aggregate([
      { $match: base },
      { $unwind: '$educationServices' },
      { $group: { _id: '$educationServices', count: { $sum: 1 } } },
    ]),
    Company.aggregate([
      { $match: base },
      { $unwind: '$deliveryModes' },
      { $group: { _id: '$deliveryModes', count: { $sum: 1 } } },
    ]),
    Company.aggregate([{ $match: base }, { $group: { _id: '$location.country', count: { $sum: 1 } } }]),
    Company.countDocuments({ ...base, isCurrentlyHiring: true }),
    Company.countDocuments(base),
  ]);

  const toMap = (rows) =>
    Object.fromEntries(rows.filter((r) => r._id).map((r) => [r._id, r.count]));

  return {
    organizationType: toMap(byType),
    service: toMap(byService),
    deliveryMode: toMap(byDelivery),
    country: toMap(byCountry),
    hiring: hiringCount,
    total,
  };
}
