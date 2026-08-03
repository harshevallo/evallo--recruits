/**
 * Structured logger — PRD §19 (Observability).
 *
 * A deliberately thin facade. Log aggregation is not yet chosen (09_DEPLOYMENT_GUIDE.md D7), so
 * this emits JSON in production (machine-parseable) and readable lines in development. When a
 * provider is selected, only this file changes.
 */

import { env } from '../config/env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = env.isProduction ? LEVELS.info : LEVELS.debug;

function emit(level, message, meta = {}) {
  if (LEVELS[level] > activeLevel) return;

  const entry = { level, message, timestamp: new Date().toISOString(), ...meta };
  // This module is the one place console access is intended — everything else logs through it.
  // eslint-disable-next-line no-console
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

  if (env.isProduction) {
    stream(JSON.stringify(entry));
    return;
  }

  const detail = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  stream(`[${level.toUpperCase()}] ${message}${detail}`);
}

export const logger = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),

  /** Returns a logger that stamps every entry with the given context, e.g. a requestId. */
  child(context = {}) {
    return {
      error: (message, meta) => emit('error', message, { ...context, ...meta }),
      warn: (message, meta) => emit('warn', message, { ...context, ...meta }),
      info: (message, meta) => emit('info', message, { ...context, ...meta }),
      debug: (message, meta) => emit('debug', message, { ...context, ...meta }),
      child: (extra) => logger.child({ ...context, ...extra }),
    };
  },
};
