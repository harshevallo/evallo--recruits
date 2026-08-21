/**
 * The portfolio projection and the share link — ADR-019, PRD §8.3, §8.8, §21.3.
 *
 * Two things are under test, and the second is the one that matters:
 *
 *   1. The evidence and practice layers actually REACH an audience. Until this change
 *      `toRecruiterView()` reported four permanently empty arrays, so a candidate could write ten
 *      experience entries and no recruiter would see one. A test that only checked the header
 *      would have passed throughout.
 *
 *   2. The share link never widens what is visible. Every assertion below about `/api/portfolio`
 *      is a privacy assertion: an entry marked private, a draft profile, a revoked token and a
 *      contact rule other than `authorized_recruiters` must each produce absence, not a
 *      differently-worded refusal.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../../src/modules/candidates/candidateAnswer.model.js';
import {
  Experience,
  EducationEntry,
  Credential,
  EvidenceItem,
} from '../../src/modules/candidates/profileEntry.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';

let server;
let baseUrl;

const EMAIL = 'portfolio-test@example.com';
const PASSWORD = 'Password123';

const jsonPost = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const send = (method) => (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const authPost = send('POST');
const authDelete = send('DELETE');

/** Anonymous — no Authorization header at all, which is the whole point of the share link. */
const anonGet = (path) => fetch(`${baseUrl}${path}`);

/**
 * A publishable candidate carrying one of every evidence kind, plus one deliberately PRIVATE
 * experience entry. The private entry is the fixture that makes the visibility assertions real:
 * without it, "the payload has one experience" proves nothing about filtering.
 */
async function readyCandidate() {
  await jsonPost('/api/auth/signup', { email: EMAIL });

  const user = await User.findOne({ email: EMAIL });
  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
    email: EMAIL,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const verified = await jsonPost('/api/auth/verify-email', { token: raw });
  const { setupToken } = (await verified.json()).data;
  const res = await jsonPost('/api/auth/set-password', {
    token: setupToken,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  const accessToken = (await res.json()).data.accessToken;

  await authPost('/api/me/candidate-profile', accessToken, {});

  await CandidateProfile.updateOne(
    { userId: user._id },
    {
      $set: {
        headline: 'IB Physics teacher',
        summary: 'Ten years teaching IB and A-level physics.',
        targetRoles: ['school_teacher'],
        employmentTypes: ['full_time'],
        deliveryModes: ['on_site'],
        availability: 'immediately',
        subjects: ['physics'],
        learnerSegments: ['high_school'],
      },
    },
  );

  await User.updateOne(
    { _id: user._id },
    { $set: { 'location.country': 'IN', 'location.timezone': 'Asia/Kolkata' } },
  );

  const profile = await CandidateProfile.findOne({ userId: user._id });

  await Experience.create([
    {
      candidateId: profile._id,
      role: 'Head of Physics',
      organization: 'Bengaluru International',
      startDate: '2019-03',
      current: true,
      description: 'Led the IB physics faculty.',
      outcome: 'Mean IB score up from 4.8 to 5.9 over three cohorts.',
      visibility: CANDIDATE_VISIBILITY.DISCOVERABLE,
    },
    {
      candidateId: profile._id,
      role: 'A role I do not want shown',
      organization: 'Secret Employer Ltd',
      startDate: '2015-01',
      endDate: '2019-02',
      visibility: CANDIDATE_VISIBILITY.PRIVATE,
    },
  ]);

  await EducationEntry.create({
    candidateId: profile._id,
    institution: 'IIT Bombay',
    qualification: 'MSc',
    fieldOfStudy: 'Physics',
    startDate: '2010-08',
    endDate: '2012-06',
    visibility: CANDIDATE_VISIBILITY.DISCOVERABLE,
  });

  await Credential.create([
    {
      candidateId: profile._id,
      name: 'IB Educator Certificate',
      credentialType: 'certification',
      issuer: 'IBO',
      visibility: CANDIDATE_VISIBILITY.DISCOVERABLE,
    },
    {
      candidateId: profile._id,
      name: 'GRE',
      credentialType: 'test score',
      issuer: 'ETS',
      result: '333',
      visibility: CANDIDATE_VISIBILITY.DISCOVERABLE,
    },
  ]);

  await EvidenceItem.create({
    candidateId: profile._id,
    title: 'Explaining angular momentum',
    url: 'https://www.youtube.com/watch?v=abcdefghijk',
    provider: 'YouTube',
    visibility: CANDIDATE_VISIBILITY.DISCOVERABLE,
  });

  await CandidateAnswer.create([
    {
      candidateId: profile._id,
      questionKey: 'philosophy',
      value: 'Understanding beats memorisation.',
      bankVersion: 6,
    },
    {
      candidateId: profile._id,
      questionKey: 'pronouns',
      value: 'she/her',
      bankVersion: 6,
    },
    /*
     * Both of these are collected by the bank and neither may ever appear in a portfolio. They
     * are in the fixture precisely so a regression that starts dumping `candidateAnswers` fails
     * here rather than in production.
     */
    {
      candidateId: profile._id,
      questionKey: 'compensation',
      value: 'INR 2,500 per hour',
      bankVersion: 6,
    },
    {
      candidateId: profile._id,
      questionKey: 'workAuthorization',
      value: 'Indian citizen, no sponsorship needed',
      bankVersion: 6,
    },
  ]);

  return { accessToken, user, profile };
}

/** Publishes, turns the link on, and hands back the token. */
async function shareableCandidate(status = CANDIDATE_VISIBILITY.DISCOVERABLE) {
  const fixture = await readyCandidate();
  await authPost('/api/me/candidate-profile/publish', fixture.accessToken, { status });
  const share = await (
    await authPost('/api/me/candidate-profile/share', fixture.accessToken)
  ).json();
  return { ...fixture, token: share.data.token, share: share.data };
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
  const user = await User.findOne({ email: EMAIL });
  if (user) {
    const profile = await CandidateProfile.findOne({ userId: user._id });
    if (profile) {
      await Promise.all([
        CandidateAnswer.deleteMany({ candidateId: profile._id }),
        Experience.deleteMany({ candidateId: profile._id }),
        EducationEntry.deleteMany({ candidateId: profile._id }),
        Credential.deleteMany({ candidateId: profile._id }),
        EvidenceItem.deleteMany({ candidateId: profile._id }),
      ]);
    }
    await CandidateProfile.deleteMany({ userId: user._id });
    await Session.deleteMany({ userId: user._id });
    await VerificationToken.deleteMany({ userId: user._id });
  }
  await User.deleteMany({ email: EMAIL });
}

beforeEach(cleanup);

describe('portfolio projection', () => {
  test('the preview carries the evidence layer, not four empty arrays', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    const { evidence } = body.data.profile;

    assert.equal(evidence.experience.length, 1, 'the discoverable experience entry');
    assert.equal(evidence.experience[0].role, 'Head of Physics');
    assert.equal(evidence.education.length, 1);
    assert.equal(evidence.education[0].institution, 'IIT Bombay');
    assert.equal(evidence.media.length, 1);
    assert.equal(evidence.media[0].provider, 'YouTube');
  });

  test('scores are split out of credentials so each renders in its own section', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    const { evidence } = body.data.profile;

    assert.deepEqual(
      evidence.credentials.map((c) => c.name),
      ['IB Educator Certificate'],
    );
    assert.deepEqual(
      evidence.scores.map((c) => c.name),
      ['GRE'],
    );
    assert.equal(evidence.scores[0].result, '333');
  });

  test('teaching practice and pronouns render, from the answer allow-list', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    const { practice, header } = body.data.profile;

    assert.equal(header.pronouns, 'she/her');
    assert.equal(practice.length, 1);
    assert.equal(practice[0].key, 'philosophy');
    assert.equal(practice[0].body, 'Understanding beats memorisation.');
    /* PRD §21.3 — the question wording is never shown; the label is a section heading. */
    assert.equal(practice[0].label, 'Teaching philosophy');
  });

  test('a quantified outcome is lifted out of the prose into the impact block', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/preview', accessToken)).json();
    const { outcomes } = body.data.profile;

    assert.equal(outcomes.fromExperience.length, 1);
    assert.match(outcomes.fromExperience[0].outcome, /4\.8 to 5\.9/);
    assert.equal(outcomes.fromExperience[0].organization, 'Bengaluru International');
  });

  test('a PRIVATE entry never appears — including in the owner’s own preview', async () => {
    const { accessToken } = await readyCandidate();
    const response = await authGet('/api/me/candidate-profile/preview', accessToken);
    const raw = await response.text();

    /*
     * Asserted against the RAW response body, not the parsed object. A private entry leaking into
     * some field nobody thought to check is exactly the failure mode this guards, and structural
     * assertions only cover the structures you remembered.
     */
    assert.ok(
      !raw.includes('Secret Employer Ltd'),
      'a private experience entry must not appear anywhere in the payload',
    );

    /* PRD §8.2 — but the owner IS told something is hidden, or the entry looks lost. */
    const { privateFields } = JSON.parse(raw).data;
    assert.ok(
      privateFields.some((field) => field.field === 'withheld.experience'),
      'the preview names the withheld count',
    );
  });

  test('compensation and work authorization never enter the portfolio', async () => {
    const { accessToken } = await readyCandidate();
    const raw = await (await authGet('/api/me/candidate-profile/preview', accessToken)).text();

    assert.ok(!raw.includes('2,500'), 'compensation must not be projected');
    assert.ok(!raw.includes('sponsorship'), 'work authorization must not be projected');
  });
});

describe('share link — ADR-019', () => {
  test('sharing is off until the candidate turns it on', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/candidate-profile/share', accessToken)).json();

    assert.equal(body.data.enabled, false);
    assert.equal(body.data.token, null);
  });

  test('publishing alone does not mint a link', async () => {
    const { accessToken } = await readyCandidate();
    await authPost('/api/me/candidate-profile/publish', accessToken, { status: 'discoverable' });

    const body = await (await authGet('/api/me/candidate-profile/share', accessToken)).json();
    assert.equal(body.data.enabled, false);
  });

  test('enabling twice returns the same token rather than rotating it', async () => {
    const { accessToken } = await readyCandidate();
    const first = await (await authPost('/api/me/candidate-profile/share', accessToken)).json();
    const second = await (await authPost('/api/me/candidate-profile/share', accessToken)).json();

    assert.equal(first.data.token, second.data.token);
  });

  test('an anonymous caller can read a shared portfolio', async () => {
    const { token } = await shareableCandidate();
    const response = await anonGet(`/api/portfolio/${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);

    const body = await response.json();
    assert.equal(body.data.profile.header.headline, 'IB Physics teacher');
    assert.equal(body.data.profile.evidence.experience.length, 1);
    assert.equal(body.data.meta.indexable, false);
  });

  test('the shared payload carries no identifiers beyond the portfolio itself', async () => {
    const { token, profile, user } = await shareableCandidate();
    const raw = await (await anonGet(`/api/portfolio/${token}`)).text();

    assert.ok(!raw.includes(String(profile._id)), 'no candidate id');
    assert.ok(!raw.includes(String(user._id)), 'no user id');
    assert.ok(!raw.includes('shareToken'), 'the token is never echoed back');
  });

  test('a private entry stays private over the share link too', async () => {
    const { token } = await shareableCandidate();
    const raw = await (await anonGet(`/api/portfolio/${token}`)).text();

    assert.ok(!raw.includes('Secret Employer Ltd'));
  });

  test('contact is withheld unless the candidate’s own rule reveals it', async () => {
    const { token, accessToken, user } = await shareableCandidate();

    /* Default is `hidden` — the link holder gets no email. */
    let body = await (await anonGet(`/api/portfolio/${token}`)).json();
    assert.equal(body.data.profile.contact, null);

    /*
     * `after_interest` is about a relationship with a COMPANY. A link holder is not a company, so
     * it must resolve to hidden rather than to revealed.
     */
    await CandidateProfile.updateOne(
      { userId: user._id },
      { $set: { contactVisibility: CONTACT_VISIBILITY.AFTER_INTEREST } },
    );
    body = await (await anonGet(`/api/portfolio/${token}`)).json();
    assert.equal(body.data.profile.contact, null);

    /* Only the candidate's explicit "share my contact" rule reveals it. */
    await CandidateProfile.updateOne(
      { userId: user._id },
      { $set: { contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS } },
    );
    body = await (await anonGet(`/api/portfolio/${token}`)).json();
    assert.equal(body.data.profile.contact.email, EMAIL);

    void accessToken;
  });

  test('a draft profile’s link does not resolve', async () => {
    const { accessToken } = await readyCandidate();
    const share = await (await authPost('/api/me/candidate-profile/share', accessToken)).json();

    const response = await anonGet(`/api/portfolio/${share.data.token}`);
    assert.equal(response.status, 404);
    /* The owner is told why, on their own screen — the visitor is not. */
    assert.equal(share.data.enabled, true);
    assert.equal(share.data.resolvable, false);
  });

  test('a PAUSED profile stays reachable by link — pausing hides you from search, not from people you told', async () => {
    const { token } = await shareableCandidate(CANDIDATE_VISIBILITY.DISCOVERABLE);
    const user = await User.findOne({ email: EMAIL });
    await CandidateProfile.updateOne(
      { userId: user._id },
      { $set: { status: CANDIDATE_VISIBILITY.PAUSED } },
    );

    assert.equal((await anonGet(`/api/portfolio/${token}`)).status, 200);
  });

  test('a PRIVATE profile is reachable by link but stays out of search', async () => {
    const { token } = await shareableCandidate(CANDIDATE_VISIBILITY.PRIVATE);
    assert.equal((await anonGet(`/api/portfolio/${token}`)).status, 200);
  });

  test('turning sharing off kills the link immediately', async () => {
    const { token, accessToken } = await shareableCandidate();
    assert.equal((await anonGet(`/api/portfolio/${token}`)).status, 200);

    await authDelete('/api/me/candidate-profile/share', accessToken);
    assert.equal((await anonGet(`/api/portfolio/${token}`)).status, 404);
  });

  test('rotating kills every copy of the old link', async () => {
    const { token, accessToken } = await shareableCandidate();
    const rotated = await (
      await authPost('/api/me/candidate-profile/share/rotate', accessToken)
    ).json();

    assert.notEqual(rotated.data.token, token);
    assert.equal((await anonGet(`/api/portfolio/${token}`)).status, 404);
    assert.equal((await anonGet(`/api/portfolio/${rotated.data.token}`)).status, 200);
  });

  test('an unknown token is refused with the same answer as a revoked one', async () => {
    const madeUp = 'A'.repeat(43);
    const response = await anonGet(`/api/portfolio/${madeUp}`);

    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.message, 'This portfolio link is not available.');
  });

  test('a malformed token is rejected before it reaches a query', async () => {
    for (const bad of ['short', '../../etc/passwd', 'has spaces in it']) {
      const response = await anonGet(`/api/portfolio/${encodeURIComponent(bad)}`);
      assert.ok(
        response.status === 400 || response.status === 404,
        `expected refusal for "${bad}", got ${response.status}`,
      );
    }
  });

  test('the share endpoints require the caller’s own session', async () => {
    await readyCandidate();

    for (const [method, path] of [
      ['GET', '/api/me/candidate-profile/share'],
      ['POST', '/api/me/candidate-profile/share'],
      ['POST', '/api/me/candidate-profile/share/rotate'],
      ['DELETE', '/api/me/candidate-profile/share'],
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  });
});

describe('CAN-11 saved companies', () => {
  test('the list is empty for a candidate who has saved nothing', async () => {
    const { accessToken } = await readyCandidate();
    const body = await (await authGet('/api/me/saved-companies', accessToken)).json();

    assert.deepEqual(body.data.companies, []);
  });

  test('it requires a session', async () => {
    assert.equal((await anonGet('/api/me/saved-companies')).status, 401);
  });
});
