/**
 * REC-05 / REC-16 request contracts (ADR-009).
 *
 * Note what is NOT required: `description`. PRD §7.5 forbids making it mandatory, so it is optional
 * here and in the model, and the service's activation check never looks at it.
 */

import { z } from 'zod';
import {
  HIRING_INTENT_STATUS,
  ROLE_CATEGORY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  DELIVERY_MODE_VALUES,
} from '@evallo/shared';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const companyParams = z.object({ companyId: z.string().trim().min(1).max(80) });

/** Shared by create and update. Every field optional — a draft may be saved half-finished. */
const intentBody = z.object({
  title: z.string().trim().max(160).optional(),
  roleCategories: z.array(z.enum(ROLE_CATEGORY_VALUES)).max(20).optional(),
  specializations: z
    .object({
      subjects: z.array(z.string().trim().max(80)).max(40).optional(),
      tests: z.array(z.string().trim().max(80)).max(40).optional(),
      gradeBands: z.array(z.string().trim().max(80)).max(40).optional(),
      curricula: z.array(z.string().trim().max(80)).max(40).optional(),
    })
    .optional(),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPE_VALUES)).max(10).optional(),
  deliveryModes: z.array(z.enum(DELIVERY_MODE_VALUES)).max(5).optional(),
  locations: z
    .array(
      z.object({
        country: z.string().trim().max(2).optional(),
        region: z.string().trim().max(120).optional(),
        city: z.string().trim().max(120).optional(),
        timezones: z.array(z.string().trim().max(60)).max(10).optional(),
        relocationExpected: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),
  experienceLevels: z.array(z.string().trim().max(40)).max(10).optional(),
  minYears: z.coerce.number().int().min(0).max(60).nullish(),
  availability: z
    .object({
      type: z.string().trim().max(40).optional(),
      targetStartMonth: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}$/, 'Use a month, for example 2026-09')
        .optional(),
    })
    .optional(),
  compensation: z
    .object({
      min: z.coerce.number().min(0).nullish(),
      max: z.coerce.number().min(0).nullish(),
      currency: z.string().trim().max(8).optional(),
      period: z.string().trim().max(20).optional(),
      visibility: z.enum(['hidden', 'range', 'exact']).optional(),
    })
    .optional(),
  description: z.string().trim().max(5000).optional(),
  /** Max three — PRD §7.5 and §8.7 both state it, so it is enforced at the edge and in the model. */
  interestQuestions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(300),
        required: z.boolean().default(false),
      }),
    )
    .max(3, 'A maximum of three interest questions is allowed')
    .optional(),
});

export const listHiringIntentsValidation = { params: companyParams };

export const createHiringIntentValidation = { params: companyParams, body: intentBody };

export const hiringIntentParamValidation = {
  params: companyParams.extend({ intentId: objectId }),
};

export const updateHiringIntentValidation = {
  params: companyParams.extend({ intentId: objectId }),
  body: intentBody,
};

export const changeIntentStatusValidation = {
  params: companyParams.extend({ intentId: objectId }),
  body: z.object({
    status: z.enum(Object.values(HIRING_INTENT_STATUS)),
    reason: z.string().trim().max(500).nullish(),
  }),
};
