/**
 * Request validation — layer 2 of the three-layer strategy (03_TRD.md §9).
 *
 * Runs a schema from packages/shared against the request. The SAME schema powers client-side
 * inline validation, so the rules cannot drift (ADR-009).
 *
 * This is the trust boundary. Client-side validation is a convenience; this is the control.
 */

import { z } from 'zod';
import { ApiError } from '../lib/ApiError.js';

/**
 * Flattens Zod issues into a field-keyed object the client maps straight onto form inputs
 * (04_API_DOCUMENTATION.md §1). Only the first message per field is kept — showing three
 * errors under one input is noise.
 *
 * @param {z.ZodError} error
 * @returns {Record<string, string>}
 */
function toFieldErrors(error) {
  const details = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_root';
    if (!details[field]) details[field] = issue.message;
  }
  return details;
}

/**
 * @param {{ body?: z.ZodTypeAny, query?: z.ZodTypeAny, params?: z.ZodTypeAny }} schemas
 */
export function validate(schemas = {}) {
  return function validateRequest(req, _res, next) {
    try {
      // Assign the PARSED value back: Zod applies trimming, lowercasing, coercion, and
      // defaults, and downstream code must receive the normalised value, not the raw input.
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(ApiError.validation('Please correct the highlighted fields.', toFieldErrors(error)));
        return;
      }
      next(error);
    }
  };
}
