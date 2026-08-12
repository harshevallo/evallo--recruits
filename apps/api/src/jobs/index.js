/**
 * The job registry. `server.js` starts these after the database is connected.
 *
 * Registered here rather than in `app.js` on purpose: `createApp()` is imported by every
 * integration test, and a test suite must not acquire background timers by importing the app.
 */

import { env } from '../config/env.js';
import { startJobs, stopJobs } from './jobRunner.js';
import { accountDeletionJob } from './accountDeletion.job.js';

export const JOBS = [accountDeletionJob];

/** Starts the background jobs unless disabled (always off under NODE_ENV=test). */
export function startBackgroundJobs() {
  if (env.isTest || !env.JOBS_ENABLED) return [];
  startJobs(JOBS);
  return JOBS.map((job) => job.name);
}

export { stopJobs };
