/**
 * Attaches a request id and a scoped logger, and logs completion.
 *
 * Runs first so every downstream log line and error response can be correlated
 * (PRD §19 Observability).
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export function requestContext(req, res, next) {
  req.id = req.get('x-request-id') || randomUUID();
  req.log = logger.child({ requestId: req.id });
  req.startedAt = Date.now();

  res.setHeader('x-request-id', req.id);

  res.on('finish', () => {
    const durationMs = Date.now() - req.startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.log[level]('request completed', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
