/**
 * Token-gated candidate portfolio — ADR-019.
 *
 * Its own module rather than an addition to `public/`, and that placement is the point. The
 * public module opens with "HARD BOUNDARY: this module may never import or query a candidate
 * collection", and that invariant is worth more intact than reused: a reader auditing `public/`
 * for candidate leakage should be able to trust the file header rather than re-derive it.
 *
 * So this route is unauthenticated but NOT public. Reaching it requires a 256-bit secret the
 * candidate minted and can destroy, it is excluded from `robots.txt` and emits `noindex`, and it
 * appears in no sitemap, no directory and no search index.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { shareLinkLimiter } from '../../middleware/rateLimit.js';
import { getSharedPortfolio } from './portfolio.controller.js';
import { sharedPortfolioValidation } from './portfolio.validation.js';

const router = Router();

router.get(
  '/:token',
  shareLinkLimiter,
  validate(sharedPortfolioValidation),
  asyncHandler(getSharedPortfolio),
);

export default router;
