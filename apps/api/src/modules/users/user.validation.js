import { z } from 'zod';
import { common } from '@evallo/shared';

export const updateProfileValidation = {
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    headline: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(40).optional(),
    profilePicture: z.string().trim().url().max(2048).optional(),
    location: z
      .object({
        country: common.countryCode.optional(),
        region: z.string().trim().max(120).optional(),
        city: z.string().trim().max(120).optional(),
        timezone: common.timezone.optional(),
      })
      .optional(),
    languages: z.array(z.string().trim().max(60)).max(20).optional(),
  }),
};
