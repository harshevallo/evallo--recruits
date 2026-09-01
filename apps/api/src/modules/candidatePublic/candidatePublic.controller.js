/**
 * The public candidate portfolio endpoint (`GET /api/candidates/:slug`).
 *
 * Unauthenticated, like `/api/portfolio/:token` and `/api/media/:id`, and mounted OUTSIDE
 * `/api/public` for the same reason both of those are: that module declares it may never import
 * or query a candidate collection, and the invariant is worth more kept true than reused.
 */

import { sendSuccess } from '../../lib/response.js';
import { resolvePublicPortfolio } from '../candidates/publicPortfolio.service.js';

/**
 * `GET /api/candidates/:slug`
 *
 * Headers are set before the body is built, so a thrown 404 carries them too — a refusal must not
 * be more cacheable or more indexable than a success.
 */
export async function getPublicPortfolio(req, res) {
  /*
   * `noindex` for now, and this is temporary rather than a contradiction.
   *
   * The page is public by the candidate's choice; whether SEARCH ENGINES may index it is a
   * separate decision with its own consent copy, and it has not been made or shown to anyone yet.
   * Until it is, the safe answer is that a crawler does not keep this. The SEO phase changes this
   * line and the `meta.indexable` flag together.
   */
  res.set('X-Robots-Tag', 'noindex, nofollow');

  /*
   * `public` rather than the share link's `private, no-store`: this really is public data, and a
   * shared cache holding it for a minute is a scraping cost saved rather than a disclosure. Short,
   * so a candidate who switches back to private disappears quickly.
   */
  res.set('Cache-Control', 'public, max-age=60');

  return sendSuccess(res, await resolvePublicPortfolio(req.params.slug));
}
