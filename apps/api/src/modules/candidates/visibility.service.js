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
import { loadPortfolio } from './portfolio.service.js';
import { ensurePublicSlug } from './publicPortfolio.service.js';

/**
 * Fields the recruiter view withholds, named so the preview can label them (PRD §8.2 CAN-03:
 * "private-field indicators").
 */
function privateFields(profile, withheld = {}) {
  const hidden = [];

  /*
   * ADR-008 per-item visibility, reported before the contact rules.
   *
   * An entry the candidate marked `private` is filtered out by `loadPortfolio` and never reaches
   * any audience — including this preview, because PRD §8.8 requires the preview to BE the
   * recruiter rendering. Without this indicator the candidate would see an entry vanish from
   * their own preview with no explanation, and the obvious conclusion is that the app lost it.
   */
  const WITHHELD_LABELS = {
    experience: ['experience entry', 'experience entries'],
    education: ['education entry', 'education entries'],
    credentials: ['credential', 'credentials'],
    media: ['portfolio item', 'portfolio items'],
  };

  for (const [key, [singular, plural]] of Object.entries(WITHHELD_LABELS)) {
    const count = withheld[key] ?? 0;
    if (count > 0) {
      hidden.push({
        field: `withheld.${key}`,
        label: `${count} hidden ${count === 1 ? singular : plural}`,
        reason: 'You set these to private, so they appear on no one else’s screen.',
      });
    }
  }

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
  const [builder, portfolio] = await Promise.all([
    getBuilderState(profile, user),
    loadPortfolio(profile),
  ]);

  const contactRevealed = profile.contactVisibility === CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS;

  return {
    /**
     * PRD §8.8 — the preview must be the same rendering a recruiter gets.
     *
     * Same serialiser, same projection, same per-item visibility filter. The candidate is shown
     * their portfolio as an audience receives it, not as they entered it.
     */
    profile: profile.toRecruiterView(
      {
        name: user.name ?? null,
        photoUrl: user.profilePicture ?? null,
        location: user.location ?? null,
        languages: user.languages ?? [],
        email: user.email,
        contactRevealed,
      },
      portfolio,
    ),
    privateFields: privateFields(profile, portfolio.withheld),
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
export async function publishProfile(profile, requestedStatus, user) {
  const builder = await getBuilderState(profile, user);

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
export async function updateVisibility(profile, input, user) {
  if (input.status !== undefined) {
    if (!CANDIDATE_VISIBILITY_VALUES.includes(input.status)) {
      throw ApiError.validation('Unknown visibility.', { status: 'Choose one of the options.' });
    }

    // Leaving draft is publication, and publication has requirements (PRD §8.5).
    if (
      profile.status === CANDIDATE_VISIBILITY.DRAFT &&
      input.status !== CANDIDATE_VISIBILITY.DRAFT
    ) {
      const builder = await getBuilderState(profile, user);
      if (builder.publishBlockers.length > 0) {
        throw ApiError.validation('Finish your profile before making it visible.', {
          status: `Still needed: ${builder.publishBlockers.join(', ')}.`,
        });
      }
      profile.publishedAt = profile.publishedAt ?? new Date();
    }

    /*
     * Choosing PUBLIC mints the address.
     *
     * Here rather than on read, because a slug is a consequence of a DECISION: a profile that has
     * never been public should never acquire a public URL, even a dormant one. `ensurePublicSlug`
     * is idempotent, so re-saving PUBLIC returns the same slug rather than minting a second.
     *
     * And it is never cleared. Switching back to `private` makes the address 404 — the state
     * check in `resolvePublicPortfolio` does that, not the absence of a slug — but KEEPING it means
     * a candidate who republishes gets their original URL back rather than orphaning whatever
     * already linked to it. A slug is cheap; a broken link someone printed is not.
     */
    if (input.status === CANDIDATE_VISIBILITY.PUBLIC) {
      await ensurePublicSlug(profile, user?.name);
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
