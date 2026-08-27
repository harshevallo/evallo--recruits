/**
 * PUB-02 — public company profile and expression of interest.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { HiringIntent } from '../../src/modules/hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from '../../src/modules/interests/expressionOfInterest.model.js';

let server;
let baseUrl;
let companyId;
let activeIntentId;
let closedIntentId;

const get = (path) => fetch(`${baseUrl}${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));

const postInterest = (slug, payload) =>
  fetch(`${baseUrl}/api/public/companies/${slug}/interest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const VALID = { name: 'Spec Candidate', email: 'spec-candidate@example.com', consent: true };

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await Company.deleteMany({ slug: /^pub02-/ });

  const company = await Company.create({
    slug: 'pub02-company',
    name: 'PUB02 Company',
    organizationType: 'tutoring_center',
    status: 'published',
    moderationStatus: 'none',
    tagline: 'A spec company',
    sizeRange: '11-50',
    foundingYear: 2015,
    location: { country: 'US', city: 'Denver' },
    educationServices: ['academic_tutoring'],
    subjects: ['Digital SAT'],
    deliveryModes: ['remote'],
    learnerSegments: ['high_school', 'undergraduate'],
    coverImageUrl: 'https://cdn.example/cover.jpg',
    metrics: [{ value: '180 pts', label: 'Median SAT gain' }],
    pullQuote: { text: 'Independent thinkers.', attribution: 'Founding team' },
    perks: ['Annual training budget'],
    description: { short: 'Short.', philosophy: 'Diagnose before you teach.' },
    isCurrentlyHiring: true,
    publicContact: { email: 'jobs@pub02.example' },
  });
  companyId = company._id;

  await Company.create({
    slug: 'pub02-draft',
    name: 'PUB02 Draft',
    organizationType: 'tutoring_center',
    status: 'draft',
    location: { country: 'US', city: 'Denver' },
  });

  const active = await HiringIntent.create({
    companyId,
    title: 'Spec Active Role',
    status: 'active',
    roleCategories: ['private_tutor'],
    employmentTypes: ['part_time'],
    deliveryModes: ['remote'],
  });
  activeIntentId = active._id;

  const closed = await HiringIntent.create({
    companyId,
    title: 'Spec Closed Role',
    status: 'closed',
    roleCategories: ['school_teacher'],
  });
  closedIntentId = closed._id;
});

after(async () => {
  await ExpressionOfInterest.deleteMany({ companyId });
  await HiringIntent.deleteMany({ companyId });
  await Company.deleteMany({ slug: /^pub02-/ });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(async () => {
  await ExpressionOfInterest.deleteMany({ companyId });
});

describe('GET /api/public/companies/:slug', () => {
  test('returns the full public profile', async () => {
    const { status, body } = await get('/api/public/companies/pub02-company');

    assert.equal(status, 200);
    assert.equal(body.data.name, 'PUB02 Company');
    assert.equal(body.data.sizeRange, '11-50');
    assert.equal(body.data.publicContact.email, 'jobs@pub02.example');
    assert.equal(body.data.isCurrentlyHiring, true);
  });

  /*
   * Every one of these is on the profile that PUB-02 renders. `PUBLIC_PROFILE_FIELDS` is a
   * hand-maintained projection string, so a field added to the model and to the page but forgotten
   * there fails silently — the page simply renders nothing, which is exactly how `coverImageUrl`
   * went unrendered for as long as it did. This is the test that catches the next one.
   */
  test('serves the profile-body fields the page renders', async () => {
    const { body } = await get('/api/public/companies/pub02-company');
    const data = body.data;

    assert.equal(data.coverImageUrl, 'https://cdn.example/cover.jpg');
    assert.deepEqual(data.learnerSegments, ['high_school', 'undergraduate']);
    assert.deepEqual(data.metrics, [{ value: '180 pts', label: 'Median SAT gain' }]);
    assert.equal(data.pullQuote.text, 'Independent thinkers.');
    assert.deepEqual(data.perks, ['Annual training budget']);
    assert.equal(data.description.philosophy, 'Diagnose before you teach.');
  });

  test('includes ONLY active hiring intents', async () => {
    const { body } = await get('/api/public/companies/pub02-company');

    assert.equal(body.data.openRoleCount, 1);
    assert.equal(body.data.openRoles[0].title, 'Spec Active Role');
    assert.ok(!body.data.openRoles.some((r) => r.title === 'Spec Closed Role'));
  });

  test('404s for an unpublished company', async () => {
    const { status } = await get('/api/public/companies/pub02-draft');
    assert.equal(status, 404, 'draft existence must not be disclosed');
  });

  test('404s for an unknown slug', async () => {
    const { status } = await get('/api/public/companies/does-not-exist');
    assert.equal(status, 404);
  });

  test('rejects a malformed slug', async () => {
    const { status } = await get('/api/public/companies/BAD__slug!!');
    assert.equal(status, 400);
  });

  test('never exposes verification records or account fields', async () => {
    const { body } = await get('/api/public/companies/pub02-company');
    const serialised = JSON.stringify(body);

    assert.ok(!serialised.includes('verifiedDomains'));
    for (const forbidden of ['passwordHash', 'candidateId', 'refreshToken']) {
      assert.ok(!serialised.includes(forbidden), `leaked ${forbidden}`);
    }
  });
});

describe('POST /api/public/companies/:slug/interest', () => {
  test('stores a general expression of interest', async () => {
    const { status, body } = await postInterest('pub02-company', VALID);

    assert.equal(status, 201);
    assert.equal(body.data.status, 'submitted');

    const stored = await ExpressionOfInterest.findOne({ companyId }).lean();
    assert.equal(stored.contact.email, VALID.email);
    assert.equal(stored.hiringIntentId, null, 'general interest has no intent');
    assert.equal(stored.status, 'submitted');
    assert.ok(stored.consent.grantedAt, 'consent timestamp recorded');
  });

  test('stores interest scoped to an active role', async () => {
    await postInterest('pub02-company', {
      ...VALID,
      hiringIntentId: String(activeIntentId),
    });

    const stored = await ExpressionOfInterest.findOne({ companyId }).lean();
    assert.equal(String(stored.hiringIntentId), String(activeIntentId));
  });

  test('is idempotent — a repeat submission creates no duplicate', async () => {
    await postInterest('pub02-company', VALID);
    const second = await postInterest('pub02-company', VALID);

    assert.equal(second.status, 200);
    assert.equal(second.body.data.status, 'already_submitted');
    assert.equal(await ExpressionOfInterest.countDocuments({ companyId }), 1);
  });

  test('treats general and role-specific interest as distinct records', async () => {
    await postInterest('pub02-company', VALID);
    await postInterest('pub02-company', { ...VALID, hiringIntentId: String(activeIntentId) });

    assert.equal(await ExpressionOfInterest.countDocuments({ companyId }), 2);
  });

  test('refuses interest in a closed role with a specific code', async () => {
    const { status, body } = await postInterest('pub02-company', {
      ...VALID,
      hiringIntentId: String(closedIntentId),
    });

    assert.equal(status, 409);
    assert.equal(body.error.code, 'INTENT_CLOSED');
    assert.match(body.error.message, /general interest/i, 'offers an alternative');
  });

  test('404s for an unpublished company', async () => {
    const { status } = await postInterest('pub02-draft', VALID);
    assert.equal(status, 404);
  });

  describe('validation', () => {
    test('requires consent', async () => {
      const { status, body } = await postInterest('pub02-company', {
        name: 'X',
        email: 'x@example.com',
      });

      assert.equal(status, 400);
      assert.ok(body.error.details.consent);
    });

    test('rejects a malformed email', async () => {
      const { status, body } = await postInterest('pub02-company', {
        ...VALID,
        email: 'nope',
      });

      assert.equal(status, 400);
      assert.ok(body.error.details.email);
    });

    test('rejects an over-long message', async () => {
      const { status } = await postInterest('pub02-company', {
        ...VALID,
        message: 'x'.repeat(1001),
      });

      assert.equal(status, 400);
    });

    test('ignores client-supplied server-owned fields', async () => {
      await postInterest('pub02-company', { ...VALID, status: 'hired', candidateId: '1'.repeat(24) });

      const stored = await ExpressionOfInterest.findOne({ companyId }).lean();
      assert.equal(stored.status, 'submitted');
      assert.equal(stored.candidateId, null);
    });
  });
});
