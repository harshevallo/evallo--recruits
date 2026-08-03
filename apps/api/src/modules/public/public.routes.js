/**
 * Unauthenticated read/write surface.
 *
 * HARD BOUNDARY: this module may never import or query a candidate collection.
 * PRD §21.2 — "Candidate data never appears in public company HTML, public APIs, sitemaps, or
 * unauthenticated responses."
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { publicWriteLimiter } from '../../middleware/rateLimit.js';
import {
  createEarlyAccessRequest,
  getCompanyDirectory,
  getCompanyDirectoryFacets,
  getCompanyProfile,
  createCompanyInterest,
} from './public.controller.js';
import {
  earlyAccessValidation,
  companyDirectoryValidation,
  companyProfileValidation,
  companyInterestValidation,
} from './public.validation.js';

const router = Router();

router.post(
  '/early-access',
  publicWriteLimiter,
  validate(earlyAccessValidation),
  asyncHandler(createEarlyAccessRequest),
);

// PUB-01 — public company directory (PRD §9.1).
router.get('/companies/facets', asyncHandler(getCompanyDirectoryFacets));
router.get(
  '/companies',
  validate(companyDirectoryValidation),
  asyncHandler(getCompanyDirectory),
);

// PUB-02 — public company profile and expression of interest (PRD §7.4, §8.7).
router.get(
  '/companies/:slug',
  validate(companyProfileValidation),
  asyncHandler(getCompanyProfile),
);

router.post(
  '/companies/:slug/interest',
  publicWriteLimiter,
  validate(companyInterestValidation),
  asyncHandler(createCompanyInterest),
);

export default router;
