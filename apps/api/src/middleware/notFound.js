/**
 * Catch-all for unmatched routes. Registered after all routers, before the error handler,
 * so unknown paths return the standard error envelope rather than Express's HTML page.
 */

import { ApiError } from '../lib/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl}`));
}
