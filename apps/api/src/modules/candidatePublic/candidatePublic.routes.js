/**
 * `/api/candidates` — the public candidate portfolio.
 *
 * READ-ONLY, and one address at a time. There is deliberately no listing or search endpoint here:
 * a visitor must already hold a specific candidate's URL. A public index of educators would turn
 * an individual opt-in into a scrapeable directory of people, which is not what anyone consented
 * to by publishing one page about themselves.
 *
 * Mounted beside `/portfolio` and `/media` rather than inside `/public`, preserving that module's
 * "may never query a candidate collection" boundary.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { shareLinkLimiter } from '../../middleware/rateLimit.js';
import { getPublicPortfolio } from './candidatePublic.controller.js';
import { publicPortfolioValidation } from './candidatePublic.validation.js';

const router = Router();

/*
 * `shareLinkLimiter` is reused rather than a new limiter invented. It exists for exactly this
 * shape of request — an unauthenticated read of one person's portfolio — and its job description
 * fits without amendment: stop the endpoint being swept, rather than stop a URL being guessed.
 *
 * Guessing is a smaller worry here than it is for a share token, because a slug is meant to be
 * shareable. Sweeping is a LARGER one: slugs are derived from names, so they are enumerable in a
 * way a 256-bit token never was. The limiter is what makes that expensive.
 */
router.get(
  '/:slug',
  shareLinkLimiter,
  validate(publicPortfolioValidation),
  asyncHandler(getPublicPortfolio),
);

export default router;
