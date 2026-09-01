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
  getRoles,
  getRoleSearchFacets,
  getRole,
  getSitemap,
} from './public.controller.js';
import {
  earlyAccessValidation,
  companyDirectoryValidation,
  companyProfileValidation,
  companyInterestValidation,
  roleSearchValidation,
  roleDetailValidation,
} from './public.validation.js';

const router = Router();

router.post(
  '/early-access',
  publicWriteLimiter,
  validate(earlyAccessValidation),
  asyncHandler(createEarlyAccessRequest),
);

/*
 * The crawlable index. No validation — it takes no parameters — and no rate limiter: it is a
 * cached GET that a crawler is supposed to fetch.
 *
 * Reached by readers at `https://<web-origin>/sitemap.xml`, which `vercel.json` rewrites here, so
 * the sitemap and the URLs inside it share an origin.
 */
router.get('/sitemap.xml', asyncHandler(getSitemap));

// PUB-01 — public company directory (PRD §9.1).
router.get('/companies/facets', asyncHandler(getCompanyDirectoryFacets));
router.get(
  '/companies',
  validate(companyDirectoryValidation),
  asyncHandler(getCompanyDirectory),
);

/*
 * Candidate role search. Hiring intents are COMPANY data, so this stays inside the public module's
 * hard boundary — nothing here touches a candidate collection.
 *
 * `/roles/facets` is declared before `/roles` for the same reason `/companies/facets` is: a literal
 * segment must be matched before any pattern that could swallow it.
 */
router.get('/roles/facets', asyncHandler(getRoleSearchFacets));
router.get('/roles', validate(roleSearchValidation), asyncHandler(getRoles));

/*
 * One role — the role detail page. Declared AFTER `/roles/facets` for the reason above: `:roleId`
 * would otherwise match the literal `facets` and answer the wrong question.
 */
router.get('/roles/:roleId', validate(roleDetailValidation), asyncHandler(getRole));

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
