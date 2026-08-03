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
    assert.ok(body.data.every((c) => c.isCurrentlyHiring === true));
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
    const { status } = await get('/api/public/companies?limit=500');
    assert.equal(status, 400, 'limit above the cap is rejected rather than silently honoured');
  });

  test('returns an empty array, not an error, when nothing matches', async () => {
    const { status, body } = await get('/api/public/companies?q=zzzznomatchxyz');
    assert.equal(status, 200);
    assert.deepEqual(body.data, []);
    assert.equal(body.meta.total, 0);
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
