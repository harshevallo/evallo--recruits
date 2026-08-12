/**
 * CAN-06 save · CAN-07 interest submission · CAN-08 my interests.
 *
 * The authenticated counterpart to the public expression of interest. The record shape is
 * identical (PRD §11.1) — the difference is that `candidateId` is populated, which is what turns
 * an anonymous enquiry into a profile share governed by an access grant.
 */

import {
  COMPANY_STATUS,
  MODERATION_STATUS,
  HIRING_INTENT_STATUS,
  INTEREST_STATUS,
  ACTIVE_INTEREST_STATES,
  ERROR_CODES,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { Company, companyInitials } from '../companies/company.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from '../interests/expressionOfInterest.model.js';
import { AccessGrant } from '../interests/accessGrant.model.js';
import { SavedCompany } from './savedCompany.model.js';

/** A published, unmoderated company — the only kind a candidate can act on. */
async function publishedCompany(slug) {
  const company = await Company.findOne({
    slug,
    status: COMPANY_STATUS.PUBLISHED,
    moderationStatus: { $in: [MODERATION_STATUS.NONE, null] },
  })
    .select('_id name slug logoUrl acceptsGeneralInterest isCurrentlyHiring')
    .lean();

  if (!company) throw ApiError.notFound('Company not found.');
  return company;
}

/* ── CAN-06 — save / unsave ────────────────────────────────────────────────────────────────── */

export async function saveCompany(profile, slug) {
  const company = await publishedCompany(slug);

  try {
    await SavedCompany.create({ candidateId: profile._id, companyId: company._id });
  } catch (error) {
    // Already saved. Idempotent by unique index, so a double-click is not an error.
    if (error?.code !== 11000) throw error;
  }

  return { saved: true, companyId: String(company._id) };
}

export async function unsaveCompany(profile, slug) {
  const company = await publishedCompany(slug);
  await SavedCompany.deleteOne({ candidateId: profile._id, companyId: company._id });
  return { saved: false, companyId: String(company._id) };
}

/**
 * CAN-06 — the candidate's relationship to a company: saved, and whether interest already exists.
 * The public page content itself still comes from the public endpoint; this only adds the
 * signed-in overlay so the two never disagree about company data.
 */
export async function getCompanyRelationship(profile, slug) {
  const company = await publishedCompany(slug);

  const [saved, interest] = await Promise.all([
    SavedCompany.findOne({ candidateId: profile._id, companyId: company._id }).lean(),
    ExpressionOfInterest.findOne({
      candidateId: profile._id,
      companyId: company._id,
      status: { $in: ACTIVE_INTEREST_STATES },
    }).lean(),
  ]);

  return {
    companyId: String(company._id),
    saved: Boolean(saved),
    /**
     * CAN-04 — whether this candidate has blocked this company.
     *
     * Read from the profile the caller already has, so the company page can render the correct
     * block/unblock state without a second request and without the client deriving the rule.
     * The authority for what a block DOES remains `candidateAccess.service`.
     */
    blocked: (profile.blockedCompanyIds ?? []).some(
      (id) => String(id) === String(company._id),
    ),
    interest: interest
      ? {
          id: String(interest._id),
          status: interest.status,
          hiringIntentId: interest.hiringIntentId ? String(interest.hiringIntentId) : null,
          submittedAt: interest.createdAt,
        }
      : null,
    acceptsGeneralInterest: company.acceptsGeneralInterest,
    isCurrentlyHiring: company.isCurrentlyHiring,
  };
}

/* ── CAN-07 — interest submission (PRD §8.7) ───────────────────────────────────────────────── */

/**
 * PRD §8.7 step 6 — exactly what the company will receive, shown before consent is given.
 * Built from the candidate's own settings so the disclosure cannot drift from the truth.
 */
export function consentDisclosure(profile) {
  return {
    shares: [
      'Your professional headline, introduction, and expertise',
      'The roles, engagement types, and availability you selected',
    ],
    contact:
      profile.contactVisibility === 'hidden'
        ? 'Your email stays hidden — the company can only reply through Evallo Recruit.'
        : 'Your email address, so the company can contact you directly.',
    grants: 'Access to your profile until you withdraw this interest.',
  };
}

/**
 * PRD §8.7 steps 4–7.
 *
 * Idempotent by the same unique partial index the public path uses: retrying or refreshing
 * produces one interest, never two (PRD §21.5).
 */
export async function submitInterest(profile, user, slug, input) {
  const company = await publishedCompany(slug);

  // PRD §8.7 step 3 — a profile too thin to be useful is refused with the gaps named.
  if (!profile.headline || (profile.targetRoles ?? []).length === 0) {
    throw ApiError.validation('Your profile needs a little more before you can share it.', {
      profile: 'Add a headline and at least one target role first.',
    });
  }

  let hiringIntentId = null;
  if (input.hiringIntentId) {
    const intent = await HiringIntent.findOne({
      _id: input.hiringIntentId,
      companyId: company._id,
    })
      .select('_id status')
      .lean();

    if (!intent) throw ApiError.notFound('That role is no longer listed.');

    if (intent.status !== HIRING_INTENT_STATUS.ACTIVE) {
      throw new ApiError(
        ERROR_CODES.INTENT_CLOSED,
        'That role is no longer accepting interest. You can still express general interest in this company.',
      );
    }
    hiringIntentId = intent._id;
  }

  const now = new Date();

  /*
   * Uniqueness is enforced on (companyId, contact.email, hiringIntentId) — see the partial index
   * on the model — so an interest this person submitted ANONYMOUSLY from the public page occupies
   * the same slot as the authenticated one. Match on either identity, otherwise the insert below
   * collides and the candidate is permanently unable to express interest in that company.
   */
  const existing = await ExpressionOfInterest.findOne({
    companyId: company._id,
    hiringIntentId,
    status: { $in: ACTIVE_INTEREST_STATES },
    $or: [{ candidateId: profile._id }, { candidateId: null, 'contact.email': user.email }],
  });

  /**
   * Links an anonymous submission to the candidate who has now signed in — PRD §8.7 steps 2–3
   * describe exactly this journey. The company keeps ONE record (§21.5); it simply gains a
   * candidate.
   */
  async function grantAccess() {
    await AccessGrant.findOneAndUpdate(
      { candidateId: profile._id, companyId: company._id },
      { $set: { grantedAt: now, withdrawnAt: null, source: 'interest' } },
      { upsert: true },
    );
  }

  if (existing) {
    if (existing.candidateId) {
      return { status: 'already_submitted', interestId: String(existing._id) };
    }

    existing.candidateId = profile._id;
    existing.contact = { name: user.name ?? user.email, email: user.email };
    if (input.message) existing.message = input.message;
    existing.source = 'candidate_app';
    existing.consent = { grantedAt: now, scope: 'profile_and_message' };
    await existing.save();

    await grantAccess();
    return { status: 'submitted', interestId: String(existing._id), adopted: true };
  }

  let created;
  try {
    created = await ExpressionOfInterest.create({
      companyId: company._id,
      hiringIntentId,
      candidateId: profile._id,
      contact: { name: user.name ?? user.email, email: user.email },
      message: input.message,
      source: 'candidate_app',
      consent: { grantedAt: now, scope: 'profile_and_message' },
    });
  } catch (error) {
    // Lost a race on the unique index. Re-read and adopt if the winner is an anonymous row.
    if (error?.code === 11000) {
      const raced = await ExpressionOfInterest.findOne({
        companyId: company._id,
        hiringIntentId,
        'contact.email': user.email,
        status: { $in: ACTIVE_INTEREST_STATES },
      });

      if (raced && !raced.candidateId) {
        raced.candidateId = profile._id;
        raced.source = 'candidate_app';
        await raced.save();
        await grantAccess();
        return { status: 'submitted', interestId: String(raced._id), adopted: true };
      }

      return { status: 'already_submitted', interestId: raced ? String(raced._id) : null };
    }
    throw error;
  }

  /*
   * PRD §8.7 step 7 — "grant profile access". The grant is what lets a company reach a candidate
   * who is private rather than discoverable, and it is scoped to this company alone.
   */
  await grantAccess();

  return { status: 'submitted', interestId: String(created._id) };
}

/* ── CAN-08 — my interests ─────────────────────────────────────────────────────────────────── */

/**
 * PRD §8.2 CAN-08 — "company, roles, date, status, messages, withdraw".
 *
 * Statuses beyond `submitted` are set by the recruiter side (REC-11), which is not built. Records
 * therefore stay at "Submitted" — that is the honest current state, not a placeholder.
 */
export async function listInterests(profile) {
  const interests = await ExpressionOfInterest.find({ candidateId: profile._id })
    .sort({ createdAt: -1 })
    .lean();

  if (interests.length === 0) return [];

  const companyIds = [...new Set(interests.map((i) => String(i.companyId)))];
  const intentIds = interests.map((i) => i.hiringIntentId).filter(Boolean);

  const [companies, intents] = await Promise.all([
    Company.find({ _id: { $in: companyIds } })
      .select('name slug logoUrl')
      .lean(),
    intentIds.length
      ? HiringIntent.find({ _id: { $in: intentIds } })
          .select('title status')
          .lean()
      : [],
  ]);

  const companyById = new Map(companies.map((c) => [String(c._id), c]));
  const intentById = new Map(intents.map((i) => [String(i._id), i]));

  return interests.map((interest) => {
    const company = companyById.get(String(interest.companyId));
    const intent = interest.hiringIntentId
      ? intentById.get(String(interest.hiringIntentId))
      : null;

    return {
      id: String(interest._id),
      company: company
        ? {
            name: company.name,
            slug: company.slug,
            logoUrl: company.logoUrl ?? null,
            initials: companyInitials(company.name),
          }
        : null,
      /** Null means general company interest rather than a specific role (PRD §8.7 step 4). */
      role: intent ? { title: intent.title, status: intent.status } : null,
      status: interest.status,
      message: interest.message ?? null,
      submittedAt: interest.createdAt,
      canWithdraw: ACTIVE_INTEREST_STATES.includes(interest.status),
    };
  });
}

/**
 * PRD §8.7 step 8 — withdraw.
 *
 * Withdrawing also withdraws the access grant, unless another active interest in the same company
 * still justifies it. Leaving the grant behind would mean "withdrawn" did not actually withdraw
 * anything, which is the privacy failure PRD §16.1 exists to prevent.
 */
export async function withdrawInterest(profile, interestId) {
  const interest = await ExpressionOfInterest.findOne({
    _id: interestId,
    candidateId: profile._id,
  });

  if (!interest) throw ApiError.notFound('Interest not found.');

  if (!ACTIVE_INTEREST_STATES.includes(interest.status)) {
    return { status: interest.status, alreadyClosed: true };
  }

  interest.status = INTEREST_STATUS.WITHDRAWN;
  await interest.save();

  const stillActive = await ExpressionOfInterest.countDocuments({
    candidateId: profile._id,
    companyId: interest.companyId,
    status: { $in: ACTIVE_INTEREST_STATES },
  });

  if (stillActive === 0) {
    await AccessGrant.updateOne(
      { candidateId: profile._id, companyId: interest.companyId, withdrawnAt: null },
      { $set: { withdrawnAt: new Date() } },
    );
  }

  return { status: interest.status, alreadyClosed: false };
}
