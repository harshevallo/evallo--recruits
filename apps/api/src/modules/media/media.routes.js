/**
 * `/api/media` — serves uploaded bytes (ADR-020).
 *
 * Mounted beside `/api/public` rather than inside it, for the same reason `/api/portfolio` is:
 * that module declares it may never query a candidate collection, and the invariant is worth more
 * kept true than reused. This router is unauthenticated but it is not the public product surface.
 *
 * Read-only. The write side lives on `/api/me/photo`, because uploading is an act by an
 * authenticated person on their own account, not an operation on a media collection.
 */

import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { serveAsset } from './media.controller.js';

const router = Router();

router.get('/:assetId', asyncHandler(serveAsset));

export default router;
