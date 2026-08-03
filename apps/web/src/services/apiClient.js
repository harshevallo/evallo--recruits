/**
 * The single configured Axios instance.
 *
 * Holds the access token in memory (never localStorage — ADR-005) and transparently refreshes
 * it: on a 401/expired response it calls /auth/refresh once, replays the queued requests, and
 * retries. The refresh token itself is an httpOnly cookie the browser sends automatically.
 */

import axios from 'axios';
import { ERROR_CODES } from '@evallo/shared';
import { attachErrorInterceptor } from './interceptors/error.interceptor.js';

const baseURL = import.meta.env.VITE_API_BASE_URL;

if (!baseURL) {
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env and restart the dev server.',
  );
}

export const apiClient = axios.create({
  baseURL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
  // Send the refresh cookie on auth calls.
  withCredentials: true,
});

// ── access token, in memory only ──────────────────────────────────────────────
let accessToken = null;
/** Called by AuthContext when the token changes, so it survives a full refresh cycle. */
let onTokensCleared = null;

export function setAccessToken(token) {
  accessToken = token;
}
export function clearAccessToken() {
  accessToken = null;
}
export function registerAuthHandlers({ onCleared } = {}) {
  onTokensCleared = onCleared;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken && !config.skipAuth) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── refresh-on-401, single-flight ─────────────────────────────────────────────
let refreshing = null;

async function refreshAccessToken() {
  // Bare axios (not apiClient) so this request skips the interceptors below.
  const response = await axios.post(
    `${baseURL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  const token = response.data?.data?.accessToken ?? null;
  setAccessToken(token);
  return token;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    const isAuthError =
      error.response?.status === 401 ||
      code === ERROR_CODES.TOKEN_EXPIRED ||
      code === ERROR_CODES.UNAUTHENTICATED;

    // Don't try to refresh the refresh call itself, and only retry once.
    const isRefreshCall = original?.url?.includes('/auth/refresh');
    if (!isAuthError || original?._retried || isRefreshCall || original?.skipAuth) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      // Single-flight: concurrent 401s share one refresh, then all replay.
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;

      if (!token) throw error;

      original.headers.Authorization = `Bearer ${token}`;
      return apiClient(original);
    } catch (refreshError) {
      refreshing = null;
      clearAccessToken();
      onTokensCleared?.();
      return Promise.reject(refreshError);
    }
  },
);

attachErrorInterceptor(apiClient);

export function unwrap(response) {
  return response.data?.data;
}
export function unwrapWithMeta(response) {
  return { data: response.data?.data, meta: response.data?.meta };
}
