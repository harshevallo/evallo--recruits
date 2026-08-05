/**
 * Expression of interest — PUB-02 (PRD §8.7, §11.1).
 *
 * Authentication is not built yet (M1). Until it is, interest is captured from the public
 * company page with contact details supplied inline. When AUTH lands, `candidateId` is populated
 * and these fields come from the candidate profile instead — the record shape does not change.
 */

import { z } from 'zod';
import { email, personName, objectId, multiValue, paginationQuery } from './common.schema.js';
import {
  INTEREST_STATUS_VALUES,
  INTEREST_INBOX_SORT_VALUES,
  RECRUITER_INTEREST_STATUS_VALUES,
} from '../constants/states.js';

export const publicInterestSchema = z.object({
  name: personName,
  email,
  /** Optional short note — PRD §8.7 step 5. */
  message: z.string().trim().max(1000, 'Keep your note under 1000 characters').optional(),
  /** Specific role intent, or omitted for general company interest (PRD §8.7 step 4). */
  hiringIntentId: objectId.optional(),
  /** PRD §8.7 step 6 — the candidate must see and accept what the company will receive. */
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm before submitting' }),
  }),
});

export const interestDefaults = Object.freeze({
  name: '',
  email: '',
  message: '',
  hiringIntentId: '',
  consent: false,
});

/* ── REC-11 interest inbox ────────────────────────────────────────────────────────────────── */

/**
 * Recruiter inbox query (PRD §9.2, §11.1).
 *
 * Offset paging rather than a cursor: the inbox shows per-status counts and a page count, and
 * both need a stable total (04_API_DOCUMENTATION §1).
 */
export const interestInboxQuerySchema = z
  .object({
    status: multiValue(INTEREST_STATUS_VALUES),
    hiringIntentId: objectId.optional(),
    /** Only general company interest, i.e. rows tied to no specific role (PRD §8.7 step 4). */
    generalOnly: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === true || v === 'true'),
    q: z.string().trim().max(120).optional(),
    sort: z.enum(INTEREST_INBOX_SORT_VALUES).default('newest'),
  })
  .merge(paginationQuery);

/** Statuses a recruiter may set from the inbox. Withdrawal belongs to the candidate (§21.5). */
export const interestStatusUpdateSchema = z.object({
  status: z.enum(RECRUITER_INTEREST_STATUS_VALUES, {
    errorMap: () => ({ message: 'Choose a valid status' }),
  }),
});
