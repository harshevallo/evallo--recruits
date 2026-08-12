/**
 * Minimal in-process job runner.
 *
 * The project had no job or worker architecture (`src/jobs/` held only a `.gitkeep`), and adding
 * a queue service would be a new infrastructure dependency the deployment target has not chosen
 * yet (09_DEPLOYMENT_GUIDE.md §1). This is the smallest thing that satisfies the requirement:
 * periodic work that runs beside the API without blocking a single HTTP request.
 *
 * Properties that matter, and why:
 *
 * - **Never blocks a request.** Timers fire on their own turn of the event loop; no route calls
 *   into here.
 * - **Single-flight per job.** A slow run can never overlap itself and double-process a batch.
 * - **Error-isolated.** A throwing job is logged and rescheduled; it never takes the process down
 *   and never stops its siblings.
 * - **Unref'd timers.** The process can still exit; tests that import the API do not hang.
 * - **Opt-in.** Disabled under NODE_ENV=test, and controllable with JOBS_ENABLED, so no test or
 *   local run acquires background behaviour by surprise.
 *
 * A job is `{ name, intervalMs, runOnStart?, run() }`. `run()` returns a plain object that is
 * logged as the run summary.
 */

import { logger } from '../lib/logger.js';

const timers = new Map();
const running = new Set();

/**
 * Runs one job once, guarding against overlap and swallowing failures into the log.
 *
 * @param {{ name: string, run: () => Promise<object|void> }} job
 * @returns {Promise<object|null>} the job's summary, or null when it was skipped or failed
 */
export async function runJobOnce(job) {
  if (running.has(job.name)) {
    logger.warn('job skipped — previous run still in progress', { job: job.name });
    return null;
  }

  running.add(job.name);
  const startedAt = Date.now();

  try {
    const summary = (await job.run()) ?? {};
    logger.info('job completed', { job: job.name, durationMs: Date.now() - startedAt, ...summary });
    return summary;
  } catch (error) {
    // A failed run is retried on the next tick by design — the work is idempotent.
    logger.error('job failed', {
      job: job.name,
      durationMs: Date.now() - startedAt,
      message: error.message,
      stack: error.stack,
    });
    return null;
  } finally {
    running.delete(job.name);
  }
}

/**
 * Schedules every job. Safe to call once per process; calling it twice is a no-op for jobs that
 * are already scheduled.
 *
 * @param {Array<{ name: string, intervalMs: number, runOnStart?: boolean, run: () => Promise<object|void> }>} jobs
 */
export function startJobs(jobs = []) {
  for (const job of jobs) {
    if (timers.has(job.name)) continue;

    const timer = setInterval(() => {
      void runJobOnce(job);
    }, job.intervalMs);

    // Never hold the process open for a background timer.
    timer.unref?.();
    timers.set(job.name, timer);

    logger.info('job scheduled', { job: job.name, intervalMinutes: job.intervalMs / 60_000 });

    if (job.runOnStart) void runJobOnce(job);
  }
}

/** Cancels every scheduled job. Called on shutdown, and by tests. */
export function stopJobs() {
  for (const [name, timer] of timers) {
    clearInterval(timer);
    timers.delete(name);
  }
}

/** Names of the currently scheduled jobs — used by tests and diagnostics. */
export function scheduledJobs() {
  return [...timers.keys()];
}
