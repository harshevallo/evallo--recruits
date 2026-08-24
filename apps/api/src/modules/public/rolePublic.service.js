/**
 * Public ROLE search — the candidate's "Search for Roles".
 *
 * A sibling of `companyPublic.service.js`, in the same module and under the same hard boundary:
 * this file may never import or query a candidate collection (PRD §21.2). Hiring intents are
 * company data, so they belong here.
 *
 * ── Why a separate service and not a flag on the directory ────────────────────────────────────
 *
 * The company directory already filters BY role category — but its unit of result is an
 * organisation, and a role is a tag on it. This returns roles, one row per hiring intent, with the
 * company attached as context. Different unit, different sort, different facets, different card.
 * Bolting a mode flag onto `listPublicCompanies` would have made one function answer two questions.
 *
 * ── Visibility is inherited, never re-implemented ─────────────────────────────────────────────
 *
 * A role surfaces only when BOTH are true:
 *
 *   · the intent is `active`
 *   · its company passes `publiclyVisible()` — the SAME predicate the directory and PUB-02 use
 *
 * The second is why this resolves visible companies first and then queries intents within them,
 * rather than querying intents and filtering afterwards. Unpublishing a company removes every one
 * of its roles from search with no second rule to remember, and there is no code path here that
 * can return an intent whose company was not first proved visible.
 */

import { HIRING_INTENT_STATUS } from '@evallo/shared';
import { Company, companyInitials } from '../companies/company.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { publiclyVisible } from './companyPublic.service.js';

/**
 * Fields of the COMPANY a role result carries.
 *
 * Branding and identity only — enough to render "which organisation is this" and to link onward.
 * Never `publicContact`, never moderation state, never anything a recruiter typed privately.
 */
const COMPANY_CARD_FIELDS = 'name slug logoUrl organizationType educationServices location';

/**
 * Fields of the INTENT that leave the server.
 *
 * `compensation` is selected but filtered below by its own `visibility`. `interestQuestions` is
 * deliberately absent: those are the prompts a candidate answers when applying, and they belong to
 * the interest flow on the company page, not to a search result.
 */
const INTENT_FIELDS =
  'companyId title roleCategories specializations employmentTypes deliveryModes locations ' +
  'experienceLevels minYears availability compensation description createdAt';

/** Ids of every company a member of the public may currently see. */
async function visibleCompanyIds(extra = {}) {
  return Company.distinct('_id', { ...publiclyVisible(), ...extra });
}

function emptyPage(query) {
  return {
    roles: [],
    meta: {
      page: query.page,
      limit: query.limit,
      total: 0,
      totalPages: 1,
      hasMore: false,
    },
  };
}

function buildIntentFilter(query, companyIds) {
  const filter = {
    status: HIRING_INTENT_STATUS.ACTIVE,
    companyId: { $in: companyIds },
  };

  if (query.q) filter.$text = { $search: query.q };
  if (query.roleCategory) filter.roleCategories = { $in: query.roleCategory };
  if (query.subject) filter['specializations.subjects'] = { $in: query.subject };
  if (query.employmentType) filter.employmentTypes = { $in: query.employmentType };
  if (query.deliveryMode) filter.deliveryModes = { $in: query.deliveryMode };
  if (query.country) filter['locations.country'] = { $in: query.country };

  /* Free text, so matched case-insensitively against whatever the company typed. */
  if (query.region) {
    const escaped = query.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { 'locations.region': { $regex: escaped, $options: 'i' } },
      { 'locations.city': { $regex: escaped, $options: 'i' } },
    ];
  }

  /*
   * "Roles I qualify for" — a role asking for at most N years. An intent with no `minYears` has
   * stated no requirement, so it must remain visible rather than being excluded by a missing field.
   */
  if (query.maxYears !== undefined) {
    filter.$and = [
      ...(filter.$and ?? []),
      { $or: [{ minYears: { $lte: query.maxYears } }, { minYears: { $in: [null, undefined] } }] },
    ];
  }

  return filter;
}

function buildSort(query) {
  if (query.sort === 'newest') return { createdAt: -1 };
  if (query.sort === 'title') return { title: 1, createdAt: -1 };
  if (query.q) return { score: { $meta: 'textScore' }, createdAt: -1 };
  return { createdAt: -1 };
}

/**
 * One role, as a search result.
 *
 * PRIMARY is the role title; the company is SECONDARY context. `title` is optional by design
 * (PRD §7.5 — a company may activate hiring with only a role category), so the caller gets both
 * the raw title and the categories and decides how to head the card. It is not defaulted here,
 * because inventing a title server-side would make it indistinguishable from one a company wrote.
 */
function serialiseRole(intent, company) {
  const compensationIsPublic = intent.compensation?.visibility === 'public';

  return {
    id: String(intent._id),
    title: intent.title ?? null,
    roleCategories: intent.roleCategories ?? [],
    specializations: intent.specializations ?? {},
    employmentTypes: intent.employmentTypes ?? [],
    deliveryModes: intent.deliveryModes ?? [],
    locations: intent.locations ?? [],
    experienceLevels: intent.experienceLevels ?? [],
    minYears: intent.minYears ?? null,
    availability: intent.availability ?? null,
    description: intent.description ?? null,
    postedAt: intent.createdAt,

    /* Withheld unless the company chose to publish it — the same rule PUB-02 already applies. */
    compensation: compensationIsPublic ? intent.compensation : null,

    company: company
      ? {
          name: company.name,
          slug: company.slug,
          logoUrl: company.logoUrl ?? null,
          initials: companyInitials(company.name),
          organizationType: company.organizationType ?? null,
          educationServices: company.educationServices ?? [],
          location: company.location ?? null,
        }
      : null,
  };
}

/**
 * Paginated role search.
 *
 * @param {object} query  Already validated by `roleSearchQuerySchema`
 */
export async function listPublicRoles(query) {
  const companyIds = await visibleCompanyIds();
  if (companyIds.length === 0) return emptyPage(query);

  const filter = buildIntentFilter(query, companyIds);
  const skip = (query.page - 1) * query.limit;
  const projection = query.q ? { score: { $meta: 'textScore' } } : {};

  const [intents, total] = await Promise.all([
    HiringIntent.find(filter, projection)
      .select(INTENT_FIELDS)
      .sort(buildSort(query))
      .skip(skip)
      .limit(query.limit)
      .lean(),
    HiringIntent.countDocuments(filter),
  ]);

  /* One query for the page's companies rather than one per row. */
  const pageCompanyIds = [...new Set(intents.map((intent) => String(intent.companyId)))];
  const companies = pageCompanyIds.length
    ? await Company.find({ _id: { $in: pageCompanyIds } }).select(COMPANY_CARD_FIELDS).lean()
    : [];
  const companyById = new Map(companies.map((company) => [String(company._id), company]));

  return {
    roles: intents.map((intent) => serialiseRole(intent, companyById.get(String(intent.companyId)))),
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
 * Facet counts for the role filter panel.
 *
 * Computed against the visibility predicate but independent of the current filters, so the counts
 * stay stable while someone refines — the same choice the company directory made, and for the same
 * reason: counts that move as you tick boxes make it impossible to tell what you started with.
 */
export async function getRoleFacets() {
  const companyIds = await visibleCompanyIds();
  if (companyIds.length === 0) {
    return { roleCategory: {}, subject: {}, employmentType: {}, deliveryMode: {}, country: {}, total: 0 };
  }

  const base = { status: HIRING_INTENT_STATUS.ACTIVE, companyId: { $in: companyIds } };

  const countBy = (path) =>
    HiringIntent.aggregate([
      { $match: base },
      { $unwind: `$${path}` },
      { $group: { _id: `$${path}`, count: { $sum: 1 } } },
    ]);

  const [byCategory, bySubject, byEmployment, byDelivery, byCountry, total] = await Promise.all([
    countBy('roleCategories'),
    countBy('specializations.subjects'),
    countBy('employmentTypes'),
    countBy('deliveryModes'),
    HiringIntent.aggregate([
      { $match: base },
      { $unwind: '$locations' },
      { $group: { _id: '$locations.country', count: { $sum: 1 } } },
    ]),
    HiringIntent.countDocuments(base),
  ]);

  const toMap = (rows) =>
    Object.fromEntries(rows.filter((row) => row._id != null).map((row) => [row._id, row.count]));

  return {
    roleCategory: toMap(byCategory),
    subject: toMap(bySubject),
    employmentType: toMap(byEmployment),
    deliveryMode: toMap(byDelivery),
    country: toMap(byCountry),
    total,
  };
}
