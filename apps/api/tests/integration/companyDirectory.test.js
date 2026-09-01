/**
 * GET /api/public/companies — PUB-01.
 *
 * The critical assertion is the visibility boundary: unpublished companies must never appear in
 * an unauthenticated response (PRD §9.3, §21.2).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { HiringIntent } from '../../src/modules/hiring-intents/hiringIntent.model.js';

let server;
let baseUrl;
let publishedId;

const get = (path) => fetch(`${baseUrl}${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await Company.deleteMany({ slug: /^spec-/ });

  const published = await Company.create({
    slug: 'spec-published-co',
    name: 'Spec Published Co',
    organizationType: 'tutoring_center',
    status: 'published',
    moderationStatus: 'none',
    location: { country: 'US', city: 'Denver' },
    educationServices: ['academic_tutoring'],
    deliveryModes: ['remote'],
    isCurrentlyHiring: true,
  });
  publishedId = published._id;

  await Company.create({
    slug: 'spec-draft-co',
    name: 'Spec Draft Co',
    organizationType: 'tutoring_center',
    status: 'draft',
    location: { country: 'US', city: 'Denver' },
  });

  await Company.create({
    slug: 'spec-restricted-co',
    name: 'Spec Restricted Co',
    organizationType: 'tutoring_center',
    status: 'published',
    moderationStatus: 'restricted',
    location: { country: 'US', city: 'Denver' },
  });

  await HiringIntent.create({
    companyId: publishedId,
    title: 'Spec Tutor',
    status: 'active',
    roleCategories: ['private_tutor'],
    employmentTypes: ['part_time'],
    deliveryModes: ['remote'],
  });
});

after(async () => {
  await HiringIntent.deleteMany({ companyId: publishedId });
  await Company.deleteMany({ slug: /^spec-/ });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

describe('GET /api/public/companies', () => {
  test('returns published companies with pagination meta', async () => {
    const { status, body } = await get('/api/public/companies?limit=48');

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.meta.total >= 1);
    assert.ok(body.data.some((c) => c.slug === 'spec-published-co'));
  });

  test('EXCLUDES draft companies', async () => {
    const { body } = await get('/api/public/companies?limit=48');
    assert.ok(!body.data.some((c) => c.slug === 'spec-draft-co'), 'draft must not be public');
  });

  test('EXCLUDES moderation-restricted companies', async () => {
    const { body } = await get('/api/public/companies?limit=48');
    assert.ok(!body.data.some((c) => c.slug === 'spec-restricted-co'));
  });

  test('never exposes candidate or account fields', async () => {
    const { body } = await get('/api/public/companies?limit=48');
    const serialised = JSON.stringify(body);

    for (const forbidden of ['passwordHash', 'candidateId', 'userId', 'refreshToken']) {
      assert.ok(!serialised.includes(forbidden), `leaked ${forbidden}`);
    }
  });

  test('attaches active hiring roles', async () => {
    const { body } = await get('/api/public/companies?limit=48');
    const company = body.data.find((c) => c.slug === 'spec-published-co');

    assert.equal(company.activeRoleCount, 1);
    assert.deepEqual(company.activeRoles[0].roleCategories, ['private_tutor']);
  });

  test('filters by hiringOnly', async () => {
    const { body } = await get('/api/public/companies?hiringOnly=true&limit=48');

    /*
     * `isHiring`, not `isCurrentlyHiring`.
     *
     * This assertion used to read `isCurrentlyHiring === true`, which encoded the bug rather than
     * the rule: it passed precisely BECAUSE companies with active roles and the flag unset were
     * being excluded. "Hiring" now means the flag OR at least one active role, so the invariant
     * worth holding is that everything returned reports itself as hiring — which still fails
     * loudly if the filter stops filtering.
     */
    assert.ok(body.data.length > 0, 'the fixture company is hiring, so this is not vacuous');
    assert.ok(body.data.every((c) => c.isHiring === true));
  });

  test('filters by roleCategory through active intents', async () => {
    const match = await get('/api/public/companies?roleCategory=private_tutor&limit=48');
    assert.ok(match.body.data.some((c) => c.slug === 'spec-published-co'));

    const noMatch = await get('/api/public/companies?roleCategory=professor_lecturer&limit=48');
    assert.ok(!noMatch.body.data.some((c) => c.slug === 'spec-published-co'));
  });

  test('filters by organization type and country', async () => {
    const { body } = await get(
      '/api/public/companies?organizationType=tutoring_center&country=US&limit=48',
    );
    assert.ok(body.data.every((c) => c.organizationType === 'tutoring_center'));
  });

  test('rejects an unsupported filter value', async () => {
    const { status, body } = await get('/api/public/companies?organizationType=not_a_type');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  test('clamps limit to the maximum', async () => {
    const { status } = await get('/api/public/companies?limit=480');
    assert.equal(status, 400, 'limit above the cap is rejected rather than silently honoured');
  });

  test('returns an empty array, not an error, when nothing matches', async () => {
    const { status, body } = await get('/api/public/companies?q=zzzznomatchxyz');
    assert.equal(status, 200);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.total, 0);
  });

  /*
   * ── The bug these pin ─────────────────────────────────────────────────────────────
   *
   * Search used `$text`, which matches whole stemmed words. Against real data that meant
   * `?q=Northgate` found the company and `?q=north` found NOTHING — so a partial word, which is
   * what someone types on the way to a full one, always came back empty. It read as "search only
   * covers the first page"; in fact it covered every page and matched almost nothing.
   *
   * The prefix test is therefore the one that matters. It fails on any return to `$text`.
   */
  /*
   * These assert on THIS suite's fixtures, never on global totals.
   *
   * The suites run in parallel against one database, so any other file creating a company between
   * two requests moves a `meta.total`. An earlier draft of these tests compared totals and failed
   * only in the full run — green in isolation, red beside its neighbours, which is the worst kind
   * of test. `limit=48` for the same reason: a fixture must not fall off page one because another
   * suite happened to add rows.
   */
  const slugsFor = async (q) => {
    const { body } = await get(`/api/public/companies?limit=48&q=${encodeURIComponent(q)}`);
    return body.data.map((c) => c.slug);
  };

  test('a PARTIAL word matches — not just whole words', async () => {
    assert.ok(
      (await slugsFor('publis')).includes('spec-published-co'),
      '"publis" must find "Spec Published Co" — $text matched whole words only, and found nothing',
    );
  });

  test('a match is found wherever it sits in the result set, not only on page one', async () => {
    /* limit=1 forces the fixture off page one unless the SEARCH itself narrowed the set. */
    const { body } = await get('/api/public/companies?limit=1&q=spec%20published');
    assert.equal(body.data[0]?.slug, 'spec-published-co');
    assert.ok(body.meta.total >= 1);
  });

  test('matching is case-insensitive', async () => {
    const lower = await slugsFor('spec published');
    const upper = await slugsFor('SPEC PUBLISHED');
    assert.ok(lower.includes('spec-published-co'));
    assert.deepEqual(upper, lower, 'case must not change which companies match');
  });

  test('every term must match — a second word narrows, never widens', async () => {
    assert.ok((await slugsFor('spec')).includes('spec-published-co'));

    /* "spec zzzznomatch" shares a term with the fixture but adds one nothing has. */
    assert.ok(
      !(await slugsFor('spec zzzznomatch')).includes('spec-published-co'),
      'an unmatched second term must exclude the row, not be ignored',
    );
  });

  test('regex metacharacters are escaped, not executed', async () => {
    const { status, body } = await get('/api/public/companies?limit=48&q=.*');
    assert.equal(status, 200, 'must not 500');
    assert.ok(
      !body.data.some((c) => c.slug === 'spec-published-co'),
      'a literal ".*" must not behave as a match-everything regex',
    );
  });

  test('an unpublished company is still excluded when searched by name', async () => {
    const { body } = await get('/api/public/companies?q=spec%20draft');
    assert.equal(body.meta.total, 0, 'visibility outranks the search term');
  });
});

describe('the hiring filter counts real roles, not just the flag', () => {
  /*
   * ── The bug ─────────────────────────────────────────────────────────────────────────
   *
   * `?hiringOnly=true` matched `isCurrentlyHiring` — a MANUAL flag, default false, that nothing
   * keeps in step with reality. A company could post active roles, have them listed on its own
   * profile and returned by role search, and still be excluded from the one filter candidates use
   * to find employers who are hiring. On live data: 2 of 16 published companies.
   *
   * These fixtures are their own companies rather than reusing the suite's, because the assertion
   * is about which companies come BACK, and that has to be decidable without depending on what
   * other tests happen to have created.
   */
  const HIRING_SLUGS = ['spec-hire-flag', 'spec-hire-roles', 'spec-hire-neither'];

  const makeCo = (slug, extra) =>
    Company.create({
      slug,
      name: `Spec ${slug}`,
      organizationType: 'tutoring_center',
      status: 'published',
      moderationStatus: 'none',
      location: { country: 'US' },
      ...extra,
    });

  const hiringSlugs = async () => {
    const { body } = await get('/api/public/companies?hiringOnly=true&limit=48');
    return body.data.map((c) => c.slug);
  };

  before(async () => {
    await Company.deleteMany({ slug: { $in: HIRING_SLUGS } });

    /* Says it is hiring, has nothing posted — the "approach us anyway" case. */
    await makeCo('spec-hire-flag', { isCurrentlyHiring: true });

    /* Says nothing, but has an ACTIVE role. This is the case that was wrongly excluded. */
    const withRoles = await makeCo('spec-hire-roles', { isCurrentlyHiring: false });
    await HiringIntent.create({
      companyId: withRoles._id,
      title: 'Spec Open Role',
      status: 'active',
      roleCategories: ['private_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });

    /* Neither. */
    await makeCo('spec-hire-neither', { isCurrentlyHiring: false });
  });

  after(async () => {
    const cos = await Company.find({ slug: { $in: HIRING_SLUGS } }).select('_id').lean();
    await HiringIntent.deleteMany({ companyId: { $in: cos.map((c) => c._id) } });
    await Company.deleteMany({ slug: { $in: HIRING_SLUGS } });
  });

  test('a company with the flag set is included', async () => {
    assert.ok((await hiringSlugs()).includes('spec-hire-flag'));
  });

  test('a company with ACTIVE roles is included, even with the flag off', async () => {
    assert.ok(
      (await hiringSlugs()).includes('spec-hire-roles'),
      'an open role is stronger evidence of hiring than a flag nobody remembered to set',
    );
  });

  test('a company with neither is excluded', async () => {
    assert.ok(!(await hiringSlugs()).includes('spec-hire-neither'));
  });

  test('the filter still narrows — it did not become a no-op', async () => {
    const filtered = await hiringSlugs();
    const { body: all } = await get('/api/public/companies?limit=48');
    assert.ok(
      filtered.length < all.data.length,
      'if every company came back, the filter would be broken in the other direction',
    );
  });

  test('an INACTIVE role does not make a company hiring', async () => {
    const co = await makeCo('spec-hire-closed', { isCurrentlyHiring: false });
    await HiringIntent.create({
      companyId: co._id,
      title: 'Closed Role',
      status: 'closed',
      roleCategories: ['private_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });
    try {
      assert.ok(!(await hiringSlugs()).includes('spec-hire-closed'));
    } finally {
      await HiringIntent.deleteMany({ companyId: co._id });
      await Company.deleteOne({ _id: co._id });
    }
  });

  test('a role at an UNPUBLISHED company does not make it appear', async () => {
    const draft = await makeCo('spec-hire-draft', { status: 'draft', isCurrentlyHiring: false });
    await HiringIntent.create({
      companyId: draft._id,
      title: 'Draft Co Role',
      status: 'active',
      roleCategories: ['private_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });
    try {
      assert.ok(
        !(await hiringSlugs()).includes('spec-hire-draft'),
        'visibility still outranks the hiring predicate',
      );
    } finally {
      await HiringIntent.deleteMany({ companyId: draft._id });
      await Company.deleteOne({ _id: draft._id });
    }
  });

  test('the payload carries `isHiring`, so the badge cannot contradict the filter', async () => {
    const { body } = await get('/api/public/companies?limit=48');
    const withRoles = body.data.find((c) => c.slug === 'spec-hire-roles');
    const neither = body.data.find((c) => c.slug === 'spec-hire-neither');

    assert.equal(withRoles.isHiring, true, 'listed by the filter, so it must render as hiring');
    assert.equal(withRoles.isCurrentlyHiring, false, 'the raw flag is untouched');
    assert.equal(neither.isHiring, false);
  });

  test('the company PROFILE agrees with the directory', async () => {
    const { body } = await get('/api/public/companies/spec-hire-roles');
    const company = body.data.company ?? body.data;
    assert.equal(company.isHiring, true);
    assert.equal(company.openRoleCount, 1);
  });

  test('the hiring FACET count matches the filter it describes', async () => {
    const { body: facets } = await get('/api/public/companies/facets');
    const filtered = await hiringSlugs();
    assert.equal(
      facets.data.hiring,
      filtered.length,
      'a count that disagrees with its own filter is a lie',
    );
  });
});

describe('GET /api/public/sitemap.xml', () => {
  /*
   * A sitemap is a list of URLs ASSERTED to be publicly fetchable. If it were built from its own
   * idea of "public" it could advertise a draft company and hand a crawler a 404 — or keep
   * advertising a page after it was unpublished. It reuses `publiclyVisible()` and role search's
   * two-stage predicate for exactly that reason, and these tests are what hold the two together.
   */
  const sitemap = async () => {
    const response = await fetch(`${baseUrl}/api/public/sitemap.xml`);
    return { status: response.status, type: response.headers.get('content-type'), xml: await response.text() };
  };

  test('is served as XML, unauthenticated', async () => {
    const { status, type, xml } = await sitemap();
    assert.equal(status, 200);
    assert.match(type, /xml/);
    assert.match(xml, /^<\?xml version="1\.0"/);
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  });

  test('includes a PUBLISHED company', async () => {
    const { xml } = await sitemap();
    assert.ok(xml.includes('/companies/spec-published-co'), 'a published company must be listed');
  });

  test('EXCLUDES a draft company', async () => {
    const { xml } = await sitemap();
    assert.ok(!xml.includes('spec-draft-co'), 'a draft company must never be advertised');
  });

  test('EXCLUDES a moderation-restricted company', async () => {
    const { xml } = await sitemap();
    assert.ok(!xml.includes('spec-restricted-co'));
  });

  test('lists the public index pages', async () => {
    const { xml } = await sitemap();
    assert.ok(/<loc>[^<]*\/companies<\/loc>/.test(xml));
    assert.ok(/<loc>[^<]*\/roles<\/loc>/.test(xml));
  });

  test('never lists a private surface', async () => {
    const { xml } = await sitemap();
    const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

    for (const path of paths) {
      for (const forbidden of ['/me', '/settings', '/c/', '/p/', '/auth/', '/signin', '/signup']) {
        assert.ok(
          !(path === forbidden || path.startsWith(forbidden.endsWith('/') ? forbidden : `${forbidden}/`)),
          `${path} must not appear in the sitemap`,
        );
      }
    }
    /* PRD §21.2 names sitemaps explicitly. */
    assert.ok(!/candidate|portfolio/i.test(xml), 'no candidate surface, ever');
  });

  test('escapes XML, so a name with an ampersand cannot break the document', async () => {
    const co = await Company.create({
      slug: 'spec-amp-co',
      name: 'Reading & Writing <Academy>',
      organizationType: 'tutoring_center',
      status: 'published',
      moderationStatus: 'none',
      location: { country: 'US' },
    });
    try {
      const { xml } = await sitemap();
      assert.ok(xml.includes('/companies/spec-amp-co'));
      assert.ok(!xml.includes('<Academy>'), 'raw angle brackets would be invalid XML');
    } finally {
      await Company.deleteOne({ _id: co._id });
    }
  });
});

describe('GET /api/public/companies/facets', () => {
  test('returns counts scoped to publicly visible companies', async () => {
    const { status, body } = await get('/api/public/companies/facets');

    assert.equal(status, 200);
    assert.ok(typeof body.data.total === 'number');
    assert.ok(typeof body.data.hiring === 'number');
    assert.ok(body.data.organizationType);
  });
});
