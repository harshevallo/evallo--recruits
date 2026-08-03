/**
 * @evallo/shared — the contract layer.
 *
 * Imported by BOTH apps/web and apps/api. Under ADR-002 (JavaScript, no compiler) this package
 * is what prevents client and server drifting apart: one schema, one set of constants, one
 * permission resolver.
 *
 * Rules (07_PROJECT_STRUCTURE.md §2):
 *   - Plain ESM JavaScript, no build step (ADR-012).
 *   - Environment-agnostic: no window, document, process, fs, Mongoose, or Axios.
 *   - New taxonomy or state values land here first, then in consumers.
 */

export * from './constants/index.js';
export * from './permissions/index.js';
export * from './schemas/index.js';
export * from './taxonomy/index.js';
