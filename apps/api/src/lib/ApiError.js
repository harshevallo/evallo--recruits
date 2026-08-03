/**
 * The only error type services and controllers should throw deliberately.
 *
 * Carries a shared ERROR_CODES value so the client can branch on a stable code, and optional
 * field-keyed `details` so forms can map errors to inputs (04_API_DOCUMENTATION.md §1).
 */

import { ERROR_CODES, ERROR_STATUS } from '@evallo/shared';

export class ApiError extends Error {
  /**
   * @param {string} code       One of ERROR_CODES
   * @param {string} message    Human-readable, safe to show a user
   * @param {object} [options]
   * @param {object} [options.details]  Field-keyed messages, e.g. { email: '…' }
   * @param {number} [options.status]   Override the default status for the code
   * @param {Error}  [options.cause]    Original error, logged but never sent to the client
   */
  constructor(code, message, { details, status, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? ERROR_STATUS[code] ?? 500;
    this.details = details;
    this.cause = cause;
    this.isOperational = true;

    Error.captureStackTrace?.(this, ApiError);
  }

  static validation(message = 'The submitted data is invalid.', details) {
    return new ApiError(ERROR_CODES.VALIDATION_ERROR, message, { details });
  }

  static unauthenticated(message = 'Sign in to continue.') {
    return new ApiError(ERROR_CODES.UNAUTHENTICATED, message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(ERROR_CODES.FORBIDDEN, message);
  }

  /**
   * Use for resources the caller may not see, not only for resources that do not exist.
   * Returning 403 would confirm existence — an information leak under PRD §16.1.
   */
  static notFound(message = 'Not found.') {
    return new ApiError(ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(message = 'That conflicts with existing data.', details) {
    return new ApiError(ERROR_CODES.CONFLICT, message, { details });
  }

  static internal(message = 'Something went wrong.', cause) {
    return new ApiError(ERROR_CODES.SERVER_ERROR, message, { cause });
  }
}
