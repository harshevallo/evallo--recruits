/**
 * Candidate-facing ROLE search contract — the meeting's "Search for Roles".
 *
 * Distinct from two things it could be confused with:
 *
 *   `companyDirectoryQuerySchema`  searches COMPANIES and can filter *by* role category. Its result
 *                                  is an organisation; a role is a tag on it.
 *   `candidateSearchQuerySchema`   is REC-12, the recruiter searching candidates. Opposite direction.
 *
 * This searches hiring intents across every publicly visible company, and its result is a role.
 *
 * Every filter maps onto a field `hiringIntents` actually stores. Compensation is deliberately NOT
 * a filter: each intent carries its own `compensation.visibility`, most are `hidden`, and a range
 * filter over a field that is usually withheld would silently drop the majority of roles from the
 * results — a filter that quietly removes what you were looking for is worse than one not offered.
 * Compensation is still DISPLAYED where its visibility permits.
 */

import { z } from 'zod';
import { multiValue } from './common.schema.js';
import { ROLE_CATEGORY_VALUES, EMPLOYMENT_TYPE_VALUES, DELIVERY_MODE_VALUES } from '../taxonomy/hiring.js';
import { SUBJECT_VALUES, COUNTRY_VALUES } from '../taxonomy/candidate.js';

/**
 * Sorts offered by role search.
 *
 * No "best match" or "recommended", for the same reason PRD §10.3 forbids it on the recruiter
 * side: with no relevance model to draw on, such an option would be an invented ordering wearing
 * an authoritative name. `relevance` here means the text score when a keyword is present and
 * recency otherwise — a mechanical fact, not a judgement about the role.
 */
export const ROLE_SEARCH_SORTS = Object.freeze({
  RELEVANCE: 'relevance',
  NEWEST: 'newest',
  TITLE: 'title',
});

export const ROLE_SEARCH_SORT_VALUES = Object.freeze(Object.values(ROLE_SEARCH_SORTS));

export const ROLE_SEARCH_SORT_OPTIONS = Object.freeze([
  { value: ROLE_SEARCH_SORTS.RELEVANCE, label: 'Most relevant' },
  { value: ROLE_SEARCH_SORTS.NEWEST, label: 'Newest first' },
  { value: ROLE_SEARCH_SORTS.TITLE, label: 'Title (A–Z)' },
]);

/** Within a facet OR, between facets AND — the same rule the other two searches follow. */
export const roleSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  roleCategory: multiValue(ROLE_CATEGORY_VALUES),
  subject: multiValue(SUBJECT_VALUES),
  employmentType: multiValue(EMPLOYMENT_TYPE_VALUES),
  deliveryMode: multiValue(DELIVERY_MODE_VALUES),
  country: multiValue(COUNTRY_VALUES),
  /** Free text: intent locations store a region/city the company typed, not a closed vocabulary. */
  region: z.string().trim().max(120).optional(),
  /** A role asking for AT MOST this much experience — the candidate's ceiling, not the role's. */
  maxYears: z.coerce.number().int().min(0).max(60).optional(),
  sort: z.enum(ROLE_SEARCH_SORT_VALUES).default(ROLE_SEARCH_SORTS.RELEVANCE),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

/** Filter keys the UI renders as multi-select groups. */
export const ROLE_SEARCH_ARRAY_FILTERS = Object.freeze([
  'roleCategory',
  'subject',
  'employmentType',
  'deliveryMode',
  'country',
]);
