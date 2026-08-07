/**
 * Domain schemas are added here as their milestone arrives (07_PROJECT_STRUCTURE.md §2):
 *   M1   auth.schema.js · user.schema.js
 *   M2   company.schema.js · membership.schema.js · hiringIntent.schema.js
 *   M3   candidate.schema.js · evidence.schema.js · questionBank.schema.js
 *   M4   interest.schema.js
 *   M5   pipeline.schema.js · message.schema.js · search.schema.js
 */

export * as common from './common.schema.js';
export * from './auth.schema.js';
export * from './earlyAccess.schema.js';
export * from './company.schema.js';
export * from './interest.schema.js';
export * from './search.schema.js';
