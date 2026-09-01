/**
 * Request contract for the public candidate portfolio (ADR-009).
 *
 * The pattern is the same one `slugifyName` produces, so a request that could not correspond to
 * any real slug is refused before it reaches the database — which keeps a hostile pattern out of
 * the query and keeps the enumeration surface to strings that are actually slug-shaped.
 */

import { z } from 'zod';

export const publicPortfolioValidation = {
  params: z.object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a valid portfolio address.'),
  }),
};
