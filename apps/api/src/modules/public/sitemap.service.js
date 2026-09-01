/**
 * `sitemap.xml` — the crawlable index of public pages.
 *
 * ── Why the API generates it and the web app serves it ────────────────────────────────────────
 *
 * A sitemap must list live data, so it cannot be a build artefact: a company published an hour
 * after the last deploy would be missing until the next one. Only the API can see the data and the
 * visibility rules, so it is generated here.
 *
 * But a sitemap must also be served from the SAME origin as the URLs inside it, or a crawler
 * treats it as a cross-domain submission and largely ignores it. The API is on a different host
 * from the web app, so `vercel.json` rewrites `/sitemap.xml` on the web origin to this endpoint.
 * The crawler sees one origin; the data stays live.
 *
 * ── The visibility rules are REUSED, never restated ───────────────────────────────────────────
 *
 * `publiclyVisible()` for companies and the same two-stage predicate role search uses. That is the
 * whole point: a sitemap is a list of URLs asserted to be publicly fetchable, so if it were built
 * from its own idea of "public" it could advertise a draft company and hand a crawler a 404 — or
 * worse, keep advertising a page after it was unpublished. Anything absent from the public API is
 * absent from here by construction.
 *
 * Candidates appear nowhere. PRD §21.2 names sitemaps explicitly, and the share links of ADR-019
 * are secrets that a public index would defeat entirely.
 */

import { HIRING_INTENT_STATUS } from '@evallo/shared';
import { Company } from '../companies/company.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { publiclyVisible } from './companyPublic.service.js';
import { env } from '../../config/index.js';

/**
 * A cap, so the response can never become unbounded.
 *
 * The sitemap protocol allows 50,000 URLs per file. Staying well under it means one file and no
 * index document; passing it is the signal to split by type, not to raise this number.
 */
const MAX_URLS_PER_TYPE = 20000;

/** XML text escaping. A company name with an ampersand would otherwise produce invalid XML. */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The public web origin.
 *
 * `APP_URL` already exists and already means exactly this — it is what verification and
 * password-reset emails are built from, so it is verified in production by everything that sends
 * mail. Introducing a second variable for the same fact would give it two places to be wrong.
 */
function siteOrigin() {
  return String(env.APP_URL ?? '').replace(/\/+$/, '');
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds the sitemap XML.
 *
 * @returns {Promise<string>}
 */
export async function buildSitemap() {
  const origin = siteOrigin();

  /* Stage one: which companies are publicly visible. Same predicate the directory uses. */
  const companies = await Company.find(publiclyVisible())
    .select('slug updatedAt')
    .sort({ updatedAt: -1 })
    .limit(MAX_URLS_PER_TYPE)
    .lean();

  const companyIds = companies.map((company) => company._id);

  /*
   * Stage two: active intents WITHIN those companies.
   *
   * Scoped to `companyIds` rather than filtered afterwards, so a role at an unpublished company is
   * never even loaded — the same structure as `listPublicRoles`, and the reason unpublishing a
   * company silently removes its roles from here too.
   */
  const roles = companyIds.length
    ? await HiringIntent.find({
        companyId: { $in: companyIds },
        status: HIRING_INTENT_STATUS.ACTIVE,
      })
        .select('_id updatedAt')
        .sort({ updatedAt: -1 })
        .limit(MAX_URLS_PER_TYPE)
        .lean()
    : [];

  const entries = [
    /* The two index pages. Everything else is discovered from them. */
    urlEntry({ loc: `${origin}/`, changefreq: 'weekly', priority: '1.0' }),
    urlEntry({ loc: `${origin}/companies`, changefreq: 'daily', priority: '0.9' }),
    urlEntry({ loc: `${origin}/roles`, changefreq: 'daily', priority: '0.9' }),

    ...companies.map((company) =>
      urlEntry({
        loc: `${origin}/companies/${company.slug}`,
        lastmod: company.updatedAt,
        changefreq: 'weekly',
        priority: '0.8',
      }),
    ),

    ...roles.map((role) =>
      urlEntry({
        loc: `${origin}/roles/${role._id}`,
        lastmod: role.updatedAt,
        changefreq: 'daily',
        priority: '0.7',
      }),
    ),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

/** Counts, for the tests and for anyone debugging what the crawler was handed. */
export async function sitemapStats() {
  const companies = await Company.countDocuments(publiclyVisible());
  const companyIds = await Company.distinct('_id', publiclyVisible());
  const roles = await HiringIntent.countDocuments({
    companyId: { $in: companyIds },
    status: HIRING_INTENT_STATUS.ACTIVE,
  });
  return { companies, roles, origin: siteOrigin() };
}
