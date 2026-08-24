import { z } from 'zod';
import { common, isDiallableCountry, isAccountLanguage } from '@evallo/shared';

/**
 * A country that actually has a dialling code.
 *
 * Tighter than `common.countryCode`, which only checks the length: this refuses `OTHER`
 * ("Elsewhere", 5 chars and not a place you can telephone) and any two-letter string that is not
 * an ISO territory with an assigned code. `''` is allowed so the field can be CLEARED — without it
 * a person could set a dialling country but never remove one.
 */
const diallableCountry = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === '' || isDiallableCountry(value), 'Choose a country from the list');

export const updateProfileValidation = {
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    headline: z.string().trim().max(200).optional(),
    /*
      * Unchanged, deliberately. `phone` has always accepted free text up to 40 characters, and
      * tightening it to a digit format now would reject numbers people legitimately have
      * (extensions, spacing, national conventions). The picker composes into this; it does not
      * narrow what may be stored.
      */
    phone: z.string().trim().max(40).optional(),
    phoneCountry: diallableCountry.optional(),
    profilePicture: z.string().trim().url().max(2048).optional(),
    location: z
      .object({
        country: common.countryCode.optional(),
        region: z.string().trim().max(120).optional(),
        city: z.string().trim().max(120).optional(),
        timezone: common.timezone.optional(),
      })
      .optional(),
    /*
      * Teaching languages. Left as free-ish strings, as it has always been — the question bank
      * validates this field against `LANGUAGE_OPTIONS` on its own route, and tightening it here
      * would reject values the builder legitimately writes.
      */
    languages: z.array(z.string().trim().max(60)).max(20).optional(),

    /* Account languages ARE closed: only the curated list, so no value can reach the field that
       the selector could not then display back. */
    accountLanguages: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .refine(isAccountLanguage, 'Choose a language from the list'),
      )
      .max(20)
      .optional(),
  }),
};
