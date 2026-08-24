/**
 * Candidate role search — `GET /api/public/roles` and `/roles/facets`.
 *
 * The assertions that matter are the visibility ones. A role is a company's data, and this endpoint
 * is unauthenticated, so the question "can this role be seen" has exactly one correct answer: only
 * when its company could be seen too. Every other test here is about the search behaving; those
 * three are about it not leaking.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_STATUS, MODERATION_STATUS, HIRING_INTENT_STATUS } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { HiringIntent } from '../../src/modules/hiring-intents/hiringIntent.model.js';

let server;
let baseUrl;

const SLUGS = ['rs-published', 'rs-draft', 'rs-restricted'];

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
};

async function makeCompany(slug, overrides = {}) {
  return Company.create({
    slug,
    name: slug === 'rs-published' ? 'Published Academy' : slug,
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    isCurrentlyHiring: true,
    acceptsGeneralInterest: true,
    location: { country: 'IN', city: 'Bengaluru' },
    ...overrides,
  });
}

async function makeIntent(companyId, overrides = {}) {
  return HiringIntent.create({
    companyId,
    title: 'IB Physics Teacher',
    status: HIRING_INTENT_STATUS.ACTIVE,
    roleCategories: ['school_teacher'],
    specializations: { subjects: ['physics'] },
    employmentTypes: ['full_time'],
    deliveryModes: ['on_site'],
    locations: [{ country: 'IN', region: 'Karnataka', city: 'Bengaluru' }],
    minYears: 3,
    ...overrides,
  });
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

async function cleanup() {
  const companies = await Company.find({ slug: { $in: SLUGS } }).select('_id').lean();
  if (companies.length > 0) {
    await HiringIntent.deleteMany({ companyId: { $in: companies.map((c) => c._id) } });
  }
  await Company.deleteMany({ slug: { $in: SLUGS } });
}

beforeEach(cleanup);

describe('role search — visibility', () => {
  test('a role from a PUBLISHED company appears', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id);

    const { status, body } = await get('/api/public/roles?q=IB%20Physics');
    assert.equal(status, 200);

    const mine = body.data.filter((role) => role.company?.slug === 'rs-published');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].title, 'IB Physics Teacher');
    assert.equal(mine[0].company.name, 'Published Academy');
  });

  test('a role from a DRAFT company never appears', async () => {
    const draft = await makeCompany('rs-draft', { status: COMPANY_STATUS.DRAFT });
    await makeIntent(draft._id, { title: 'Draft Company Role' });

    const { body } = await get('/api/public/roles?q=Draft%20Company%20Role');
    assert.equal(body.data.length, 0, 'an unpublished company must contribute no roles');
  });

  test('a role from a MODERATION-RESTRICTED company never appears', async () => {
    const restricted = await makeCompany('rs-restricted', {
      moderationStatus: MODERATION_STATUS.RESTRICTED,
    });
    await makeIntent(restricted._id, { title: 'Restricted Company Role' });

    const { body } = await get('/api/public/roles?q=Restricted%20Company%20Role');
    assert.equal(body.data.length, 0);
  });

  test('a NON-ACTIVE intent never appears, even from a published company', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, {
      title: 'Paused Role Somewhere',
      status: HIRING_INTENT_STATUS.PAUSED,
    });

    const { body } = await get('/api/public/roles?q=Paused%20Role%20Somewhere');
    assert.equal(body.data.length, 0);
  });

  test('unpublishing a company removes its roles with no further action', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, { title: 'Vanishing Role' });

    let res = await get('/api/public/roles?q=Vanishing%20Role');
    assert.equal(res.body.data.length, 1);

    await Company.updateOne({ _id: company._id }, { $set: { status: COMPANY_STATUS.DRAFT } });

    res = await get('/api/public/roles?q=Vanishing%20Role');
    assert.equal(res.body.data.length, 0, 'the intent was untouched; only its company changed');
  });
});

describe('role search — payload', () => {
  test('leaks no private company or recruiter data', async () => {
    const company = await makeCompany('rs-published', {
      publicContact: { email: 'private@example.test', phone: '+91 80 4000 0000' },
    });
    await makeIntent(company._id, {
      title: 'Payload Check Role',
      interestQuestions: [{ prompt: 'Why do you want this job?', required: true }],
    });

    const { body } = await get('/api/public/roles?q=Payload%20Check%20Role');
    const raw = JSON.stringify(body);

    assert.equal(body.data.length, 1);
    assert.ok(!raw.includes('private@example.test'), 'no company contact email');
    assert.ok(!raw.includes('4000 0000'), 'no company contact phone');
    assert.ok(!raw.includes('Why do you want this job?'), 'no interest questions');
    assert.ok(!raw.includes('moderationStatus'), 'no moderation state');
    assert.ok(!('companyId' in body.data[0]), 'no raw company id');
  });

  test('compensation is withheld unless the company published it', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, {
      title: 'Hidden Pay Role',
      compensation: { min: 800000, max: 1200000, currency: 'INR', period: 'year', visibility: 'hidden' },
    });
    await makeIntent(company._id, {
      title: 'Open Pay Role',
      compensation: { min: 900000, max: 1400000, currency: 'INR', period: 'year', visibility: 'public' },
    });

    const hidden = await get('/api/public/roles?q=Hidden%20Pay%20Role');
    assert.equal(hidden.body.data[0].compensation, null);
    assert.ok(!JSON.stringify(hidden.body).includes('1200000'), 'the figures never leave the server');

    const open = await get('/api/public/roles?q=Open%20Pay%20Role');
    assert.equal(open.body.data[0].compensation.max, 1400000);
  });

  test('leads with the role, and carries the company as context', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, { title: 'Primary Title Role' });

    const { body } = await get('/api/public/roles?q=Primary%20Title%20Role');
    const role = body.data[0];

    assert.equal(role.title, 'Primary Title Role');
    /* Branding the card needs, and nothing more. */
    assert.deepEqual(Object.keys(role.company).sort(), [
      'educationServices',
      'initials',
      'location',
      'logoUrl',
      'name',
      'organizationType',
      'slug',
    ]);
  });

  test('a title-less intent still returns, so the client can head it by category', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, { title: undefined, roleCategories: ['teaching_assistant'] });

    const { body } = await get('/api/public/roles');
    const mine = body.data.filter((r) => r.company?.slug === 'rs-published');

    assert.equal(mine.length, 1);
    assert.equal(mine[0].title, null, 'never invented server-side (PRD §7.5)');
    assert.deepEqual(mine[0].roleCategories, ['teaching_assistant']);
  });
});

describe('role search — filters', () => {
  test('facets AND together, values within one facet OR', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, {
      title: 'Filter Physics Onsite',
      roleCategories: ['school_teacher'],
      specializations: { subjects: ['physics'] },
      deliveryModes: ['on_site'],
    });
    await makeIntent(company._id, {
      title: 'Filter Maths Remote',
      roleCategories: ['private_tutor'],
      specializations: { subjects: ['mathematics'] },
      deliveryModes: ['remote'],
    });

    const onlySlug = (body) => body.data.filter((r) => r.company?.slug === 'rs-published');

    /* One facet, two values — OR. */
    let res = await get('/api/public/roles?subject=physics&subject=mathematics');
    assert.equal(onlySlug(res.body).length, 2);

    /* Two facets — AND. Physics AND remote matches neither row. */
    res = await get('/api/public/roles?subject=physics&deliveryMode=remote');
    assert.equal(onlySlug(res.body).length, 0);

    res = await get('/api/public/roles?subject=physics&deliveryMode=on_site');
    assert.equal(onlySlug(res.body).length, 1);
    assert.equal(onlySlug(res.body)[0].title, 'Filter Physics Onsite');
  });

  test('maxYears keeps roles that state no requirement', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, { title: 'Needs Ten Years', minYears: 10 });
    await makeIntent(company._id, { title: 'Needs Nothing Stated', minYears: undefined });

    const { body } = await get('/api/public/roles?maxYears=2');
    const titles = body.data
      .filter((r) => r.company?.slug === 'rs-published')
      .map((r) => r.title)
      .sort();

    assert.deepEqual(titles, ['Needs Nothing Stated'], 'silence is not a requirement of 10 years');
  });

  test('region matches city or region, case-insensitively', async () => {
    const company = await makeCompany('rs-published');
    await makeIntent(company._id, {
      title: 'Region Match Role',
      locations: [{ country: 'IN', region: 'Karnataka', city: 'Bengaluru' }],
    });

    for (const query of ['bengaluru', 'BENGALURU', 'karnat']) {
      const { body } = await get(`/api/public/roles?region=${encodeURIComponent(query)}`);
      const mine = body.data.filter((r) => r.company?.slug === 'rs-published');
      assert.equal(mine.length, 1, `expected a match for "${query}"`);
    }
  });

  test('an unknown facet value is refused rather than ignored', async () => {
    const { status, body } = await get('/api/public/roles?roleCategory=not_a_category');
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  test('paginates', async () => {
    const company = await makeCompany('rs-published');
    for (let i = 0; i < 5; i += 1) {
      await makeIntent(company._id, { title: `Paged Role ${i}` });
    }

    const { body } = await get('/api/public/roles?limit=2&page=1');
    assert.equal(body.data.length, 2);
    assert.equal(body.meta.limit, 2);
    assert.ok(body.meta.total >= 5);
    assert.equal(body.meta.hasMore, true);
  });
});

describe('role facets', () => {
  test('counts only active intents at visible companies', async () => {
    const published = await makeCompany('rs-published');
    const draft = await makeCompany('rs-draft', { status: COMPANY_STATUS.DRAFT });

    await makeIntent(published._id, { roleCategories: ['school_teacher'] });
    await makeIntent(draft._id, { roleCategories: ['school_teacher'] });
    await makeIntent(published._id, {
      roleCategories: ['school_teacher'],
      status: HIRING_INTENT_STATUS.CLOSED,
    });

    const before = await get('/api/public/roles/facets');
    const counted = before.body.data.roleCategory.school_teacher ?? 0;

    /* Exactly one of the three qualifies; the other two are excluded for different reasons. */
    assert.ok(counted >= 1);

    const { body } = await get('/api/public/roles?roleCategory=school_teacher');
    const visible = body.data.filter((r) =>
      ['rs-published', 'rs-draft'].includes(r.company?.slug),
    );
    assert.equal(visible.length, 1, 'draft company and closed intent both excluded');
  });
});
