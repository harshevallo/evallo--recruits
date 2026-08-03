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
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import companyRoutes from './modules/companies/company.routes.js';

const router = Router();

// Development/ops diagnostic. Not a product surface.
router.use('/health', healthRoutes);

router.use('/public', publicRoutes);

// Authentication — public (issues our own JWTs).
router.use('/auth', authRoutes);

// Authenticated. Every route below requires a verified access token (our own JWT).
// Personal surface — belongs to the person.
router.use('/me', userRoutes);
// Company surface — permissions resolved per company from CompanyMember.
router.use('/companies', companyRoutes);

export default router;
