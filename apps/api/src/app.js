/**
 * Express application assembly.
 *
 * Order is deliberate and load-bearing:
 *   context → security → parsing → rate limit → routes → 404 → error handler
 *
 * Security must run before parsing so oversized or hostile payloads are rejected early, and the
 * error handler must be last so it catches everything above it.
 *
 * This file builds the app but never listens — server.js owns the process lifecycle. Keeping
 * them apart is what lets integration tests import the app without opening a port.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { API_PREFIX, BODY_LIMIT } from './config/constants.js';
import { env } from './config/env.js';
import routes from './routes.js';
import { requestContext } from './middleware/requestContext.js';
import { corsMiddleware, helmetMiddleware, sanitizeMiddleware } from './middleware/security.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Required for correct req.ip behind a proxy, which rate limiting depends on.
  if (env.isProduction) app.set('trust proxy', 1);

  app.disable('x-powered-by');

  app.use(requestContext);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
  // Refresh token travels as an httpOnly cookie (ADR-005).
  app.use(cookieParser());

  // After parsing — it inspects the parsed body and query.
  app.use(sanitizeMiddleware);

  app.use(globalLimiter);

  /*
   * Service descriptor at the root.
   *
   * Every route this API serves lives under `API_PREFIX`, so `/` was a 404 — which is defensible
   * for a browser but wrong for the two things that actually hit it: a platform health probe and
   * an operator checking whether the deployment is up. Both got a logged warning and no answer.
   *
   * It reports identity and liveness only. Anything that touches the database — connection state,
   * integrations, cookie policy — stays on `/api/health`, which is the endpoint monitoring should
   * use, because a process can be listening while its database is unreachable.
   */
  app.get('/', (req, res) => {
    res.json({
      service: 'evallo-recruit-api',
      status: 'ok',
      docs: `${API_PREFIX}/health`,
    });
  });

  app.use(API_PREFIX, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
