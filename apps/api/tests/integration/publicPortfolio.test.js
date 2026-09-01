/**
 * The public candidate portfolio — `GET /api/candidates/:slug` (Phase 3C).
 *
 * ── What is actually being pinned ─────────────────────────────────────────────────────────────
 *
 * This is the first endpoint in the product that serves candidate data to an anonymous stranger by
 * a guessable address. Everything else that reaches candidate data is either authenticated or
 * behind a 256-bit secret. So the exclusion tests below are not defensive padding — each one names
 * a field that a recruiter legitimately sees and the internet must not, and each would pass
 * silently if someone later swapped `toPublicView` for `toRecruiterView`.
 *
 * The two halves:
 *
 *   1. **Only `public` is readable.** Every other state answers with the same 404, including
 *      `discoverable` — those candidates agreed to authenticated recruiters, not to the internet.
 *   2. **The payload is a subset.** No contact, no documents, no scores, no media, no city, no
 *      visibility state, nothing about companies or applications.
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import {
  Experience,
  EducationEntry,
  Credential,
  EvidenceItem,
} from '../../src/modules/candidates/profileEntry.model.js';

let server;
let baseUrl;
let profile;

const EMAIL = 'public-portfolio@example.test';
const PHONE = '+91 98765 43210';
const CITY = 'Bengaluru';
const SLUG = 'pp-test-educator';
const DOCUMENT_URL = 'https://example.test/my-teaching-certificate.pdf';
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, headers: response.headers, body: await response.json() };
};

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
  const user = await User.findOne({ email: EMAIL }).select('_id').lean();
  if (user) {
    const owned = await CandidateProfile.find({ userId: user._id }).select('_id').lean();
    const ids = owned.map((p) => p._id);
    await Promise.all([
      Experience.deleteMany({ candidateId: { $in: ids } }),
      EducationEntry.deleteMany({ candidateId: { $in: ids } }),
      Credential.deleteMany({ candidateId: { $in: ids } }),
      EvidenceItem.deleteMany({ candidateId: { $in: ids } }),
    ]);
    await CandidateProfile.deleteMany({ userId: user._id });
  }
  await User.deleteMany({ email: EMAIL });
}

/** Sets the visibility state without going through the API. */
const setStatus = (status) =>
  CandidateProfile.updateOne({ _id: profile._id }, { $set: { status } });

/*
 * A candidate carrying one of everything a recruiter may see.
 *
 * The point is that each field below EXISTS and is visible to a recruiter — otherwise the
 * exclusion assertions would pass by accident on an empty profile, which is the failure mode that
 * makes a privacy test worthless.
 */
beforeEach(async () => {
  await cleanup();

  const user = await User.create({
    email: EMAIL,
    name: 'Priya Public',
    emailVerified: true,
    phone: PHONE,
    location: { country: 'IN', region: 'Karnataka', city: CITY, timezone: 'Asia/Kolkata' },
    languages: ['en', 'hi'],
  });

  profile = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.PUBLIC,
    publicSlug: SLUG,
    headline: 'IB Physics teacher',
    summary: 'Twelve years teaching secondary physics.',
    subjects: ['physics'],
    targetRoles: ['school_teacher'],
    yearsExperience: 12,
    /* The setting that must NOT become public consent. */
    contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
  });

  await Experience.create({
    candidateId: profile._id,
    role: 'Physics Teacher',
    organization: 'Northgate Academy',
    startDate: '2018-01',
    current: true,
    outcome: 'Average grade up one band across two cohorts.',
  });
  await EducationEntry.create({
    candidateId: profile._id,
    institution: 'Delhi University',
    qualification: 'BSc Physics',
    startDate: '2010-06',
    endDate: '2013-06',
  });
  await Credential.create({
    candidateId: profile._id,
    name: 'State Teaching Licence',
    credentialType: 'licence',
    issuer: 'Karnataka Board',
    documentUrl: DOCUMENT_URL,
  });
  /* `credentialType` matching /score|test|exam|assessment/ + a result makes this a SCORE. */
  await Credential.create({
    candidateId: profile._id,
    name: 'Subject Knowledge Test',
    credentialType: 'assessment',
    issuer: 'Evallo',
    result: '82%',
  });
  await EvidenceItem.create({
    candidateId: profile._id,
    title: 'Explaining projectile motion',
    url: VIDEO_URL,
    provider: 'youtube',
  });
});

describe('only PUBLIC is readable anonymously', () => {
  test('PUBLIC: an anonymous request succeeds', async () => {
    const { status, body } = await get(`/api/candidates/${SLUG}`);
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.profile.header.name, 'Priya Public');
  });

  for (const [label, state] of [
    ['PRIVATE', CANDIDATE_VISIBILITY.PRIVATE],
    ['DISCOVERABLE', CANDIDATE_VISIBILITY.DISCOVERABLE],
    ['PAUSED', CANDIDATE_VISIBILITY.PAUSED],
    ['ARCHIVED', CANDIDATE_VISIBILITY.ARCHIVED],
    ['DRAFT', CANDIDATE_VISIBILITY.DRAFT],
  ]) {
    test(`${label}: an anonymous request is refused`, async () => {
      await setStatus(state);

      const { status, body } = await get(`/api/candidates/${SLUG}`);
      assert.equal(status, 404, `${label} must not be publicly readable`);
      assert.equal(body.success, false);
      /* Identical to a slug that does not exist — no oracle. */
      assert.match(body.error.message, /No public portfolio at that address/);
    });
  }

  test('DISCOVERABLE is refused even though it is the closest state', async () => {
    /*
     * Called out separately because it is the one a careless implementation would allow. Everyone
     * on `discoverable` chose it when it meant "authenticated recruiters"; serving them here would
     * publish people who never agreed to it.
     */
    await setStatus(CANDIDATE_VISIBILITY.DISCOVERABLE);
    assert.equal((await get(`/api/candidates/${SLUG}`)).status, 404);
  });

  test('an unknown slug and a private candidate are indistinguishable', async () => {
    await setStatus(CANDIDATE_VISIBILITY.PRIVATE);
    const hidden = await get(`/api/candidates/${SLUG}`);
    const missing = await get('/api/candidates/no-such-educator-at-all');

    assert.equal(hidden.status, missing.status);
    assert.deepEqual(hidden.body, missing.body, 'the refusals must be byte-identical');
  });

  test('a malformed slug is rejected without reaching the database', async () => {
    const { status } = await get('/api/candidates/Not__A__Slug');
    assert.equal(status, 400);
  });
});

describe('the public payload is a strict subset', () => {
  test('carries the approved fields', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    const { header, expertise, evidence } = body.data.profile;

    assert.equal(header.name, 'Priya Public');
    assert.equal(header.headline, 'IB Physics teacher');
    assert.equal(header.yearsExperience, 12);
    assert.deepEqual(header.languages, ['en', 'hi']);
    assert.deepEqual(header.targetRoles, ['school_teacher']);
    assert.equal(body.data.profile.introduction, 'Twelve years teaching secondary physics.');
    assert.deepEqual(expertise.subjects, ['physics']);

    /* Country and region are approved; the city is not (asserted below). */
    assert.equal(header.location.country, 'IN');
    assert.equal(header.location.region, 'Karnataka');
    assert.equal(header.location.timezone, 'Asia/Kolkata');

    assert.equal(evidence.experience.length, 1, 'experience is public');
    assert.equal(evidence.education.length, 1, 'education is public');
    assert.equal(evidence.credentials.length, 1, 'credential METADATA is public');
    assert.equal(evidence.credentials[0].name, 'State Teaching Licence');
  });

  /*
   * Each of the following exists on this profile and IS visible to a recruiter. That is what makes
   * these assertions meaningful rather than vacuous.
   */
  test('NEVER contains the candidate email — even under `authorized_recruiters`', async () => {
    assert.equal(
      profile.contactVisibility,
      CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS,
      'the fixture must be the permissive setting, or this test proves nothing',
    );

    const { body } = await get(`/api/candidates/${SLUG}`);
    const raw = JSON.stringify(body);

    assert.equal(body.data.profile.contact, undefined, '`contact` must be absent, not null');
    assert.ok(!('contact' in body.data.profile), 'the key itself must not exist');
    assert.ok(!raw.includes(EMAIL), 'the address must appear nowhere in the payload');
    assert.ok(!raw.includes('example.test'), 'nor any fragment of it');
  });

  test('NEVER contains the candidate phone', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(PHONE));
    assert.ok(!raw.includes('98765'), 'not even a fragment');
  });

  test('does NOT contain the city', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    assert.equal(body.data.profile.header.location.city, undefined);
    assert.ok(!JSON.stringify(body).includes(CITY), 'Bengaluru must not appear anywhere');
  });

  test('does NOT contain documentUrl', async () => {
    const stored = await Credential.findOne({ candidateId: profile._id, documentUrl: DOCUMENT_URL });
    assert.ok(stored, 'the fixture must actually have a document');

    const { body } = await get(`/api/candidates/${SLUG}`);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(DOCUMENT_URL));
    assert.ok(!raw.includes('documentUrl'), 'not even the key');
  });

  test('does NOT contain assessment scores', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    assert.deepEqual(body.data.profile.evidence.scores, [], 'scores are opt-in, not default');
    assert.ok(!JSON.stringify(body).includes('82%'), 'the result must not leak via another path');
    assert.ok(!JSON.stringify(body).includes('Subject Knowledge Test'));
  });

  test('does NOT contain media or video URLs', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    const raw = JSON.stringify(body);
    assert.deepEqual(body.data.profile.evidence.media, []);
    assert.ok(!raw.includes(VIDEO_URL), 'an unlisted video must not be surfaced');
    assert.ok(!raw.includes('Explaining projectile motion'), 'nor its title');
  });

  test('does NOT contain the visibility status', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    assert.equal(body.data.profile.header.status, undefined);
    assert.ok(!JSON.stringify(body).includes('"status"'));
  });

  test('does NOT contain recruiter, interest, pipeline or internal fields', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    const raw = JSON.stringify(body).toLowerCase();

    for (const forbidden of [
      'companyid',
      'interest',
      'pipeline',
      'accessgrant',
      'note',
      'conversation',
      'message',
      'verificationstatus',
      'moderation',
      'userid',
      'blockedcompany',
      'sharetoken',
      'compensation',
      'workauthorization',
      'withheld',
    ]) {
      assert.ok(!raw.includes(forbidden), `"${forbidden}" must not appear in a public payload`);
    }
  });

  test('exposes no identifier beyond the slug', async () => {
    const { body } = await get(`/api/candidates/${SLUG}`);
    assert.deepEqual(Object.keys(body.data.meta).sort(), ['indexable', 'slug', 'updatedAt']);
    assert.equal(body.data.meta.slug, SLUG);
    assert.equal(body.data.meta.indexable, false, 'indexing is a later, separate decision');
  });

  test('is not indexable and not privately cached', async () => {
    const { headers } = await get(`/api/candidates/${SLUG}`);
    assert.match(headers.get('x-robots-tag'), /noindex/);
    assert.match(headers.get('cache-control'), /public/);
  });
});
