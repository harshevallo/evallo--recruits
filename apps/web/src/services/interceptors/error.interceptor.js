/**
 * Translates every failure into one predictable shape.
 *
 * Without this, callers must handle three unrelated cases: an API error envelope, a network
 * failure with no response, and an Axios timeout. Normalising here means forms and hooks handle
 * exactly one error type.
 */

import { ERROR_CODES } from '@evallo/shared';

/**
 * @typedef {Object} ApiClientError
 * @property {string} code                     One of ERROR_CODES
 * @property {string} message                  Safe to display
 * @property {Record<string,string>} [details] Field-keyed messages for form binding
 * @property {number} [status]                 HTTP status, absent on network failure
 * @property {boolean} isNetworkError
 */

/** @returns {ApiClientError} */
function normaliseError(error) {
  if (error.response) {
    const { status, data } = error.response;
    const apiError = data?.error;

    return {
      code: apiError?.code ?? ERROR_CODES.SERVER_ERROR,
      message: apiError?.message ?? 'Something went wrong. Please try again.',
      details: apiError?.details,
      status,
      isNetworkError: false,
    };
  }

  if (error.code === 'ECONNABORTED') {
    return {
      code: ERROR_CODES.SERVER_ERROR,
      message: 'The request timed out. Please try again.',
      isNetworkError: true,
    };
  }

  return {
    code: ERROR_CODES.SERVER_ERROR,
    message: 'Unable to reach the server. Check your connection and try again.',
    isNetworkError: true,
  };
}

export function attachErrorInterceptor(client) {
  client.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(normaliseError(error)),
  );
}
