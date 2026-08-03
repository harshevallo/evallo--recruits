/**
 * Response envelope builders — 04_API_DOCUMENTATION.md §1.
 *
 * Every response in the API passes through here. No route hand-rolls a response shape; a client
 * that can rely on one shape needs one parsing path instead of sixty.
 */

/**
 * @param {import('express').Response} res
 * @param {unknown} data
 * @param {object} [options]
 * @param {number} [options.status=200]
 * @param {object} [options.meta]   Pagination or similar. Omitted when absent.
 */
export function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated(res, data, options = {}) {
  return sendSuccess(res, data, { ...options, status: 201 });
}

/**
 * Error envelope. Called by the error handler only — throw an ApiError from anywhere else.
 *
 * @param {import('express').Response} res
 * @param {object} error
 * @param {string} error.code
 * @param {string} error.message
 * @param {object} [error.details]
 * @param {number} [error.status=500]
 */
export function sendError(res, { code, message, details, status = 500 }) {
  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

/** Builds the `meta` block for offset-paginated collections. */
export function buildPaginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore: page * limit < total,
  };
}
