import { z } from 'zod';
import { common, ORGANIZATION_TYPE_VALUES } from '@evallo/shared';

export const createCompanyValidation = {
  body: z.object({
    name: z.string().trim().min(2, 'Company name is required').max(120),
    organizationType: z.enum(ORGANIZATION_TYPE_VALUES, {
      errorMap: () => ({ message: 'Choose an organization type' }),
    }),
    tagline: z.string().trim().max(160).optional(),
    location: z.object({
      country: common.countryCode,
      region: z.string().trim().max(120).optional(),
      city: z.string().trim().max(120).optional(),
    }),
  }),
};

export const companyParamValidation = {
  params: z.object({ companyId: z.string().trim().min(1).max(80) }),
};
