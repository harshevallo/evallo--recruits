/**
 * CAN-03 profile preview and CAN-04 visibility controls (PRD §4.3, §8.8).
 *
 * Visibility is the candidate's, not the recruiter's. Every rule here constrains what a company
 * can reach **independently of the role that company's members hold** (PRD §4.3, ADR-006 layer 4),
 * which is why it lives with the candidate and not in the permission matrix.
 */

import {
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  CANDIDATE_VISIBILITY_VALUES,
  CONTACT_VISIBILITY_VALUES,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { Company } from '../companies/company.model.js';
import { getBuilderState } from './builder.service.js';

/**
 * Fields the recruiter view withholds, named so the preview can label them (PRD §8.2 CAN-03:
 * "private-field indicators").
 */
function privateFields(profile) {
  const hidden = [];

  if (profile.contactVisibility === CONTACT_VISIBILITY.HIDDEN) {
    hidden.push({
      field: 'contact',
      label: 'Email and phone',
      reason: 'Your contact rule is set to hidden, so no company can see these.',
    });
  }

  if (profile.contactVisibility === CONTACT_VISIBILITY.AFTER_INTEREST) {
    hidden.push({
      field: 'contact',
      label: 'Email and phone',
      reason: 'Shared only with companies you have expressed interest in.',
    });
  }

  if (profile.contactVisibility === CONTACT_VISIBILITY.ON_REQUEST) {
    hidden.push({
      field: 'contact',
      label: 'Email and phone',
      reason: 'Shared only when you approve a request.',
    });
  }

  if ((profile.blockedCompanyIds ?? []).length > 0) {
    hidden.push({
      field: 'blockedCompanies',
      label: `${profile.blockedCompanyIds.length} blocked ${
        profile.blockedCompanyIds.length === 1 ? 'company' : 'companies'
      }`,
      reason: 'These companies cannot see your profile at all, whatever your visibility setting.',
    });
  }

  return hidden;
}

/**
 * CAN-03 — the exact recruiter rendering, plus what is withheld and whether it can be published.
 *
 * @param {object} profile   Mongoose document
 * @param {object} user      The owner, for the header name
 */
export async function getPreview(profile, user) {
  const builder = await getBuilderState(profile);

  const contactRevealed = profile.contactVisibility === CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS;

  return {
    /** PRD §8.8 — the preview must be the same rendering a recruiter gets. */
    profile: profile.toRecruiterView({
      name: user.name ?? null,
      email: user.email,
      contactRevealed,
    }),
    privateFields: privateFields(profile),
    visibility: {
      status: profile.status,
      contactVisibility: profile.contactVisibility,
    },
    publish: {
      /** PRD §8.5 — publication requirements, named rather than scored. */
      blockers: builder.publishBlockers,
      canPublish: builder.publishBlockers.length === 0,
      publishedAt: profile.publishedAt ?? null,
      isPublished: profile.status !== CANDIDATE_VISIBILITY.DRAFT,
    },
  };
}

/**
 * CAN-03 publish control.
 *
 * Publishing means leaving `draft`. PRD §8.5 lists what must be present first; §4.3 makes the
 * resulting state the candidate's choice, so this defaults to `discoverable` but accepts
 * `private` for someone who wants to share only through interest.
 */
export async function publishProfile(profile, requestedStatus) {
  const builder = await getBuilderState(profile);

  if (builder.publishBlockers.length > 0) {
    throw ApiError.validation('Your profile is not ready to publish yet.', {
      publish: `Still needed: ${builder.publishBlockers.join(', ')}.`,
    });
  }

  const status = requestedStatus ?? CANDIDATE_VISIBILITY.DISCOVERABLE;
  if (![CANDIDATE_VISIBILITY.DISCOVERABLE, CANDIDATE_VISIBILITY.PRIVATE].includes(status)) {
    throw ApiError.validation('Choose a visibility to publish with.', {
      status: 'Publish as discoverable or private.',
    });
  }

  profile.status = status;
  profile.publishedAt = profile.publishedAt ?? new Date();
  profile.lastActiveAt = new Date();
  await profile.save();

  return profile;
}

/**
 * CAN-04 — set discoverability and the contact-reveal rule.
 *
 * Moving to `paused` deliberately does NOT revoke existing access: PRD §4.3 defines paused as
 * "hidden from NEW searches; existing authorized companies retain access". Revoking is a separate,
 * explicit act.
 */
export async function updateVisibility(profile, input) {
  if (input.status !== undefined) {
    if (!CANDIDATE_VISIBILITY_VALUES.includes(input.status)) {
      throw ApiError.validation('Unknown visibility.', { status: 'Choose one of the options.' });
    }

    // Leaving draft is publication, and publication has requirements (PRD §8.5).
    if (
      profile.status === CANDIDATE_VISIBILITY.DRAFT &&
      input.status !== CANDIDATE_VISIBILITY.DRAFT
    ) {
      const builder = await getBuilderState(profile);
      if (builder.publishBlockers.length > 0) {
        throw ApiError.validation('Finish your profile before making it visible.', {
          status: `Still needed: ${builder.publishBlockers.join(', ')}.`,
        });
      }
      profile.publishedAt = profile.publishedAt ?? new Date();
    }

    profile.status = input.status;
  }

  if (input.contactVisibility !== undefined) {
    if (!CONTACT_VISIBILITY_VALUES.includes(input.contactVisibility)) {
      throw ApiError.validation('Unknown contact rule.', {
        contactVisibility: 'Choose one of the options.',
      });
    }
    profile.contactVisibility = input.contactVisibility;
  }

  profile.lastActiveAt = new Date();
  await profile.save();
  return profile;
}

/**
 * CAN-04 company blocks (PRD §8.2: "company blocks").
 *
 * A block overrides every permission the company holds — it is checked before, and independently
 * of, the role matrix (ADR-006).
 */
export async function blockCompany(profile, companyId) {
  const company = await Company.findById(companyId).select('_id').lean();
  if (!company) throw ApiError.notFound('Company not found.');

  const already = (profile.blockedCompanyIds ?? []).some(
    (id) => String(id) === String(company._id),
  );
  if (!already) {
    profile.blockedCompanyIds = [...(profile.blockedCompanyIds ?? []), company._id];
    await profile.save();
  }

  return profile;
}

export async function unblockCompany(profile, companyId) {
  profile.blockedCompanyIds = (profile.blockedCompanyIds ?? []).filter(
    (id) => String(id) !== String(companyId),
  );
  await profile.save();
  return profile;
}

/** Blocked companies, resolved to something displayable. */
export async function listBlockedCompanies(profile) {
  const ids = profile.blockedCompanyIds ?? [];
  if (ids.length === 0) return [];

  const companies = await Company.find({ _id: { $in: ids } })
    .select('name slug logoUrl')
    .lean();

  return companies.map((c) => ({
    companyId: String(c._id),
    name: c.name,
    slug: c.slug,
    logoUrl: c.logoUrl ?? null,
  }));
}
