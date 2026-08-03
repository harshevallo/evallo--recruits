/**
 * Expression of interest — PUB-02 (PRD §8.7, §11.1).
 *
 * Authentication is not built yet (M1). Until it is, interest is captured from the public
 * company page with contact details supplied inline. When AUTH lands, `candidateId` is populated
 * and these fields come from the candidate profile instead — the record shape does not change.
 */

import { z } from 'zod';
import { email, personName, objectId } from './common.schema.js';

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
