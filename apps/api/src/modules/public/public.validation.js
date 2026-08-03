import { z } from 'zod';
import {
  earlyAccessRequestSchema,
  companyDirectoryQuerySchema,
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

export const companyProfileValidation = { params: slugParam };

export const companyInterestValidation = {
  params: slugParam,
  body: publicInterestSchema,
};
