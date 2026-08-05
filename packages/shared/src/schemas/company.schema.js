/**
 * Public company directory contract — PUB-01 (PRD §9.1).
 *
 * §9.1: "Company directory pages may be public and searchable by organization type, location,
 * programs, and active hiring roles."
 */

import { z } from 'zod';
import {
  ORGANIZATION_TYPE_VALUES,
  EDUCATION_SERVICE_VALUES,
  ROLE_CATEGORY_VALUES,
  DELIVERY_MODE_VALUES,
} from '../taxonomy/index.js';
import { multiValue } from './common.schema.js';

export const COMPANY_DIRECTORY_SORTS = Object.freeze({
  RELEVANCE: 'relevance',
  RECENT: 'recent',
  NAME: 'name',
});

export const COMPANY_DIRECTORY_SORT_OPTIONS = Object.freeze([
  { value: COMPANY_DIRECTORY_SORTS.RELEVANCE, label: 'Most relevant' },
  { value: COMPANY_DIRECTORY_SORTS.RECENT, label: 'Recently updated' },
  { value: COMPANY_DIRECTORY_SORTS.NAME, label: 'Name (A–Z)' },
]);

export const companyDirectoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  organizationType: multiValue(ORGANIZATION_TYPE_VALUES),
  service: multiValue(EDUCATION_SERVICE_VALUES),
  roleCategory: multiValue(ROLE_CATEGORY_VALUES),
  deliveryMode: multiValue(DELIVERY_MODE_VALUES),
  country: z.string().trim().toUpperCase().length(2).optional(),
  hiringOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  sort: z
    .enum(Object.values(COMPANY_DIRECTORY_SORTS))
    .default(COMPANY_DIRECTORY_SORTS.RELEVANCE),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

/** Filter keys that are arrays — used by the UI to toggle values. */
export const COMPANY_DIRECTORY_ARRAY_FILTERS = Object.freeze([
  'organizationType',
  'service',
  'roleCategory',
  'deliveryMode',
]);
