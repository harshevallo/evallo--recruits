/**
 * REC-11 interest inbox request contracts (ADR-009).
 *
 * The query and body schemas live in `@evallo/shared` beside the INTEREST_STATUS enum, so the
 * validator and the service guard read from one list rather than two that can drift.
 */

import { z } from 'zod';
import { interestInboxQuerySchema, interestStatusUpdateSchema } from '@evallo/shared';

const companyParam = z.object({ companyId: z.string().trim().min(1).max(80) });

const interestParam = companyParam.extend({
  interestId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'Invalid interest'),
});

export const interestInboxValidation = {
  params: companyParam,
  query: interestInboxQuerySchema,
};

export const interestStatusValidation = {
  params: interestParam,
  body: interestStatusUpdateSchema,
};

export const interestParamValidation = { params: interestParam };
