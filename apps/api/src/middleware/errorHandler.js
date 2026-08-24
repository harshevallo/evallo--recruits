/**
 * The ONLY place an error response is formatted.
 *
 * Every thrown error — operational or not — ends here and leaves as the standard envelope.
 * Two rules matter more than the rest:
 *   1. Never leak internals. Stack traces, driver messages, and validation internals are logged,
 *      never sent.
 *   2. Unknown errors become a generic 500. An unrecognised error is not a safe error.
 */

import { z } from 'zod';
import mongoose from 'mongoose';
import { ERROR_CODES } from '@evallo/shared';
import { ApiError } from '../lib/ApiError.js';
import { sendError } from '../lib/response.js';
import { env } from '../config/env.js';

/** Translates known third-party errors into an ApiError. */
function normalise(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof z.ZodError) {
    const details = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || '_root';
      if (!details[field]) details[field] = issue.message;
    }
    return ApiError.validation('Please correct the highlighted fields.', details);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = {};
    for (const [field, issue] of Object.entries(error.errors)) {
      details[field] = issue.message;
    }
    return ApiError.validation('Please correct the highlighted fields.', details);
  }

  // Malformed ObjectId in a path param. Treated as not-found rather than a 400: the resource
  // cannot exist, and 404 avoids confirming anything about the id space.
  if (error instanceof mongoose.Error.CastError) {
    return ApiError.notFound('Not found.');
  }

  /*
   * A body that exceeded the parser's limit — `express.json` at 100 kB, or `express.raw` at 2 MB on
   * the photo route (ADR-020). body-parser raises this before a handler ever runs, so without this
   * branch it fell through to the generic 500 and told a user who picked a large photo that
   * something had gone wrong on our side. It had not: the request was too big, which is their
   * fault to fix and ours to say clearly.
   */
  if (error?.type === 'entity.too.large') {
    return ApiError.validation('That file is too large.', {
      photo: 'Choose a smaller image, or crop it before uploading.',
    });
  }

  // Duplicate key. The message deliberately does not name the value — for a unique email that
  // would turn any create endpoint into an account-enumeration oracle (PRD §16.1).
  if (error?.code === 11000) {
    return ApiError.conflict('That record already exists.');
  }

  return null;
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity (4 args).
export function errorHandler(error, req, res, next) {
  const known = normalise(error);

  if (known) {
    const log = known.status >= 500 ? 'error' : 'warn';
    req.log?.[log]('request failed', {
      code: known.code,
      status: known.status,
      message: known.message,
      ...(known.cause ? { cause: known.cause.message } : {}),
    });

    return sendError(res, {
      code: known.code,
      message: known.message,
      details: known.details,
      status: known.status,
    });
  }

  // Unrecognised: log everything, disclose nothing.
  req.log?.error('unhandled error', {
    message: error?.message,
    stack: error?.stack,
  });

  return sendError(res, {
    code: ERROR_CODES.SERVER_ERROR,
    message: env.isProduction
      ? 'Something went wrong. Please try again.'
      : `Unhandled error: ${error?.message ?? 'unknown'}`,
    status: 500,
  });
}
