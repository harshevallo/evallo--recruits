/**
 * MongoDB connection lifecycle.
 *
 * The only place Mongoose is connected or disconnected. Modules import their own models; nothing
 * else touches the connection.
 */

import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { DB } from '../config/constants.js';
import { logger } from './logger.js';

// Reject writes containing fields not declared in a schema, rather than silently dropping them.
mongoose.set('strictQuery', true);

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) return mongoose.connection;

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info('MongoDB connected', { database: mongoose.connection.name });
  });

  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', { message: error.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected');
  });

  const options = {
    serverSelectionTimeoutMS: DB.SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: DB.SOCKET_TIMEOUT_MS,
    maxPoolSize: DB.MAX_POOL_SIZE,
  };

  /**
   * Retry the initial connection with backoff.
   *
   * The database may be remote (e.g. over a tunnel), where a single server-selection timeout is
   * a transient blip, not a fatal condition. Without this, one timeout crashes the process and
   * nodemon can't recover until a file changes — which is exactly what was observed. Bounded so
   * a genuinely-down database still fails fast rather than hanging forever.
   */
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(env.MONGODB_CLOUD, options);
      return mongoose.connection;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const delayMs = attempt * 2000;
      logger.warn('MongoDB connect failed — retrying', {
        attempt,
        maxAttempts,
        retryInMs: delayMs,
        message: error.message,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
}

/**
 * Connection state for the health endpoint.
 * Reports readyState rather than pinging, so /health stays cheap enough to poll.
 */
export function getDatabaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    status: states[mongoose.connection.readyState] ?? 'unknown',
    database: mongoose.connection.name ?? null,
  };
}

/**
 * Whether this deployment can run multi-document transactions.
 *
 * Four operations require them (05_DATABASE_SCHEMA.md §11) and a standalone mongod cannot.
 * Surfaced in /health so a misconfigured local setup is visible immediately rather than
 * appearing later as a concurrency bug that only reproduces under load.
 */
export function supportsTransactions() {
  const { topology } = mongoose.connection.client ?? {};
  const description = topology?.description;
  if (!description) return null;
  return description.type === 'ReplicaSetWithPrimary' || description.type === 'Sharded';
}
