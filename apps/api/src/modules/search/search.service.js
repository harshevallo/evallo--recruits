/**
 * REC-12 talent search — PRD §7.7, §10, §21.4, Appendix B.
 *
 * ADR-010 makes this the ONLY place candidate search queries are built. No controller, page or
 * other module assembles a filter: keeping it here is what lets the MongoDB strategy change
 * (aggregation today, Atlas Search later) without touching a call site.
 *
 * Two rules from §21.4 shape the whole pipeline:
 *
 *   1. Blocks and visibility are applied FIRST, in `$match`, before anything is ranked, counted
 *      or paged. Filtering afterwards would let an excluded candidate influence the total and
 *      the page boundaries — they would be invisible but still leave a hole in the results.
 *   2. Within a facet OR, between facets AND. Each facet contributes one `$in`; the facets are
 *      ANDed by sitting together in one `$match`.
 */

import { CANDIDATE_SEARCH_SORTS, ACTIVE_INTEREST_STATES } from '@evallo/shared';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import {
  searchableCandidateFilter,
  resolveCandidateAccess,
} from '../candidates/candidateAccess.service.js';
import { User } from '../users/user.model.js';
import { ExpressionOfInterest } from './../interests/expressionOfInterest.model.js';

/** Escapes a user string so it is matched literally rather than as a pattern. */
function literal(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keyword match — PRD §21.4: headline, summary, subjects, roles, and the person's name.
 *
 * Experience, institutions, credentials and portfolio metadata are named in the same criterion
 * but live in the evidence collections ADR-008 has not built yet; they join this list when they
 * exist. Nothing here reaches a hidden or private field: every one of these is already part of
 * the recruiter-visible profile.
 */
function keywordMatch(q) {
  const rx = new RegExp(literal(q), 'i');

  return {
    $or: [
      { headline: rx },
      { summary: rx },
      { subjects: rx },
      { targetRoles: rx },
      { 'user.name': rx },
    ],
  };
}

/** One `$in` per facet. Absent facets contribute nothing, so they do not narrow the search. */
function facetMatch(query) {
  const match = {};

  if (query.role?.length) match.targetRoles = { $in: query.role };
  if (query.subject?.length) match.subjects = { $in: query.subject };
  if (query.learnerSegment?.length) match.learnerSegments = { $in: query.learnerSegment };
  if (query.employmentType?.length) match.employmentTypes = { $in: query.employmentType };
  if (query.deliveryMode?.length) match.deliveryModes = { $in: query.deliveryMode };
  if (query.availability?.length) match.availability = { $in: query.availability };

  // Country and language belong to the personal layer on `users` (05_DATABASE_SCHEMA §2),
  // which is why the pipeline joins before this stage rather than filtering profiles alone.
  if (query.country?.length) match['user.location.country'] = { $in: query.country };
  if (query.language?.length) match['user.languages'] = { $in: query.language };
  if (query.region) match['user.location.region'] = new RegExp(literal(query.region), 'i');

  if (query.minYears !== undefined || query.maxYears !== undefined) {
    match.yearsExperience = {};
    if (query.minYears !== undefined) match.yearsExperience.$gte = query.minYears;
    if (query.maxYears !== undefined) match.yearsExperience.$lte = query.maxYears;
  }

  return match;
}

/** Sorts are facts about the record, never a judgement about the person (PRD §10.3). */
function buildSort(sort) {
  if (sort === CANDIDATE_SEARCH_SORTS.NEWEST) return { publishedAt: -1, createdAt: -1 };
  if (sort === CANDIDATE_SEARCH_SORTS.NAME) return { 'user.name': 1 };
  return { lastActiveAt: -1, updatedAt: -1 };
}

/**
 * PRD §21.4 — "show why each candidate matches".
 *
 * Reports which of the caller's OWN criteria this record satisfied, so a recruiter can see the
 * result is a consequence of what they asked for. It is an explanation, not a score: nothing
 * here is summed, weighted, or used to order anything.
 */
function explainMatch(profile, user, query) {
  const reasons = [];
  const overlap = (selected, held) =>
    (selected ?? []).filter((value) => (held ?? []).includes(value));

  const roles = overlap(query.role, profile.targetRoles);
  if (roles.length) reasons.push({ facet: 'role', values: roles });

  const subjects = overlap(query.subject, profile.subjects);
  if (subjects.length) reasons.push({ facet: 'subject', values: subjects });

  const segments = overlap(query.learnerSegment, profile.learnerSegments);
  if (segments.length) reasons.push({ facet: 'learnerSegment', values: segments });

  const employment = overlap(query.employmentType, profile.employmentTypes);
  if (employment.length) reasons.push({ facet: 'employmentType', values: employment });

  const delivery = overlap(query.deliveryMode, profile.deliveryModes);
  if (delivery.length) reasons.push({ facet: 'deliveryMode', values: delivery });

  if (query.availability?.length && query.availability.includes(profile.availability)) {
    reasons.push({ facet: 'availability', values: [profile.availability] });
  }

  const languages = overlap(query.language, user?.languages);
  if (languages.length) reasons.push({ facet: 'language', values: languages });

  if (query.country?.length && query.country.includes(user?.location?.country)) {
    reasons.push({ facet: 'country', values: [user.location.country] });
  }

  if (query.minYears !== undefined || query.maxYears !== undefined) {
    if (typeof profile.yearsExperience === 'number') {
      reasons.push({ facet: 'experience', values: [`${profile.yearsExperience} years`] });
    }
  }

  if (query.q) {
    const rx = new RegExp(literal(query.q), 'i');
    const fields = [
      ['headline', profile.headline],
      ['summary', profile.summary],
      ['name', user?.name],
    ]
      .filter(([, value]) => typeof value === 'string' && rx.test(value))
      .map(([field]) => field);

    const inSubjects = (profile.subjects ?? []).filter((s) => rx.test(s));
    if (inSubjects.length) fields.push('subjects');

    if (fields.length) reasons.push({ facet: 'keyword', values: fields });
  }

  return reasons;
}

/**
 * A search card.
 *
 * Built from `toRecruiterView` — the ONE recruiter representation, shared with CAN-03 — so a
 * card can never surface something the full profile would withhold. The evidence block and the
 * contact block are dropped rather than re-derived: this screen is discovery, and a card is a
 * reason to open a profile, not a substitute for opening one.
 */
function toSearchCard(profileDoc, user, query, contactRevealed) {
  const recruiterView = profileDoc.toRecruiterView({
    name: user?.name ?? null,
    photoUrl: user?.profilePicture ?? null,
    location: user?.location ?? null,
    languages: user?.languages ?? [],
    email: user?.email,
    contactRevealed,
  });

  return {
    id: String(profileDoc._id),
    header: recruiterView.header,
    introduction: recruiterView.introduction,
    expertise: recruiterView.expertise,
    /** Why this record satisfied the caller's criteria (PRD §21.4). */
    matchedOn: explainMatch(profileDoc, user, query),
    lastActiveAt: profileDoc.lastActiveAt ?? null,
  };
}

/**
 * REC-12 — search candidates this company is permitted to discover.
 *
 * @param {object} company  Resolved by resolveCompanyContext
 * @param {object} query    Already validated by candidateSearchQuerySchema
 */
export async function searchCandidates(company, query) {
  const skip = (query.page - 1) * query.limit;

  /*
   * Stage order is the §21.4 guarantee made literal: the visibility gate runs before the join,
   * before the facets, and before paging. `discoverable` only — `private` and `paused` are
   * reachable through a grant but are explicitly excluded from SEARCH by §4.3.
   */
  const pipeline = [
    { $match: searchableCandidateFilter(company._id) },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
  ];

  const facets = facetMatch(query);
  if (Object.keys(facets).length > 0) pipeline.push({ $match: facets });
  if (query.q) pipeline.push({ $match: keywordMatch(query.q) });

  /*
   * `$facet` returns the page and the total from ONE pass. Counting separately would re-run
   * every stage above, and — worse — could disagree with the page if a profile changed
   * visibility between the two queries.
   */
  pipeline.push({
    $facet: {
      rows: [{ $sort: buildSort(query.sort) }, { $skip: skip }, { $limit: query.limit }, { $project: { _id: 1 } }],
      total: [{ $count: 'value' }],
    },
  });

  const [result] = await CandidateProfile.aggregate(pipeline);
  const ids = (result?.rows ?? []).map((row) => row._id);
  const total = result?.total?.[0]?.value ?? 0;

  if (ids.length === 0) {
    return { candidates: [], meta: emptyMeta(query, total) };
  }

  /*
   * The pipeline projects ids only, then the documents are re-read as Mongoose models. That is
   * deliberate: `toRecruiterView` is a document method, and rehydrating is what lets search
   * share the serializer instead of growing an aggregation-shaped copy of it.
   */
  const profiles = await CandidateProfile.find({ _id: { $in: ids } });
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } })
    .select('name email profilePicture location languages')
    .lean();

  const userById = new Map(users.map((u) => [String(u._id), u]));

  /*
   * Which of these candidates has an open interest in this company, in one query rather than one
   * per row — `after_interest` contact visibility needs the answer, and asking per candidate
   * would be N round trips to compute a boolean.
   */
  const interested = new Set(
    (
      await ExpressionOfInterest.find({
        companyId: company._id,
        candidateId: { $in: ids },
        status: { $in: ACTIVE_INTEREST_STATES },
      })
        .select('candidateId')
        .lean()
    ).map((row) => String(row.candidateId)),
  );

  // Order is decided by the pipeline; preserve it through the rehydration.
  const byId = new Map(profiles.map((p) => [String(p._id), p]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);

  const resolved = await Promise.all(
    ordered.map(async (profile) => {
      const access = await resolveCandidateAccess(profile, company._id, {
        interested: interested.has(String(profile._id)),
      });
      return { profile, access };
    }),
  );

  /*
   * Defence in depth, not decoration.
   *
   * `searchableCandidateFilter` and `resolveCandidateAccess` are two expressions of §4.3 — one as
   * a query, one as a decision — and they live together precisely so they cannot drift. Re-asking
   * per row means that if they ever DO disagree, the answer that reaches a recruiter is the
   * restrictive one. A candidate dropped here still counts toward `total`, which is the right
   * trade: a slightly high count is a cosmetic flaw, showing someone who opted out is not.
   */
  const cards = resolved
    .filter(({ access }) => access.visible)
    .map(({ profile, access }) =>
      toSearchCard(profile, userById.get(String(profile.userId)), query, access.contactRevealed),
    );

  return { candidates: cards, meta: emptyMeta(query, total) };
}

function emptyMeta(query, total) {
  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    hasMore: query.page * query.limit < total,
  };
}
