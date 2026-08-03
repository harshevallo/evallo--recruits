/**
 * Early-access (pilot waitlist) contract — MKT-01.
 *
 * The SAME schema validates the React form and the Express request (ADR-009), so the rules
 * cannot drift.
 *
 * Note what is absent: no password, and nothing that creates an account. Per ADR-014 this
 * captures a lead, not a user — the "I am a…" selector is a role question, and PRD §21.1
 * forbids the sign-up screen from asking one.
 */

import { z } from 'zod';
import { EARLY_ACCESS_SEGMENT } from '../constants/states.js';
import { email, personName } from './common.schema.js';

export const earlyAccessSegment = z.enum([
  EARLY_ACCESS_SEGMENT.BUSINESS,
  EARLY_ACCESS_SEGMENT.EDUCATOR,
]);

/** Request body for POST /api/public/early-access. */
export const earlyAccessRequestSchema = z.object({
  segment: earlyAccessSegment,
  name: personName,
  email,
});

/**
 * Initial form state. Mirrors the prototype's default selection — the first <option> is
 * "Tutoring Business / School".
 */
export const earlyAccessDefaults = Object.freeze({
  segment: EARLY_ACCESS_SEGMENT.BUSINESS,
  name: '',
  email: '',
});

/** Labels for the "I am a…" selector, in prototype order. */
export const EARLY_ACCESS_SEGMENT_OPTIONS = Object.freeze([
  { value: EARLY_ACCESS_SEGMENT.BUSINESS, label: 'Tutoring Business / School' },
  { value: EARLY_ACCESS_SEGMENT.EDUCATOR, label: 'Educator / Tutor' },
]);
