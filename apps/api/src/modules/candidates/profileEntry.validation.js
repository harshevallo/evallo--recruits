/**
 * CAN-02 entry contracts (ADR-009).
 *
 * Drafting is never blocked (PRD §8.3), so only the identifying field of each kind is required —
 * a half-filled role still saves. Publication requirements are enforced at publish time, not here.
 */

import { z } from 'zod';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { providerFor } from './profileEntry.model.js';

/** `YYYY-MM`. Month precision is all the UI collects, and all anyone reliably remembers. */
const monthish = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month, for example 2024-08')
  .or(z.literal(''))
  .nullable()
  .optional();

const itemVisibility = z
  .enum([CANDIDATE_VISIBILITY.DISCOVERABLE, CANDIDATE_VISIBILITY.PRIVATE])
  .optional();

const kindParam = z.object({
  kind: z.enum(['experience', 'education', 'credential', 'media']),
});

const entryParam = kindParam.extend({
  entryId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'Invalid entry'),
});

const experienceBody = z.object({
  role: z.string().trim().min(1, 'Role title is required').max(160),
  organization: z.string().trim().min(1, 'Organization is required').max(160),
  location: z.string().trim().max(160).optional(),
  deliveryMode: z.string().trim().max(40).optional(),
  startDate: monthish,
  endDate: monthish,
  current: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
  outcome: z.string().trim().max(400).optional(),
  visibility: itemVisibility,
  sortOrder: z.coerce.number().int().optional(),
});

const educationBody = z.object({
  institution: z.string().trim().min(1, 'Institution is required').max(160),
  qualification: z.string().trim().max(160).optional(),
  fieldOfStudy: z.string().trim().max(160).optional(),
  startDate: monthish,
  endDate: monthish,
  current: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
  visibility: itemVisibility,
  sortOrder: z.coerce.number().int().optional(),
});

const credentialBody = z.object({
  name: z.string().trim().min(1, 'Credential name is required').max(160),
  credentialType: z.string().trim().max(60).optional(),
  issuer: z.string().trim().max(160).optional(),
  result: z.string().trim().max(160).optional(),
  documentUrl: z.string().trim().url('Enter a valid link').max(500).or(z.literal('')).optional(),
  startDate: monthish,
  endDate: monthish,
  description: z.string().trim().max(2000).optional(),
  visibility: itemVisibility,
  sortOrder: z.coerce.number().int().optional(),
});

/**
 * Portfolio media. The URL must resolve to an allowed embed provider (PRD §16.3) — checked here
 * so an unsupported link is refused with a field error rather than stored and rendered later.
 */
const mediaBody = z.object({
  title: z.string().trim().min(1, 'Give the video a title').max(160),
  url: z
    .string()
    .trim()
    .url('Enter a valid video link')
    .max(500)
    .refine((value) => providerFor(value) !== null, 'Only YouTube and Vimeo links are supported'),
  prompt: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  visibility: itemVisibility,
  sortOrder: z.coerce.number().int().optional(),
});

/**
 * The body schema depends on `:kind`, so it is chosen per request rather than fixed. A partial
 * update reuses the same shape with every field optional — editing one field must not require
 * resending the rest.
 */
function bodyFor(kind, { partial = false } = {}) {
  const schema =
    { education: educationBody, credential: credentialBody, media: mediaBody }[kind] ??
    experienceBody;
  return partial ? schema.partial() : schema;
}

export const listEntriesValidation = { params: kindParam };
export const removeEntryValidation = { params: entryParam };

export const createEntryValidation = {
  params: kindParam,
  body: z.unknown(),
  /** Re-validated in the handler chain below, once `:kind` is known. */
};

export { bodyFor, kindParam, entryParam, experienceBody, educationBody, credentialBody, mediaBody };
