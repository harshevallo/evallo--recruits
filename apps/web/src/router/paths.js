/**
 * Every route path in the application.
 *
 * Under ADR-002 a mistyped path is a runtime 404 that no tool catches, so paths are centralised
 * (07_PROJECT_STRUCTURE.md §4.4). Never write a route string inline.
 *
 * Company-scoped routes carry the company slug in the URL, not in client state — see
 * 03_TRD.md §4.1: it makes links shareable and the context server-verifiable.
 */

export const PATHS = Object.freeze({
  // Marketing and public — prerendered, SSR-safe (ADR-013)
  HOME: '/',
  COMPANY_DIRECTORY: '/companies',
  COMPANY_PROFILE: '/companies/:slug',
  TERMS: '/terms',
  PRIVACY: '/privacy',

  // Marketing content pages — placeholders until content exists.
  PRICING: '/pricing',
  ASSESSMENTS: '/assessments',
  HELP: '/help',
  GUIDES: '/hiring-guides',
  BLOG: '/blog',
  RESEARCH: '/market-research',
  ABOUT: '/about',
  CONTACT: '/contact',

  // Authentication
  SIGN_IN: '/signin',
  SIGN_UP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  VERIFY_EMAIL: '/verify-email',
  // AUTH-02
  VERIFICATION_SENT: '/auth/verification-sent',
  CHANGE_EMAIL: '/auth/change-email',
  // AUTH-03 / AUTH-04 — onboarding after email verification
  SET_PASSWORD: '/auth/set-password',
  BASIC_SETUP: '/auth/setup',
  // AUTH-05 — first-action router. Navigation only; writes no role (TRD §5.2).
  FIRST_ACTION: '/auth/first-action',

  // Authenticated personal surface. ADR-015 moved HOME-01 off "/".
  APP_HOME: '/home',
  CANDIDATE_HOME: '/me',
  CANDIDATE_PROFILE_BUILDER: '/me/profile',
  CANDIDATE_PROFILE_PREVIEW: '/me/profile/preview',
  CANDIDATE_VISIBILITY: '/me/visibility',
  // CAN-05 / CAN-06 — the signed-in view of the public directory and company page. Separate
  // paths, not a query flag, so the anonymous URLs stay clean and indexable (ADR-004).
  CANDIDATE_COMPANIES: '/me/companies',
  CANDIDATE_COMPANY_PROFILE: '/me/companies/:slug',
  CANDIDATE_INTERESTS: '/me/interests',
  CANDIDATE_MESSAGES: '/me/messages',
  ACCOUNT_SETTINGS: '/settings',
  /* SET-01 is a dashboard with sub-pages, not one long form (TRD §4.1 `/settings/*`). */
  SETTINGS_ACCOUNT: '/settings/account',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_PRIVACY: '/settings/privacy',
  SETTINGS_DATA: '/settings/data',

  // Company workspace
  // REC-01 — create or join. Reached from HOME-01 and AUTH-05; not company-scoped, because the
  // user may not belong to a company yet.
  COMPANY_START: '/companies/start',

  COMPANY_HOME: '/c/:companySlug',
  // REC-02 setup wizard and REC-06 preview. Company-scoped: both require company:edit.
  COMPANY_SETUP: '/c/:companySlug/setup',
  COMPANY_PREVIEW: '/c/:companySlug/preview',
  COMPANY_INTERESTS: '/c/:companySlug/interests',
  COMPANY_SEARCH: '/c/:companySlug/search',
  COMPANY_CANDIDATE: '/c/:companySlug/candidates/:candidateId',
  COMPANY_PIPELINE: '/c/:companySlug/pipeline',
  COMPANY_MESSAGES: '/c/:companySlug/messages',
  COMPANY_HIRING: '/c/:companySlug/hiring',
  COMPANY_EDIT: '/c/:companySlug/profile/edit',
  COMPANY_TEAM: '/c/:companySlug/team',
  COMPANY_SETTINGS: '/c/:companySlug/settings',

  // Errors
  NOT_FOUND: '*',
});

/**
 * Fills `:params` in a path template.
 *
 * @example buildPath(PATHS.COMPANY_HOME, { companySlug: 'seven-square' }) // '/c/seven-square'
 * @param {string} template
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
export function buildPath(template, params = {}) {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`buildPath: missing route parameter "${key}" for "${template}"`);
    }
    return encodeURIComponent(String(value));
  });
}
