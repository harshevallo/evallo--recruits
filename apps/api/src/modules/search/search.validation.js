/**
 * REC-12 request contract (ADR-009).
 *
 * The query schema lives in `@evallo/shared` beside the taxonomy it validates against, so the
 * facet vocabulary the API accepts and the one the UI renders are the same list.
 */

import { z } from 'zod';
import { candidateSearchQuerySchema } from '@evallo/shared';

export const candidateSearchValidation = {
  params: z.object({ companyId: z.string().trim().min(1).max(80) }),
  query: candidateSearchQuerySchema,
};
