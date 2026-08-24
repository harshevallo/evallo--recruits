/**
 * Single mount point for every module router.
 *
 * One file listing the whole API surface. The frontend mirror of this is
 * apps/web/src/router/paths.js.
 *
 * Modules are added as their milestone arrives:
 *   M1   /auth  /me
 *   M2   /companies  + public company endpoints, sitemap, robots
 *   M3   /me/candidate-profile  /question-bank
 *   M4   /me/interests  /companies/:companyId/interests
 *   M5   /companies/:companyId/search  /pipeline  /conversations
 *   M6   /me/notifications
 */

import { Router } from 'express';
import healthRoutes from './modules/health/health.routes.js';
import publicRoutes from './modules/public/public.routes.js';
import portfolioRoutes from './modules/portfolio/portfolio.routes.js';
import mediaRoutes from './modules/media/media.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import companyRoutes from './modules/companies/company.routes.js';

const router = Router();

// Development/ops diagnostic. Not a product surface.
router.use('/health', healthRoutes);

router.use('/public', publicRoutes);

/*
 * ADR-019 — the candidate share link. Unauthenticated but NOT public: reaching it requires a
 * 256-bit secret the candidate minted and can destroy at any time.
 *
 * Mounted beside `/public` rather than inside it on purpose. `public/` declares that it may never
 * query a candidate collection, and that invariant is more useful kept true than reused.
 */
router.use('/portfolio', portfolioRoutes);

/*
 * ADR-020 — uploaded bytes, addressed by opaque id.
 *
 * Unauthenticated for the reason an `<img src>` cannot carry an Authorization header, and placed
 * outside `/public` on the same grounds as `/portfolio` above. `media.controller.js` documents why
 * a profile photo is the one asset class for which that trade is acceptable.
 */
router.use('/media', mediaRoutes);

// Authentication — public (issues our own JWTs).
router.use('/auth', authRoutes);

// Authenticated. Every route below requires a verified access token (our own JWT).
// Personal surface — belongs to the person.
router.use('/me', userRoutes);
// Company surface — permissions resolved per company from CompanyMember.
router.use('/companies', companyRoutes);

export default router;
