/**
 * Wraps an async route handler so a rejected promise reaches the error middleware.
 *
 * Express 4 does not forward async rejections automatically — without this, a rejected promise
 * hangs the request until timeout with no error logged. Every async controller must be wrapped.
 *
 * (Express 5 handles this natively. Migrating would let this file be deleted; that is a
 * dependency decision, not an M0 one.)
 *
 * @param {(req, res, next) => Promise<unknown>} handler
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
