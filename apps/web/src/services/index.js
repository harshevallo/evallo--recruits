/**
 * Domain API modules are added here as their milestone arrives:
 *   M1   auth.api.js · users.api.js
 *   M2   companies.api.js
 *   M3   candidates.api.js
 *   M4   interests.api.js
 *   M5   search.api.js · pipeline.api.js · messaging.api.js
 */

export { apiClient, unwrap, unwrapWithMeta } from './apiClient.js';
export * from './public.api.js';
export * from './users.api.js';
export * from './companies.api.js';
