import { z } from 'zod';
import {
  earlyAccessRequestSchema,
  companyDirectoryQuerySchema,
  roleSearchQuerySchema,
  publicInterestSchema,
} from '@evallo/shared';

const slugParam = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid company address'),
});

export const earlyAccessValidation = { body: earlyAccessRequestSchema };

export const companyDirectoryValidation = { query: companyDirectoryQuerySchema };

export const roleSearchValidation = { query: roleSearchQuerySchema };

/*
 * The role detail param. Shape-checked here so a malformed id is a 400 rather than reaching the
 * database — the service still re-checks with `isValidObjectId`, because it is also called from
 * places that do not pass through this middleware.
 */
export const roleDetailValidation = {
  params: z.object({
    roleId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'Invalid role'),
  }),
};

export const companyProfileValidation = { params: slugParam };

export const companyInterestValidation = {
  params: slugParam,
  body: publicInterestSchema,
};
