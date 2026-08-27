/**
 * Company creation and team access.
 */

import mongoose from 'mongoose';
import { COMPANY_ROLES, COMPANY_STATUS, MEMBERSHIP_STATUS } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { logger } from '../../lib/logger.js';
import { supportsTransactions } from '../../lib/db.js';
import { Company } from './company.model.js';
import { CompanyMember } from '../memberships/companyMember.model.js';

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Appends -2, -3 … until the slug is free. */
async function uniqueSlug(base) {
  const root = base || 'company';
  let candidate = root;
  let suffix = 1;

  // Sequential by necessity: each probe depends on the previous result.
  while (await Company.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${root}-${suffix}`.slice(0, 60);
  }

  return candidate;
}

/**
 * Create a company and make the creator its owner.
 *
 * A user may create any number of companies — this does not change who they are, it adds a
 * membership. Their candidate profile, if any, is untouched.
 *
 * The two writes must not diverge: a company with no owner is unreachable, and an owner
 * membership pointing at nothing is orphaned. Uses a transaction where the deployment supports
 * one and compensates explicitly where it does not.
 */
export async function createCompany(userId, input) {
  const slug = await uniqueSlug(slugify(input.name));

  const companyData = {
    name: input.name,
    organizationType: input.organizationType,
    slug,
    location: input.location,
    tagline: input.tagline,
    description: input.tagline ? { short: input.tagline } : undefined,
    status: COMPANY_STATUS.DRAFT,
  };

  const ownerMembership = {
    userId,
    role: COMPANY_ROLES.OWNER,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  };

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const [company] = await Company.create([companyData], { session });
        await CompanyMember.create([{ ...ownerMembership, companyId: company._id }], { session });
        created = company;
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  /*
   * Standalone MongoDB — no transactions available. Create the company, then the membership,
   * and roll the company back if the membership fails. Not atomic, but it never leaves an
   * owner-less company behind, which is the outcome that actually matters.
   */
  const company = await Company.create(companyData);
  try {
    await CompanyMember.create({ ...ownerMembership, companyId: company._id });
    return company;
  } catch (error) {
    await Company.deleteOne({ _id: company._id }).catch((cleanupError) => {
      logger.error('Failed to roll back company after membership error', {
        companyId: String(company._id),
        message: cleanupError.message,
      });
    });
    throw error;
  }
}

/** Team list for a company. Requires an active membership and `member:manage`. */
export async function listCompanyMembers(companyId) {
  return CompanyMember.find({ companyId, status: MEMBERSHIP_STATUS.ACTIVE })
    .populate('userId', 'name email avatarUrl')
    .lean()
    .then((members) =>
      members.map((member) => ({
        id: String(member._id),
        role: member.role,
        status: member.status,
        showOnPublicTeam: member.showOnPublicTeam,
        user: member.userId
          ? {
              id: String(member.userId._id),
              name: member.userId.name ?? null,
              email: member.userId.email,
              avatarUrl: member.userId.avatarUrl ?? null,
            }
          : null,
        joinedAt: member.acceptedAt ?? member.createdAt,
      })),
    );
}

/*
 * The last-owner guard (PRD §21.2) lives in `modules/memberships/member.service.js`, beside the
 * demotion, removal and transfer paths that are the only things able to violate it. It was
 * briefly defined here as well, with no callers — two copies of a rule this important is exactly
 * how the two copies end up disagreeing.
 */

/* ── REC-02 setup wizard · REC-06 preview and publish ─────────────────────────────────────── */

/**
 * Wizard steps (PRD §7.2, §7.3).
 *
 * Scope note. PRD §7.2 splits company setup across REC-02 (basics), REC-03 (brand and overview)
 * and REC-04 (education footprint). The publication requirements in §7.3 draw from all three — a
 * page cannot be published without a tagline, a short description and at least one education
 * service. These steps therefore cover exactly the fields §7.3 marks required for publication,
 * plus the optional enrichment that sits beside them. REC-05 hiring intent is deliberately
 * absent: it gates `isCurrentlyHiring`, not publication.
 *
 * Every field maps to a column that ALREADY EXISTS on the company model — none was invented.
 */
export const COMPANY_WIZARD_STEPS = Object.freeze([
  {
    key: 'basics',
    title: 'Company basics',
    description: 'Who you are and where you are based.',
    fields: ['name', 'organizationType', 'website', 'location'],
  },
  {
    key: 'brand',
    title: 'Brand and overview',
    description: 'What a candidate sees first, and how you describe yourselves.',
    fields: [
      'logoUrl',
      'coverImageUrl',
      'tagline',
      'descriptionShort',
      'descriptionFull',
      'foundingYear',
      'sizeRange',
      /*
         Metrics sit with the description, not with culture, so that each SECTION of the public
         profile maps to exactly one wizard step — the preview's per-section edit links depend on
         that being true, and the tiles render inside the overview block.
      */
      'metrics',
    ],
  },
  {
    key: 'footprint',
    title: 'Education footprint',
    description: 'The services you offer, who you teach, and how you deliver.',
    fields: [
      'educationServices',
      'subjects',
      'deliveryModes',
      'serviceRegions',
      'learnerSegments',
    ],
  },
  /*
   * Culture is optional enrichment and therefore LAST. Nothing in it appears on the publish
   * checklist (PRD §7.3 requires none of it), so a company can publish a credible page without
   * ever opening this step — which is the draft-first promise in §7.2. It exists because the
   * public profile has a culture block with no way to author it otherwise.
   */
  {
    key: 'culture',
    title: 'Life and culture',
    description: 'How you teach, what you offer educators, and the numbers you stand behind.',
    fields: ['descriptionPhilosophy', 'descriptionCulture', 'pullQuote', 'perks'],
  },
]);

/** Upper bounds on the free-text collections, applied on write. See `sanitiseList`. */
export const COMPANY_CONTENT_LIMITS = Object.freeze({
  metrics: 4,
  perks: 12,
  metricValue: 24,
  metricLabel: 60,
  perk: 80,
  quoteText: 280,
  quoteAttribution: 120,
});

/**
 * Trims a free-text list to its cap and drops the empties.
 *
 * These fields are arrays of user-supplied strings with no enum behind them, so without a bound
 * here a single step save could store an unbounded document — the wizard's own controls limit
 * what a person can add, and a limit that only exists in the browser is not a limit.
 */
function sanitiseList(value, { max, maxLength }) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * PRD §7.3 publication requirements, named rather than scored.
 *
 * Required: name, slug, organization type, primary country, logo or generated initials, tagline,
 * short description, and at least one education service. Initials are generated from the name, so
 * the logo requirement is always satisfiable and is never a blocker.
 */
export function buildPublishChecklist(company) {
  const items = [
    { key: 'name', label: 'Company name', step: 'basics', done: Boolean(company.name?.trim()) },
    { key: 'slug', label: 'Public address', step: 'basics', done: Boolean(company.slug) },
    {
      key: 'organizationType',
      label: 'Organization type',
      step: 'basics',
      done: Boolean(company.organizationType),
    },
    {
      key: 'country',
      label: 'Primary country',
      step: 'basics',
      done: Boolean(company.location?.country),
    },
    { key: 'tagline', label: 'Tagline', step: 'brand', done: Boolean(company.tagline?.trim()) },
    {
      key: 'descriptionShort',
      label: 'Short description',
      step: 'brand',
      done: Boolean(company.description?.short?.trim()),
    },
    {
      key: 'educationServices',
      label: 'At least one education service',
      step: 'footprint',
      done: (company.educationServices ?? []).length > 0,
    },
  ];

  const blockers = items.filter((item) => !item.done);

  return {
    items,
    blockers: blockers.map((item) => item.label),
    canPublish: blockers.length === 0,
  };
}

/** Per-step completion, so the wizard shows progress without a second source of truth. */
export function buildWizardState(company) {
  const checklist = buildPublishChecklist(company);

  const steps = COMPANY_WIZARD_STEPS.map((step) => {
    const required = checklist.items.filter((item) => item.step === step.key);
    return {
      key: step.key,
      title: step.title,
      description: step.description,
      requiredDone: required.filter((item) => item.done).length,
      requiredTotal: required.length,
      complete: required.every((item) => item.done),
      missing: required.filter((item) => !item.done).map((item) => item.label),
    };
  });

  return { steps, checklist };
}

/** The editable company as the wizard consumes it — flattened where the form is flat. */
export function toEditorView(company) {
  return {
    id: String(company._id),
    slug: company.slug,
    status: company.status,
    publishedAt: company.publishedAt ?? null,
    name: company.name ?? '',
    organizationType: company.organizationType ?? '',
    website: company.website ?? '',
    location: {
      country: company.location?.country ?? '',
      region: company.location?.region ?? '',
      city: company.location?.city ?? '',
    },
    logoUrl: company.logoUrl ?? '',
    coverImageUrl: company.coverImageUrl ?? '',
    tagline: company.tagline ?? '',
    descriptionShort: company.description?.short ?? '',
    descriptionFull: company.description?.full ?? '',
    foundingYear: company.foundingYear ?? null,
    sizeRange: company.sizeRange ?? '',
    educationServices: company.educationServices ?? [],
    subjects: company.subjects ?? [],
    deliveryModes: company.deliveryModes ?? [],
    serviceRegions: company.serviceRegions ?? [],
    learnerSegments: company.learnerSegments ?? [],
    descriptionPhilosophy: company.description?.philosophy ?? '',
    descriptionCulture: company.description?.culture ?? '',
    /* Flattened for the form, which draws two inputs rather than one object. */
    pullQuote: {
      text: company.pullQuote?.text ?? '',
      attribution: company.pullQuote?.attribution ?? '',
    },
    perks: company.perks ?? [],
    metrics: (company.metrics ?? []).map((metric) => ({
      value: metric.value ?? '',
      label: metric.label ?? '',
    })),
  };
}

/** Loads a company by id or slug — the wizard is reached by slug, the API accepts either. */
export async function findCompany(companyIdOrSlug) {
  const company = mongoose.isValidObjectId(companyIdOrSlug)
    ? await Company.findById(companyIdOrSlug)
    : await Company.findOne({ slug: companyIdOrSlug });

  if (!company) throw ApiError.notFound('Company not found.');
  return company;
}

/** REC-02 — the wizard payload: current values, per-step progress, and publish blockers. */
export async function getCompanyEditor(companyIdOrSlug) {
  const company = await findCompany(companyIdOrSlug);
  return { company: toEditorView(company), ...buildWizardState(company) };
}

/**
 * REC-02 — save one wizard step.
 *
 * A partial step is a valid save. The wizard is draft-first by design (PRD §7.2: "publish a
 * credible page quickly, with optional enrichment available afterward"), so requirements are
 * enforced at publish time rather than on every save.
 */
export async function saveCompanyStep(companyIdOrSlug, stepKey, values = {}) {
  const step = COMPANY_WIZARD_STEPS.find((candidate) => candidate.key === stepKey);
  if (!step) throw ApiError.notFound('That step does not exist.');

  const company = await findCompany(companyIdOrSlug);
  const allowed = new Set(step.fields);

  /** Only fields belonging to THIS step are writable, so a crafted body cannot reach others. */
  const set = (field, apply) => {
    if (allowed.has(field) && values[field] !== undefined) apply(values[field]);
  };

  set('name', (v) => {
    company.name = v;
  });
  set('organizationType', (v) => {
    company.organizationType = v;
  });
  set('website', (v) => {
    company.website = v || undefined;
  });
  set('location', (v) => {
    company.location = {
      country: v.country ?? company.location?.country,
      region: v.region ?? company.location?.region,
      city: v.city ?? company.location?.city,
      timezone: company.location?.timezone,
    };
  });
  set('logoUrl', (v) => {
    company.logoUrl = v || undefined;
  });
  set('coverImageUrl', (v) => {
    company.coverImageUrl = v || undefined;
  });
  set('tagline', (v) => {
    company.tagline = v;
  });
  set('descriptionShort', (v) => {
    company.description = { ...company.description?.toObject?.(), short: v };
  });
  set('descriptionFull', (v) => {
    company.description = { ...company.description?.toObject?.(), full: v };
  });
  set('foundingYear', (v) => {
    company.foundingYear = v ?? undefined;
  });
  set('sizeRange', (v) => {
    company.sizeRange = v || undefined;
  });
  set('educationServices', (v) => {
    company.educationServices = v;
  });
  set('subjects', (v) => {
    company.subjects = v;
  });
  set('deliveryModes', (v) => {
    company.deliveryModes = v;
  });
  set('serviceRegions', (v) => {
    company.serviceRegions = v;
  });
  set('learnerSegments', (v) => {
    company.learnerSegments = v;
  });

  /*
   * `description` is a nested object, so each of these has to merge rather than assign — the
   * existing pattern above (`descriptionShort`, `descriptionFull`) for the same reason.
   */
  set('descriptionPhilosophy', (v) => {
    company.description = { ...company.description?.toObject?.(), philosophy: v };
  });
  set('descriptionCulture', (v) => {
    company.description = { ...company.description?.toObject?.(), culture: v };
  });

  set('pullQuote', (v) => {
    const text = String(v?.text ?? '').trim().slice(0, COMPANY_CONTENT_LIMITS.quoteText);
    const attribution = String(v?.attribution ?? '')
      .trim()
      .slice(0, COMPANY_CONTENT_LIMITS.quoteAttribution);

    /* An attribution with no quote is not a quote — clearing the text clears the whole block. */
    company.pullQuote = text ? { text, attribution: attribution || undefined } : undefined;
  });

  set('perks', (v) => {
    company.perks = sanitiseList(v, {
      max: COMPANY_CONTENT_LIMITS.perks,
      maxLength: COMPANY_CONTENT_LIMITS.perk,
    });
  });

  set('metrics', (v) => {
    company.metrics = (Array.isArray(v) ? v : [])
      .map((metric) => ({
        value: String(metric?.value ?? '').trim().slice(0, COMPANY_CONTENT_LIMITS.metricValue),
        label: String(metric?.label ?? '').trim().slice(0, COMPANY_CONTENT_LIMITS.metricLabel),
      }))
      /* Both halves are required to render a tile, so a half-filled row is dropped, not stored. */
      .filter((metric) => metric.value && metric.label)
      .slice(0, COMPANY_CONTENT_LIMITS.metrics);
  });

  await company.save();
  return { company: toEditorView(company), ...buildWizardState(company) };
}

/**
 * REC-06 — publish.
 *
 * Publishing is the only transition that makes company data anonymously readable, so the §7.3
 * requirements are enforced here rather than trusted from the client.
 */
export async function publishCompany(companyIdOrSlug) {
  const company = await findCompany(companyIdOrSlug);
  const checklist = buildPublishChecklist(company);

  if (!checklist.canPublish) {
    throw ApiError.validation('This page is not ready to publish yet.', {
      publish: `Still needed: ${checklist.blockers.join(', ')}.`,
    });
  }

  company.status = COMPANY_STATUS.PUBLISHED;
  company.publishedAt = company.publishedAt ?? new Date();
  await company.save();

  return company;
}

/**
 * REC-06 — unpublish.
 *
 * Returns the page to `draft`, removing it from the directory and the public profile. The record
 * and its slug are preserved: PRD §9.3 treats archiving as a separate, heavier state.
 */
export async function unpublishCompany(companyIdOrSlug) {
  const company = await findCompany(companyIdOrSlug);
  company.status = COMPANY_STATUS.DRAFT;
  await company.save();
  return company;
}

/*
 * REC-01 invitation acceptance and REC-07 invitation management live in
 * `modules/memberships/invitation.service.js`. Both ends act on one CompanyMember row, so
 * keeping "send" and "accept" together is what stops them drifting.
 */
