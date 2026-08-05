/**
 * REC-11 interest inbox — the company's side of the expression-of-interest loop (PRD §9.2, §11.1).
 *
 * Reads the SAME `expressionsOfInterest` rows CAN-07 writes and CAN-08 tracks. There is no
 * recruiter-side interest model: the candidate and the recruiter are looking at one record from
 * two ends, and a second copy would let "withdrawn" mean different things to the two of them.
 *
 * Every row is passed through `resolveCandidateAccess` before its profile summary is attached, so
 * a candidate who blocked this company — or paused after expressing interest — is not rendered
 * from stale data.
 */

import {
  INTEREST_STATUS,
  ACTIVE_INTEREST_STATES,
  CANDIDATE_VISIBILITY,
  INTEREST_INBOX_SORTS,
  RECRUITER_INTEREST_STATUS_VALUES,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { resolveCandidateAccess } from '../candidates/candidateAccess.service.js';
import { User } from '../users/user.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from './expressionOfInterest.model.js';

/*
 * The settable statuses and sort keys live in `@evallo/shared` beside the INTEREST_STATUS enum,
 * because the request schema validates against them and this service enforces them — one list
 * read from two places, rather than a validator and a guard that can drift apart.
 */

/** Interests a recruiter can still act on. A withdrawn one is readable but frozen. */
const isActionable = (status) => ACTIVE_INTEREST_STATES.includes(status);

function buildFilter(companyId, query) {
  const filter = { companyId };

  if (query.status?.length) filter.status = { $in: query.status };
  if (query.hiringIntentId) filter.hiringIntentId = query.hiringIntentId;
  if (query.generalOnly) filter.hiringIntentId = null;

  /*
   * Name/email match on the inline contact, which every row carries — including rows whose
   * candidate later signed up. Searching the profile instead would silently skip pre-auth
   * submissions, which are exactly the ones a recruiter is most likely to be hunting for.
   */
  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ 'contact.name': rx }, { 'contact.email': rx }];
  }

  return filter;
}

function buildSort(sort) {
  if (sort === INTEREST_INBOX_SORTS.OLDEST) return { createdAt: 1 };
  if (sort === INTEREST_INBOX_SORTS.STATUS) return { status: 1, createdAt: -1 };
  return { createdAt: -1 };
}

/**
 * The candidate summary shown on an inbox row.
 *
 * Drawn from the same structured fields REC-12 searches and REC-13 renders — never a separate
 * "inbox shape" that could show something the viewer would not. When access resolves to false the
 * row still appears (the interest is a real event in the company's history) but carries no
 * profile data and cannot be opened.
 */
function toCandidateSummary({ profile, user, access }) {
  if (!profile) {
    /* A pre-auth submission (PRD §11.1): the inline contact is all that was ever collected. */
    return { hasProfile: false, profileId: null, viewable: false, reason: null, summary: null };
  }

  if (!access.visible) {
    return {
      hasProfile: true,
      profileId: null,
      viewable: false,
      reason: access.reason,
      summary: null,
    };
  }

  return {
    hasProfile: true,
    profileId: String(profile._id),
    viewable: true,
    reason: null,
    summary: {
      name: user?.name ?? null,
      headline: profile.headline ?? null,
      targetRoles: profile.targetRoles ?? [],
      subjects: (profile.subjects ?? []).slice(0, 6),
      learnerSegments: (profile.learnerSegments ?? []).slice(0, 4),
      yearsExperience: profile.yearsExperience ?? null,
      availability: profile.availability ?? null,
      deliveryModes: profile.deliveryModes ?? [],
      visibility: profile.status,
      /** Paused after expressing interest — the recruiter keeps access but should know. */
      isPaused: profile.status === CANDIDATE_VISIBILITY.PAUSED,
    },
    contactRevealed: access.contactRevealed,
  };
}

function toInboxRow(interest, candidate, intent) {
  return {
    id: String(interest._id),
    status: interest.status,
    actionable: isActionable(interest.status),
    message: interest.message ?? null,
    source: interest.source ?? null,
    submittedAt: interest.createdAt,
    updatedAt: interest.updatedAt,
    consentedAt: interest.consent?.grantedAt ?? null,

    /*
     * The inline contact captured at submission. Shown only when the candidate's contact rule
     * allows it — or when there is no profile at all, in which case the candidate typed these
     * details into a public form for this company specifically.
     */
    contact:
      !candidate.hasProfile || candidate.contactRevealed
        ? { name: interest.contact?.name ?? null, email: interest.contact?.email ?? null }
        : { name: interest.contact?.name ?? null, email: null },

    role: intent
      ? { id: String(intent._id), title: intent.title ?? null, status: intent.status }
      : null,

    candidate,
  };
}

/**
 * REC-11 — the inbox, filtered, sorted and paged.
 *
 * @param {object} company
 * @param {object} query   Already validated: { status?, hiringIntentId?, q?, sort, page, limit }
 */
export async function listCompanyInterests(company, query) {
  const filter = buildFilter(company._id, query);
  const skip = (query.page - 1) * query.limit;

  const [interests, total, statusCounts] = await Promise.all([
    ExpressionOfInterest.find(filter).sort(buildSort(query.sort)).skip(skip).limit(query.limit).lean(),
    ExpressionOfInterest.countDocuments(filter),
    /* Counts ignore the current filter so the tabs stay stable while a recruiter narrows down. */
    ExpressionOfInterest.aggregate([
      { $match: { companyId: company._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const profileIds = interests.map((row) => row.candidateId).filter(Boolean);
  const intentIds = interests.map((row) => row.hiringIntentId).filter(Boolean);

  const [profiles, intents] = await Promise.all([
    profileIds.length ? CandidateProfile.find({ _id: { $in: profileIds } }).lean() : [],
    intentIds.length
      ? HiringIntent.find({ _id: { $in: intentIds } }).select('title status').lean()
      : [],
  ]);

  const users = profiles.length
    ? await User.find({ _id: { $in: profiles.map((p) => p.userId) } })
        .select('name email')
        .lean()
    : [];

  const profileById = new Map(profiles.map((p) => [String(p._id), p]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const intentById = new Map(intents.map((i) => [String(i._id), i]));

  const rows = await Promise.all(
    interests.map(async (interest) => {
      const profile = interest.candidateId ? profileById.get(String(interest.candidateId)) : null;

      /*
       * `interested: true` short-circuits the after_interest lookup — this row IS the interest,
       * so re-querying for one would be a round trip to confirm what we are holding. Only an
       * ACTIVE interest counts, matching the rule in candidateAccess.
       */
      const access = profile
        ? await resolveCandidateAccess(profile, company._id, {
            interested: isActionable(interest.status),
          })
        : { visible: false, reason: null, contactRevealed: false };

      const candidate = toCandidateSummary({
        profile,
        user: profile ? userById.get(String(profile.userId)) : null,
        access,
      });

      return toInboxRow(
        interest,
        candidate,
        interest.hiringIntentId ? intentById.get(String(interest.hiringIntentId)) : null,
      );
    }),
  );

  return {
    interests: rows,
    counts: {
      byStatus: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
      total: statusCounts.reduce((sum, row) => sum + row.count, 0),
      matching: total,
    },
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasMore: query.page * query.limit < total,
    },
  };
}

/** One interest belonging to THIS company, or 404 — never 403, which would confirm it exists. */
async function findCompanyInterest(companyId, interestId) {
  const interest = await ExpressionOfInterest.findOne({ _id: interestId, companyId });
  if (!interest) throw ApiError.notFound('Interest not found.');
  return interest;
}

/**
 * REC-11 — move an interest along.
 *
 * A withdrawn interest is frozen: PRD §21.5 says the recruiter "sees withdrawal and cannot
 * continue new outreach", so re-opening one by writing a status over it is exactly the move this
 * refuses.
 */
export async function updateInterestStatus(company, interestId, status) {
  const interest = await findCompanyInterest(company._id, interestId);

  if (!RECRUITER_INTEREST_STATUS_VALUES.includes(status)) {
    throw ApiError.validation('That status cannot be set from the inbox.', {
      status: 'Not a recruiter action',
    });
  }

  if (interest.status === INTEREST_STATUS.WITHDRAWN) {
    throw ApiError.conflict(
      'This person withdrew their interest. You cannot reopen it on their behalf.',
    );
  }

  if (interest.status === INTEREST_STATUS.EXPIRED) {
    throw ApiError.conflict('This interest has expired.');
  }

  interest.status = status;
  await interest.save();

  return { id: String(interest._id), status: interest.status, actionable: isActionable(status) };
}

/**
 * REC-11 — mark as viewed on open.
 *
 * Separate from `updateInterestStatus` because it is an automatic side effect of reading, not a
 * decision: it only ever moves `submitted → viewed`, so opening an interest twice, or opening one
 * a colleague already progressed, changes nothing.
 */
export async function markInterestViewed(company, interestId) {
  const interest = await findCompanyInterest(company._id, interestId);

  if (interest.status === INTEREST_STATUS.SUBMITTED) {
    interest.status = INTEREST_STATUS.VIEWED;
    await interest.save();
  }

  return { id: String(interest._id), status: interest.status };
}
