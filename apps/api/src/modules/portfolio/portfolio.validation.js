/**
 * Share-token parameter shape — ADR-019.
 *
 * The token is generated as 32 random bytes in base64url, so its alphabet and length are both
 * known exactly. Pinning them here means a malformed token is rejected by the validation layer
 * before it ever reaches a database query, which keeps the endpoint from being usable as an
 * injection or a scanning surface.
 */

import { z } from 'zod';

export const sharedPortfolioValidation = {
  params: z.object({
    token: z
      .string()
      .trim()
      .min(20, 'Not a valid portfolio link.')
      .max(200, 'Not a valid portfolio link.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Not a valid portfolio link.'),
  }),
};
