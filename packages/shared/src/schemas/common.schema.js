/**
 * Reusable Zod primitives — ADR-009.
 *
 * Every domain schema composes from these so validation rules stay identical across the API.
 * Under ADR-002 there is no compiler, so these schemas ARE the type system.
 */

import { z } from 'zod';

/** MongoDB ObjectId as a string. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

/**
 * Email. Lowercased and trimmed so the value that reaches the database is already normalised —
 * the `users.email` and `earlyAccessRequests.email` unique indexes depend on it.
 */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email address is required')
  .email('Enter a valid email address')
  .max(254, 'Email address is too long');

/**
 * Person or organisation name.
 * No character-class restriction: PRD §19 requires Unicode name support.
 */
export const personName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

/** Public URL. http/https only — never accept javascript: or data: (PRD §16.3). */
export const httpUrl = z
  .string()
  .trim()
  .url('Enter a valid URL')
  .refine(
    (value) => /^https?:\/\//i.test(value),
    'URL must start with http:// or https://',
  );

/** URL-safe public slug — PRD §17 requires stable, human-readable company URLs. */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Must be at least 3 characters')
  .max(60, 'Must be 60 characters or fewer')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only');

/** ISO 3166-1 alpha-2 country code. */
export const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, 'Use a two-letter country code');

/** IANA time zone identifier, e.g. "Asia/Kolkata". */
export const timezone = z.string().trim().min(1).max(64);

export const isoDate = z.coerce.date();

/** Offset pagination — used where a stable total is required. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Cursor pagination — used for search, messages, and other large or shifting collections. */
export const cursorQuery = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Structured location, reused by users, companies, and candidate profiles. */
export const location = z.object({
  country: countryCode,
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  timezone: timezone.optional(),
});
