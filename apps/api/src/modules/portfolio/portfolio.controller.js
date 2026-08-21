/**
 * Maps HTTP to the share-link service. No business logic (ADR-011).
 */

import { sendSuccess } from '../../lib/response.js';
import { resolveSharedPortfolio } from '../candidates/share.service.js';

/**
 * ADR-019 — one portfolio, addressed by its share token.
 *
 * Two response headers do real work here:
 *
 *   `X-Robots-Tag: noindex, nofollow, noarchive` — the API answer itself must never be indexed.
 *      The page is separately marked `noindex` client-side, but a crawler that reaches the JSON
 *      directly would otherwise have no instruction at all.
 *
 *   `Cache-Control: private, no-store` — the payload is one person's personal data behind a
 *      secret. A shared cache holding it would keep serving after the candidate revoked the link,
 *      which would defeat the only control they have.
 *
 * Access is NOT written to `auditEvents`: that model requires `actorUserId`, and a link holder
 * has no account. Recording the candidate's own id as the actor would put a false entry in the
 * one log §21.4 exists to make trustworthy. The view is logged to the request logger instead, and
 * `12_KNOWN_ISSUES.md` carries the gap.
 */
export async function getSharedPortfolio(req, res) {
  const payload = await resolveSharedPortfolio(req.params.token);

  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Cache-Control', 'private, no-store');

  req.log?.info('shared portfolio viewed', { referrer: req.get('referer') ?? null });

  return sendSuccess(res, payload);
}
