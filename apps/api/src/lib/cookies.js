/**
 * Refresh-cookie attributes, resolved from the deployment topology (ADR-005, TRD §13).
 *
 * The refresh token is an httpOnly cookie. Whether the browser will SEND that cookie depends on
 * where the API sits relative to the web app, and getting it wrong produces the same symptom in
 * both directions: the user is signed out the moment the 15-minute access token expires, with no
 * error the client can report.
 *
 *   same site   `app.evallo.in` → `api.evallo.in`   SameSite=Lax works (TRD §13 point 3)
 *   cross site  `app.vercel.app` → `api.onrender.com`  requires SameSite=None; Secure
 *
 * `SameSite=None` is strictly weaker (the cookie rides cross-site requests), so it is never
 * assumed. It is used only when the configured origins prove the deployment is cross-site, or
 * when an operator states it explicitly with `COOKIE_SAMESITE`.
 *
 * Nothing here relaxes httpOnly. The refresh token is never readable by JavaScript in any mode.
 */

/**
 * Public suffixes that carry a second label, so `co.uk` is not mistaken for a registrable domain.
 * Deliberately short: it covers the suffixes this product plausibly deploys under. An unknown
 * multi-part suffix degrades to "these are different sites", which chooses the SAFE branch for
 * correctness (SameSite=None) rather than silently breaking refresh.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.in', 'net.in', 'org.in', 'ac.in', 'gov.in',
  'com.au', 'net.au', 'org.au', 'edu.au', 'co.nz', 'com.sg', 'com.my', 'co.za', 'com.br',
  'co.jp', 'com.mx', 'com.hk', 'com.tr', 'com.ar', 'co.ke', 'ae.org', 'com.sa',
]);

/**
 * The registrable domain ("site") of an origin — `https://api.evallo.in` → `evallo.in`.
 *
 * @param {string} origin
 * @returns {string|null} lowercase site, or null when the origin cannot be parsed
 */
export function registrableDomain(origin) {
  if (!origin) return null;

  let host;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }

  // An IP literal or a single-label host (localhost) is its own site.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes('.')) return host;

  const labels = host.split('.');
  const lastTwo = labels.slice(-2).join('.');

  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

/**
 * Are these two origins same-site? Same registrable domain, ignoring scheme, port and subdomain.
 *
 * @returns {boolean|null} null when either side is unknown, so the caller can keep its default
 */
export function isSameSite(a, b) {
  const siteA = registrableDomain(a);
  const siteB = registrableDomain(b);
  if (!siteA || !siteB) return null;
  return siteA === siteB;
}

/**
 * Resolves `sameSite` and `secure` for the refresh cookie.
 *
 * Pure and dependency-free so it can be unit-tested against every topology without booting the
 * app or touching process.env.
 *
 * @param {object} config
 * @param {string} config.clientOrigin       CLIENT_ORIGIN — where the browser runs
 * @param {string|null} [config.apiPublicUrl] API_PUBLIC_URL — the origin the browser calls
 * @param {'auto'|'lax'|'none'|'strict'} [config.sameSite='auto'] COOKIE_SAMESITE override
 * @param {boolean|null} [config.secure]     COOKIE_SECURE override; defaults to isProduction
 * @param {boolean} [config.isProduction]
 * @returns {{ sameSite: 'lax'|'none'|'strict', secure: boolean, crossSite: boolean|null, source: string, warning: string|null }}
 */
export function resolveCookiePolicy({
  clientOrigin,
  apiPublicUrl = null,
  sameSite = 'auto',
  secure = null,
  isProduction = false,
} = {}) {
  const sameSiteRelation = apiPublicUrl ? isSameSite(clientOrigin, apiPublicUrl) : null;
  const crossSite = sameSiteRelation === null ? null : !sameSiteRelation;

  let resolvedSameSite;
  let source;

  if (sameSite !== 'auto') {
    resolvedSameSite = sameSite;
    source = 'COOKIE_SAMESITE';
  } else if (crossSite === true) {
    resolvedSameSite = 'none';
    source = 'auto (CLIENT_ORIGIN and API_PUBLIC_URL are different sites)';
  } else if (crossSite === false) {
    resolvedSameSite = 'lax';
    source = 'auto (CLIENT_ORIGIN and API_PUBLIC_URL share a registrable domain)';
  } else {
    // API_PUBLIC_URL not set: keep the historical default rather than guessing.
    resolvedSameSite = 'lax';
    source = 'default (API_PUBLIC_URL not set)';
  }

  let resolvedSecure = secure ?? isProduction;
  let warning = null;

  /*
   * Every major browser DROPS a `SameSite=None` cookie that is not also `Secure`. Forcing it on
   * is the only behaviour that can work; over plain http (local cross-site experiments) the
   * cookie will still be refused, so say so rather than failing silently at runtime.
   */
  if (resolvedSameSite === 'none' && !resolvedSecure) {
    resolvedSecure = true;
    warning =
      'SameSite=None requires Secure; forcing Secure=true. Over plain HTTP the browser will ' +
      'refuse the refresh cookie — serve the API over HTTPS, or set COOKIE_SAMESITE=lax and ' +
      'host the API on the same registrable domain as the web app.';
  }

  return { sameSite: resolvedSameSite, secure: resolvedSecure, crossSite, source, warning };
}
