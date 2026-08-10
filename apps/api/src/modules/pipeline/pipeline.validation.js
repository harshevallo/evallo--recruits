/**
 * REC-14 request contracts (ADR-009).
 *
 * The reason code and hire fields are validated in the SERVICE rather than only here, because
 * "rejection requires a reason" (PRD §21.4) is a product rule that must hold for every caller, not
 * a property of one HTTP shape.
 */

import { z } from 'zod';
import { PIPELINE_STAGE_ORDER } from '@evallo/shared';
import { PIPELINE_SOURCES, REJECTION_REASONS } from './pipelineEntry.model.js';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const companyParams = z.object({ companyId: z.string().trim().min(1).max(80) });

export const pipelineListValidation = {
  params: companyParams,
  query: z.object({
    /** Closed entries are hidden by default; the board is about live work. */
    includeClosed: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  }),
};

export const addToPipelineValidation = {
  params: companyParams,
  body: z.object({
    candidateId: objectId,
    stage: z.enum(PIPELINE_STAGE_ORDER).optional(),
    source: z.enum(Object.values(PIPELINE_SOURCES)).optional(),
    interestId: objectId.nullish(),
    roleIntentIds: z.array(objectId).max(20).optional(),
  }),
};

export const pipelineEntryParamValidation = {
  params: companyParams.extend({ entryId: objectId }),
};

export const changeStageValidation = {
  params: companyParams.extend({ entryId: objectId }),
  body: z.object({
    stage: z.enum(PIPELINE_STAGE_ORDER),
    reasonCode: z.enum(Object.values(REJECTION_REASONS)).nullish(),
    note: z.string().trim().max(2000).nullish(),
    outcome: z
      .object({
        roleTitle: z.string().trim().max(160).optional(),
        /** Month precision, matching the rest of the app's date inputs. */
        startDate: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}$/, 'Use a month, for example 2026-09')
          .optional(),
      })
      .default({}),
  }),
};

export const assignEntryValidation = {
  params: companyParams.extend({ entryId: objectId }),
  body: z.object({ ownerId: objectId.nullable() }),
};

export const entryDetailsValidation = {
  params: companyParams.extend({ entryId: objectId }),
  body: z.object({
    nextAction: z.string().trim().max(500).nullish(),
    interview: z
      .object({
        scheduledFor: z.coerce.date().nullish(),
        interviewerUserId: objectId.nullish(),
        feedback: z.string().trim().max(4000).nullish(),
      })
      .optional(),
  }),
};

export const savedCandidateValidation = {
  params: companyParams,
  body: z.object({ candidateId: objectId }),
};

export const savedCandidateParamValidation = {
  params: companyParams.extend({ candidateId: objectId }),
};
