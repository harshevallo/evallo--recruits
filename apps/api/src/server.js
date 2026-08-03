/**
 * Process entry point.
 *
 * Connect to MongoDB, then listen. Never the other way round: a server accepting requests
 * before its database is reachable returns confusing 500s instead of failing to start.
 */

import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './lib/db.js';
import { logger } from './lib/logger.js';

async function start() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('API listening', {
      port: env.PORT,
      environment: env.NODE_ENV,
      health: `http://localhost:${env.PORT}/api/health`,
    });
  });

  // Finish in-flight requests, then close the database. Killing connections mid-write is how
  // partially-applied multi-document operations happen.
  async function shutdown(signal) {
    logger.info('Shutting down', { signal });

    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state. Log and exit rather than
  // continuing to serve traffic from it.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

start().catch((error) => {
  logger.error('Failed to start API', { message: error.message, stack: error.stack });
  process.exit(1);
});
