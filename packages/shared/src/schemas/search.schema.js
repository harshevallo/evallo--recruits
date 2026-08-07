/**
 * REC-12 talent search contract — PRD §10, §21.4, Appendix B.
 *
 * Every facet here maps onto a field the data model actually stores. PRD Appendix B also lists
 * skills, institutions and credentials; those live in the evidence collections ADR-008 defers,
 * so they are absent rather than accepted-and-ignored — a filter that silently does nothing is
 * worse than a filter that is not offered.
 */

import { z } from 'zod';
import { multiValue, paginationQuery } from './common.schema.js';
import {
  CANDIDATE_ROLE_VALUES,
  SUBJECT_VALUES,
  LEARNER_SEGMENT_VALUES,
  AVAILABILITY_VALUES,
  COUNTRY_VALUES,
  LANGUAGE_VALUES,
} from '../taxonomy/candidate.js';
import { EMPLOYMENT_TYPE_VALUES, DELIVERY_MODE_VALUES } from '../taxonomy/hiring.js';

/**
 * Sorts offered by talent search.
 *
 * There is deliberately no "best match" or "recommended" order. PRD §10.3 makes it
 * non-negotiable that results never imply objective quality ranking, and with no relevance score
 * to draw on any such option would be an invented ordering wearing an authoritative name. Each
 * of these is a fact about the record, not a judgement about the person.
 */
export const CANDIDATE_SEARCH_SORTS = Object.freeze({
  RECENT: 'recent',
  NEWEST: 'newest',
  NAME: 'name',
});

export const CANDIDATE_SEARCH_SORT_VALUES = Object.freeze(Object.values(CANDIDATE_SEARCH_SORTS));

export const CANDIDATE_SEARCH_SORT_OPTIONS = Object.freeze([
  { value: CANDIDATE_SEARCH_SORTS.RECENT, label: 'Recently active' },
  { value: CANDIDATE_SEARCH_SORTS.NEWEST, label: 'Newest profiles' },
  { value: CANDIDATE_SEARCH_SORTS.NAME, label: 'Name (A–Z)' },
]);

/**
 * PRD §21.4: within a facet OR, between facets AND. Every array below is one facet.
 *
 * `minYears`/`maxYears` are a range on a single field rather than a facet, so they AND with
 * everything else in the usual way.
 */
export const candidateSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: multiValue(CANDIDATE_ROLE_VALUES),
    subject: multiValue(SUBJECT_VALUES),
    learnerSegment: multiValue(LEARNER_SEGMENT_VALUES),
    employmentType: multiValue(EMPLOYMENT_TYPE_VALUES),
    deliveryMode: multiValue(DELIVERY_MODE_VALUES),
    availability: multiValue(AVAILABILITY_VALUES),
    country: multiValue(COUNTRY_VALUES),
    language: multiValue(LANGUAGE_VALUES),
    region: z.string().trim().max(120).optional(),
    minYears: z.coerce.number().int().min(0).max(60).optional(),
    maxYears: z.coerce.number().int().min(0).max(60).optional(),
    sort: z.enum(CANDIDATE_SEARCH_SORT_VALUES).default(CANDIDATE_SEARCH_SORTS.RECENT),
  })
  .merge(paginationQuery)
  .refine(
    (v) => v.minYears === undefined || v.maxYears === undefined || v.minYears <= v.maxYears,
    { message: 'Minimum years cannot exceed maximum', path: ['minYears'] },
  );

/** Facet keys the UI renders as multi-select groups. */
export const CANDIDATE_SEARCH_ARRAY_FILTERS = Object.freeze([
  'role',
  'subject',
  'learnerSegment',
  'employmentType',
  'deliveryMode',
  'availability',
  'country',
  'language',
]);
