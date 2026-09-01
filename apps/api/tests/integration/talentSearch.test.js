/**
 * REC-12 talent search.
 *
 * The behaviours worth pinning are the ones §21.4 calls non-negotiable: that blocks and
 * visibility are applied BEFORE results are counted or paged, that search never reaches a
 * candidate outside their own settings, and that facets OR within themselves and AND between
 * themselves. The rest — sorting, paging — is pinned because a filter that silently ignores half
 * its input looks identical to one that works.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROLES,
  MEMBERSHIP_STATUS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { AccessGrant } from '../../src/modules/interests/accessGrant.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const OWNER = 'ts-owner@example.com';
const RECRUITER = 'ts-recruiter@example.com';
const VIEWER = 'ts-viewer@example.com';
const HIRING_MANAGER = 'ts-hm@example.com';
const STRANGER = 'ts-stranger@example.com';
const PASSWORD = 'Password123';

/** Candidate fixtures. Kept apart from staff so cleanup can be exact. */
const C_MATHS = 'ts-cand-maths@example.com';
const C_PHYSICS = 'ts-cand-physics@example.com';
const C_DRAFT = 'ts-cand-draft@example.com';
const C_PRIVATE = 'ts-cand-private@example.com';
const C_PAUSED = 'ts-cand-paused@example.com';
const C_BLOCKER = 'ts-cand-blocker@example.com';
const C_PUBLIC = 'ts-cand-public@example.com';

const STAFF = [OWNER, RECRUITER, VIEWER, HIRING_MANAGER, STRANGER];
const CANDIDATES = [C_MATHS, C_PHYSICS, C_DRAFT, C_PRIVATE, C_PAUSED, C_BLOCKER, C_PUBLIC];
const ALL_EMAILS = [...STAFF, ...CANDIDATES];

const jsonPost = (path, body, headers = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

const authPost = (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const bodyOf = async (res) => (await res.json()).data;

async function onboard(email, patch = {}) {
  await jsonPost('/api/auth/signup', { email });

  const user = await User.findOne({ email });
  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
    email,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const verified = await jsonPost('/api/auth/verify-email', { token: raw });
  const { setupToken } = (await verified.json()).data;
  const res = await jsonPost('/api/auth/set-password', {
    token: setupToken,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });

  if (Object.keys(patch).length) await User.findByIdAndUpdate(user._id, patch);

  return { accessToken: (await res.json()).data.accessToken, user };
}

async function createCompany(token) {
  const res = await authPost('/api/companies', token, {
    name: 'Search Academy',
    organizationType: 'tutoring_center',
    location: { country: 'IN', city: 'Bengaluru' },
  });
  return bodyOf(res);
}

async function addMember(companyId, email, role) {
  const { accessToken, user } = await onboard(email);
  await CompanyMember.create({
    companyId,
    userId: user._id,
    role,
    status: MEMBERSHIP_STATUS.ACTIVE,
    acceptedAt: new Date(),
  });
  return { accessToken, user };
}

/**
 * Countries used ONLY by this suite's fixtures.
 *
 * Search is global by design — it returns every discoverable candidate the company may see, and
 * this database holds real profiles besides these. Scoping every query to these two countries is
 * what lets the suite assert on exact totals: without it, `meta.total` counts strangers and the
 * numbers drift whenever anyone else's data changes.
 */
const SCOPE_COUNTRIES = ['NZ', 'ZA'];
const SCOPE_QS = SCOPE_COUNTRIES.map((c) => `country=${c}`).join('&');

/** A searchable candidate. `userPatch` writes the personal layer (country, languages, name). */
async function candidate(email, { userPatch = {}, ...profile } = {}) {
  const { user } = await onboard(email, {
    location: { country: SCOPE_COUNTRIES[0] },
    ...userPatch,
  });

  const doc = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    publishedAt: new Date(),
    lastActiveAt: new Date(),
    ...profile,
  });

  return { user, profile: doc };
}

/**
 * Runs a search, scoped to this suite's fixture countries unless the caller filters by country
 * itself (the country-facet test does, and supplies a scope country of its own).
 */
const search = async (slug, token, qs = '') => {
  const scoped = qs.includes('country=')
    ? qs
    : `${qs}${qs.startsWith('?') ? '&' : '?'}${SCOPE_QS}`;

  const envelope = await (
    await authGet(`/api/companies/${slug}/search/candidates${scoped}`, token)
  ).json();
  return { ...envelope.data, meta: envelope.meta };
};

const namesIn = (result) => result.candidates.map((c) => c.header.name).sort();

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function cleanupFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } })
    .select('_id')
    .lean();
  const ids = users.map((u) => u._id);

  const companies = await Company.find({ slug: /^search-academy/ })
    .select('_id')
    .lean();
  const companyIds = companies.map((c) => c._id);

  const profiles = await CandidateProfile.find({ userId: { $in: ids } })
    .select('_id')
    .lean();

  await AccessGrant.deleteMany({
    $or: [
      { candidateId: { $in: profiles.map((p) => p._id) } },
      { companyId: { $in: companyIds } },
    ],
  });
  await CandidateProfile.deleteMany({ userId: { $in: ids } });
  await CompanyMember.deleteMany({
    $or: [{ userId: { $in: ids } }, { companyId: { $in: companyIds } }],
  });
  await Session.deleteMany({ userId: { $in: ids } });
  await VerificationToken.deleteMany({ userId: { $in: ids } });
  await Company.deleteMany({ slug: /^search-academy/ });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

after(async () => {
  await cleanupFixtures();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(cleanupFixtures);

/* ── privacy — PRD §21.4, non-negotiable ──────────────────────────────────────────────────── */

describe('REC-12 privacy', () => {
  test('only DISCOVERABLE candidates are searchable', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, { userPatch: { name: 'Maths Person' }, subjects: ['mathematics'] });
    await candidate(C_DRAFT, {
      userPatch: { name: 'Draft Person' },
      status: CANDIDATE_VISIBILITY.DRAFT,
    });
    await candidate(C_PRIVATE, {
      userPatch: { name: 'Private Person' },
      status: CANDIDATE_VISIBILITY.PRIVATE,
    });
    await candidate(C_PAUSED, {
      userPatch: { name: 'Paused Person' },
      status: CANDIDATE_VISIBILITY.PAUSED,
    });

    const result = await search(company.slug, accessToken);

    assert.deepEqual(namesIn(result), ['Maths Person']);
    assert.equal(result.meta.total, 1, 'the excluded ones do not inflate the count either');
  });

  /*
   * Phase 3C widened `searchableCandidateFilter` from a hardcoded `discoverable` to
   * `SEARCHABLE_VISIBILITY_STATES`, which now also holds `public`.
   *
   * The direction matters: `public` is a SUPERSET of `discoverable`, so opting into a public
   * portfolio must never cost a candidate the recruiter discovery they already had. Before this
   * change the hardcoded filter would have made them vanish from search the moment they published
   * — more visibility producing less reach, which nobody would choose on purpose.
   */
  test('PUBLIC candidates appear in recruiter search, alongside DISCOVERABLE', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, { userPatch: { name: 'Discoverable Person' }, subjects: ['mathematics'] });
    await candidate(C_PUBLIC, {
      userPatch: { name: 'Public Person' },
      status: CANDIDATE_VISIBILITY.PUBLIC,
      subjects: ['mathematics'],
    });
    await candidate(C_PRIVATE, {
      userPatch: { name: 'Private Person' },
      status: CANDIDATE_VISIBILITY.PRIVATE,
      subjects: ['mathematics'],
    });

    const result = await search(company.slug, accessToken);
    const names = namesIn(result).sort();

    assert.deepEqual(names, ['Discoverable Person', 'Public Person']);
    assert.ok(!names.includes('Private Person'), 'private is still excluded from search');
    assert.equal(result.meta.total, 2, 'and the count matches what is listed');
  });

  test('a PUBLIC candidate is still excluded from search by a block', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_PUBLIC, {
      userPatch: { name: 'Public Person' },
      status: CANDIDATE_VISIBILITY.PUBLIC,
      blockedCompanyIds: [company.id],
    });

    assert.deepEqual(namesIn(await search(company.slug, accessToken)), []);
  });

  test('a PRIVATE candidate with an access grant is still absent from search (§4.3)', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const { profile } = await candidate(C_PRIVATE, {
      userPatch: { name: 'Private Person' },
      status: CANDIDATE_VISIBILITY.PRIVATE,
    });
    await AccessGrant.create({
      candidateId: profile._id,
      companyId: company.id,
      grantedAt: new Date(),
    });

    const result = await search(company.slug, accessToken);

    assert.equal(
      result.candidates.length,
      0,
      'a grant makes someone reachable, it does not make them discoverable',
    );
  });

  test('a candidate who blocked this company is excluded before counting', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, { userPatch: { name: 'Maths Person' } });
    const { profile } = await candidate(C_BLOCKER, { userPatch: { name: 'Blocker Person' } });

    let result = await search(company.slug, accessToken);
    assert.equal(result.meta.total, 2);

    await CandidateProfile.findByIdAndUpdate(profile._id, { blockedCompanyIds: [company.id] });

    result = await search(company.slug, accessToken);
    assert.deepEqual(namesIn(result), ['Maths Person']);
    assert.equal(result.meta.total, 1, 'excluded BEFORE the count, not filtered from the page');
  });

  test('a block hides the candidate from that company only', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: otherToken } = await onboard(STRANGER);
    const other = await createCompany(otherToken);

    const { profile } = await candidate(C_BLOCKER, { userPatch: { name: 'Blocker Person' } });
    await CandidateProfile.findByIdAndUpdate(profile._id, { blockedCompanyIds: [company.id] });

    assert.equal((await search(company.slug, accessToken)).candidates.length, 0);
    assert.equal((await search(other.slug, otherToken)).candidates.length, 1);
  });

  test('a result card carries no contact details and no draft internals', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await candidate(C_MATHS, {
      userPatch: { name: 'Maths Person' },
      headline: 'Maths teacher',
      contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
    });

    const [card] = (await search(company.slug, accessToken)).candidates;
    const serialised = JSON.stringify(card);

    assert.equal(card.contact, undefined, 'discovery never ships contact details');
    assert.equal(card.evidence, undefined);
    assert.equal(
      serialised.includes(C_MATHS),
      false,
      'the email appears nowhere in the payload, even for authorized_recruiters',
    );
    assert.equal(serialised.includes('blockedCompanyIds'), false);
    assert.ok(card.header.name && card.header.headline, 'but the recruiter-visible fields are there');
  });
});

/* ── search and filters ───────────────────────────────────────────────────────────────────── */

describe('REC-12 search and filters', () => {
  async function seedTwo() {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, {
      userPatch: { name: 'Asha Maths', location: { country: 'NZ', region: 'Karnataka' }, languages: ['en', 'hi'] },
      headline: 'Secondary mathematics teacher',
      summary: 'I teach algebra and calculus.',
      targetRoles: ['school_teacher'],
      subjects: ['mathematics'],
      learnerSegments: ['high_school'],
      employmentTypes: ['full_time'],
      deliveryModes: ['on_site'],
      yearsExperience: 8,
    });

    await candidate(C_PHYSICS, {
      userPatch: { name: 'Ben Physics', location: { country: 'ZA', region: 'London' }, languages: ['en'] },
      headline: 'Physics tutor',
      summary: 'Mechanics and electromagnetism.',
      targetRoles: ['private_tutor'],
      subjects: ['physics'],
      learnerSegments: ['high_school'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
      yearsExperience: 3,
    });

    return { accessToken, company };
  }

  test('keyword matches headline, summary, subjects and name', async () => {
    const { accessToken, company } = await seedTwo();

    assert.deepEqual(namesIn(await search(company.slug, accessToken, '?q=algebra')), ['Asha Maths']);
    assert.deepEqual(namesIn(await search(company.slug, accessToken, '?q=Physics tutor')), ['Ben Physics']);
    assert.deepEqual(namesIn(await search(company.slug, accessToken, '?q=mathematics')), ['Asha Maths']);
    assert.deepEqual(namesIn(await search(company.slug, accessToken, '?q=Asha')), ['Asha Maths']);
    assert.equal((await search(company.slug, accessToken, '?q=nobodyhasthis')).candidates.length, 0);
  });

  test('keyword special characters are matched literally, not as a pattern', async () => {
    const { accessToken, company } = await seedTwo();

    const result = await search(company.slug, accessToken, '?q=' + encodeURIComponent('.*'));
    assert.equal(result.candidates.length, 0, 'a regex metacharacter must not match everything');
  });

  test('within a facet OR, between facets AND (§21.4)', async () => {
    const { accessToken, company } = await seedTwo();

    // OR inside one facet: both subjects selected returns both people.
    const both = await search(company.slug, accessToken, '?subject=mathematics&subject=physics');
    assert.deepEqual(namesIn(both), ['Asha Maths', 'Ben Physics']);

    // AND between facets: physics AND full_time matches nobody, though each alone matches one.
    const across = await search(company.slug, accessToken, '?subject=physics&employmentType=full_time');
    assert.equal(across.candidates.length, 0);

    const consistent = await search(company.slug, accessToken, '?subject=physics&employmentType=part_time');
    assert.deepEqual(namesIn(consistent), ['Ben Physics']);
  });

  test('each supported facet narrows correctly', async () => {
    const { accessToken, company } = await seedTwo();

    const cases = [
      ['?role=school_teacher', ['Asha Maths']],
      ['?learnerSegment=high_school', ['Asha Maths', 'Ben Physics']],
      ['?deliveryMode=remote', ['Ben Physics']],
      ['?country=ZA', ['Ben Physics']],
      ['?language=hi', ['Asha Maths']],
      ['?region=karnataka', ['Asha Maths']],
      ['?minYears=5', ['Asha Maths']],
      ['?maxYears=5', ['Ben Physics']],
      ['?minYears=1&maxYears=20', ['Asha Maths', 'Ben Physics']],
    ];

    for (const [qs, expected] of cases) {
      const result = await search(company.slug, accessToken, qs);
      assert.deepEqual(namesIn(result), expected, `filter ${qs}`);
    }
  });

  test('each result explains which criteria it matched (§21.4)', async () => {
    const { accessToken, company } = await seedTwo();

    const result = await search(
      company.slug,
      accessToken,
      '?subject=mathematics&deliveryMode=on_site&q=algebra',
    );

    const [card] = result.candidates;
    // `country` is the suite's own scoping facet (see SCOPE_COUNTRIES) and matches legitimately.
    const facets = card.matchedOn
      .map((m) => m.facet)
      .filter((f) => f !== 'country')
      .sort();

    assert.deepEqual(facets, ['deliveryMode', 'keyword', 'subject']);
    assert.deepEqual(
      card.matchedOn.find((m) => m.facet === 'subject').values,
      ['mathematics'],
    );
    assert.ok(
      card.matchedOn.find((m) => m.facet === 'keyword').values.includes('summary'),
      'the keyword hit is attributed to the field it matched',
    );
  });

  test('an unfiltered search explains nothing rather than inventing a reason', async () => {
    const { accessToken, company } = await seedTwo();
    const result = await search(company.slug, accessToken);

    for (const card of result.candidates) {
      const beyondScope = card.matchedOn.filter((m) => m.facet !== 'country');
      assert.deepEqual(beyondScope, [], 'no criteria were given, so nothing was matched on');
    }
  });

  test('an unsupported facet value is rejected before any query runs', async () => {
    const { accessToken, company } = await seedTwo();

    assert.equal(
      (await authGet(`/api/companies/${company.slug}/search/candidates?subject=underwater-basket-weaving`, accessToken)).status,
      400,
    );
    assert.equal(
      (await authGet(`/api/companies/${company.slug}/search/candidates?sort=best-match`, accessToken)).status,
      400,
      'there is no relevance sort to ask for',
    );
    assert.equal(
      (await authGet(`/api/companies/${company.slug}/search/candidates?minYears=9&maxYears=2`, accessToken)).status,
      400,
      'an impossible range is refused rather than silently returning nothing',
    );
  });
});

/* ── sorting and pagination ───────────────────────────────────────────────────────────────── */

describe('REC-12 sorting and pagination', () => {
  test('sorts are deterministic and differ from one another', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, {
      userPatch: { name: 'Zoe Last' },
      publishedAt: new Date('2026-01-01'),
      lastActiveAt: new Date('2026-08-01'),
    });
    await candidate(C_PHYSICS, {
      userPatch: { name: 'Adam First' },
      publishedAt: new Date('2026-06-01'),
      lastActiveAt: new Date('2026-02-01'),
    });

    const byName = await search(company.slug, accessToken, '?sort=name');
    assert.deepEqual(
      byName.candidates.map((c) => c.header.name),
      ['Adam First', 'Zoe Last'],
    );

    const byNewest = await search(company.slug, accessToken, '?sort=newest');
    assert.equal(byNewest.candidates[0].header.name, 'Adam First', 'newest profile first');

    const byRecent = await search(company.slug, accessToken, '?sort=recent');
    assert.equal(byRecent.candidates[0].header.name, 'Zoe Last', 'most recently active first');
  });

  test('pagination is server-side and reports a stable total', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    await candidate(C_MATHS, { userPatch: { name: 'A One' } });
    await candidate(C_PHYSICS, { userPatch: { name: 'B Two' } });
    await candidate(C_PAUSED, { userPatch: { name: 'C Three' } });

    const page1 = await search(company.slug, accessToken, '?sort=name&limit=2&page=1');
    assert.equal(page1.candidates.length, 2);
    assert.equal(page1.meta.total, 3);
    assert.equal(page1.meta.totalPages, 2);
    assert.equal(page1.meta.hasMore, true);

    const page2 = await search(company.slug, accessToken, '?sort=name&limit=2&page=2');
    assert.equal(page2.candidates.length, 1);
    assert.equal(page2.meta.hasMore, false);

    const seen = [...page1.candidates, ...page2.candidates].map((c) => c.header.name);
    assert.equal(new Set(seen).size, 3, 'the pages partition the results — no overlap, no gap');
  });

  test('a page beyond the end is empty rather than an error', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await candidate(C_MATHS, { userPatch: { name: 'Only One' } });

    const result = await search(company.slug, accessToken, '?page=9');
    assert.deepEqual(result.candidates, []);
    assert.equal(result.meta.total, 1);
  });

  test('an empty corpus returns an empty list, not a failure', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);

    const result = await search(company.slug, accessToken);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.meta.total, 0);
    assert.equal(result.meta.totalPages, 1);
  });
});

/* ── permissions ──────────────────────────────────────────────────────────────────────────── */

describe('REC-12 permissions', () => {
  test('owner, admin and recruiter may search; hiring manager and viewer may not', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    await candidate(C_MATHS, { userPatch: { name: 'Maths Person' } });

    const { accessToken: recruiterToken } = await addMember(
      company.id,
      RECRUITER,
      COMPANY_ROLES.RECRUITER,
    );
    const { accessToken: hmToken } = await addMember(
      company.id,
      HIRING_MANAGER,
      COMPANY_ROLES.HIRING_MANAGER,
    );
    const { accessToken: viewerToken } = await addMember(company.id, VIEWER, COMPANY_ROLES.VIEWER);

    const status = async (token) =>
      (await authGet(`/api/companies/${company.slug}/search/candidates`, token)).status;

    assert.equal(await status(accessToken), 200, 'owner');
    assert.equal(await status(recruiterToken), 200, 'recruiter');
    assert.equal(await status(hmToken), 403, 'hiring manager has candidate:view but not :search');
    assert.equal(await status(viewerToken), 403, 'viewer');
  });

  test('a non-member gets 404, never 403 — membership is not disclosed', async () => {
    const { accessToken } = await onboard(OWNER);
    const company = await createCompany(accessToken);
    const { accessToken: strangerToken } = await onboard(STRANGER);

    assert.equal(
      (await authGet(`/api/companies/${company.slug}/search/candidates`, strangerToken)).status,
      404,
    );
  });

  test('unauthenticated requests are refused', async () => {
    assert.equal((await fetch(`${baseUrl}/api/companies/any/search/candidates`)).status, 401);
  });
});
