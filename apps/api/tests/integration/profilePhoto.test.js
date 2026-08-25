/**
 * Profile photo upload — `POST/DELETE /api/me/photo` and `GET /api/media/:id` (ADR-020).
 *
 * Two groups matter more than the rest. The **sniffing** tests are the security boundary: a
 * declared `Content-Type` is attacker-controlled, so the tests that send a lie and expect a refusal
 * are what prove the server does not believe it. The **replacement** test is the storage boundary:
 * bytes live in MongoDB, and the whole argument for that is that the collection grows with people
 * rather than with uploads — an assertion, not an aspiration.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { MediaAsset } from '../../src/modules/media/mediaAsset.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { generateVerificationToken } from '../../src/lib/tokens.js';

let server;
let baseUrl;
let user;
let token;

const EMAIL = 'photo-test@example.test';
const PASSWORD = 'Password123';

const jsonPost = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

/** The real sign-up path, so the token under test is one the API actually issues. */
async function onboard(email) {
  await jsonPost('/api/auth/signup', { email });

  const created = await User.findOne({ email });
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: created._id,
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

  return { accessToken: (await res.json()).data.accessToken, user: created };
}

/* ── Fixtures: the smallest byte sequences that are genuinely these formats ─────────────────── */

/** A 1×1 PNG. Real file, real signature. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

/** A minimal JPEG (SOI + APP0 + EOI). */
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0'),
  Buffer.alloc(16),
  Buffer.from([0xff, 0xd9]),
]);

/** A RIFF/WEBP container. */
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(18),
]);

/** Not an image. An ELF header, which is what an actual malicious upload would look like. */
const ELF = Buffer.concat([Buffer.from([0x7f]), Buffer.from('ELF'), Buffer.alloc(32)]);

const post = async (body, contentType = 'image/png') =>
  fetch(`${baseUrl}/api/me/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
  });

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
  const existing = await User.findOne({ email: EMAIL }).select('_id').lean();
  if (existing) {
    await MediaAsset.deleteMany({ ownerUserId: existing._id });
    await VerificationToken.deleteMany({ userId: existing._id });
  }
  await User.deleteMany({ email: EMAIL });
}

beforeEach(async () => {
  await cleanup();
  const onboarded = await onboard(EMAIL);
  user = onboarded.user;
  token = onboarded.accessToken;
});

describe('photo upload — the happy path', () => {
  test('stores the bytes and points profilePicture at them', async () => {
    const response = await post(PNG);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.success, true);

    const url = body.data.user.profilePicture;
    assert.match(url, /\/api\/media\/[a-f0-9]{24}\?v=\d+/, 'absolute URL with a cache-buster');

    const asset = await MediaAsset.findOne({ ownerUserId: user._id }).select('+data').lean();
    assert.equal(asset.contentType, 'image/png');
    assert.equal(asset.byteLength, PNG.length);
    assert.ok(Buffer.from(asset.data.buffer).equals(PNG), 'the bytes round-trip unchanged');
  });

  test('accepts JPEG and WebP too', async () => {
    for (const [buffer, expected] of [
      [JPEG, 'image/jpeg'],
      [WEBP, 'image/webp'],
    ]) {
      const response = await post(buffer, 'application/octet-stream');
      assert.equal(response.status, 200, `${expected} should be accepted`);

      const asset = await MediaAsset.findOne({ ownerUserId: user._id }).lean();
      assert.equal(asset.contentType, expected);
    }
  });

  test('serves the bytes back with the sniffed type', async () => {
    const url = (await (await post(PNG)).json()).data.user.profilePicture;

    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

    /* Never indexable, never held by a shared cache. */
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.match(response.headers.get('cache-control'), /private/);

    /*
     * The header that broke production.
     *
     * `helmet` sets `same-site` globally. The web app and this API are on different registrable
     * domains (`*.vercel.app` and `onrender.com`), so `same-site` made the browser refuse to render
     * the image while the request still returned 200 — a broken-image glyph with a clean server log.
     *
     * This assertion has to be here rather than left to manual checking, because the failure is
     * invisible locally: `localhost:3001` and `localhost:8081` differ only by port, which CORP does
     * not consider, so they are the same site and the image loads either way.
     */
    assert.equal(
      response.headers.get('cross-origin-resource-policy'),
      'cross-origin',
      'must override the global same-site policy, or the image cannot render cross-site',
    );

    const served = Buffer.from(await response.arrayBuffer());
    assert.ok(served.equals(PNG));
  });
});

describe('photo upload — the content type is never believed', () => {
  test('a non-image sent as image/png is refused', async () => {
    const response = await post(ELF, 'image/png');
    assert.equal(response.status, 400, 'the header said PNG; the bytes did not');

    const stored = await MediaAsset.countDocuments({ ownerUserId: user._id });
    assert.equal(stored, 0, 'nothing was written');
  });

  test('the STORED type comes from the bytes, not the header', async () => {
    /* A real JPEG mislabelled as PNG. Accepted — it is an image — but stored as what it is. */
    await post(JPEG, 'image/png');

    const asset = await MediaAsset.findOne({ ownerUserId: user._id }).lean();
    assert.equal(asset.contentType, 'image/jpeg', 'the sniff overrode the header');
  });

  test('an empty body is refused', async () => {
    const response = await post(Buffer.alloc(0));
    assert.equal(response.status, 400);
  });

  test('a body too short to have a signature is refused, not crashed', async () => {
    const response = await post(Buffer.from([0xff, 0xd8]));
    assert.equal(response.status, 400);
  });

  test('an oversized body reads as a validation error, not a server fault', async () => {
    /* 3 MB of valid PNG prefix — past the 2 MB parser ceiling. */
    const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const response = await post(huge);

    assert.equal(response.status, 400, 'body-parser rejects before the handler; must not be a 500');
    const body = await response.json();
    assert.equal(body.success, false);
    assert.ok(body.error.details?.photo, 'the message names the field the user can act on');
  });
});

describe('photo upload — replacement and removal', () => {
  test('replacing leaves exactly one document', async () => {
    await post(PNG);
    const first = await MediaAsset.findOne({ ownerUserId: user._id }).lean();

    await post(JPEG, 'image/jpeg');
    await post(WEBP, 'image/webp');

    const all = await MediaAsset.find({ ownerUserId: user._id }).lean();
    assert.equal(all.length, 1, 'the collection grows with people, not with uploads');
    assert.equal(String(all[0]._id), String(first._id), 'and reuses the same id');
    assert.equal(all[0].contentType, 'image/webp', 'holding the newest bytes');
  });

  test('the cache-buster changes on replacement, so a browser sees the new photo', async () => {
    const before = (await (await post(PNG)).json()).data.user.profilePicture;
    await new Promise((r) => setTimeout(r, 5));
    const after = (await (await post(JPEG, 'image/jpeg')).json()).data.user.profilePicture;

    assert.notEqual(before, after, 'the URL must differ or the old image stays on screen');
    assert.equal(before.split('?')[0], after.split('?')[0], 'while the id is unchanged');
  });

  test('delete removes the asset and clears the pointer', async () => {
    await post(PNG);

    const response = await fetch(`${baseUrl}/api/me/photo`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);

    assert.equal(await MediaAsset.countDocuments({ ownerUserId: user._id }), 0);
    const fresh = await User.findById(user._id).lean();
    assert.ok(!fresh.profilePicture, 'the pointer went with the bytes');
  });

  test('deleting twice is not an error', async () => {
    await post(PNG);
    const opts = { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } };
    assert.equal((await fetch(`${baseUrl}/api/me/photo`, opts)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/me/photo`, opts)).status, 200);
  });

  test('delete leaves an EXTERNAL picture alone', async () => {
    /* A Google avatar is not ours to remove; blanking it would discard the only photo they have. */
    const external = 'https://lh3.googleusercontent.com/a/example';
    await User.updateOne({ _id: user._id }, { $set: { profilePicture: external } });

    await fetch(`${baseUrl}/api/me/photo`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.profilePicture, external);
  });
});

describe('photo upload — authorization', () => {
  test('uploading requires a session', async () => {
    const response = await fetch(`${baseUrl}/api/me/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: PNG,
    });
    assert.equal(response.status, 401);
  });

  test('a malformed asset id is a 404, not a 500', async () => {
    const response = await fetch(`${baseUrl}/api/media/not-an-object-id`);
    assert.equal(response.status, 404);
  });

  test('an unknown asset id is a 404', async () => {
    const response = await fetch(`${baseUrl}/api/media/000000000000000000000000`);
    assert.equal(response.status, 404);
  });

  test('profilePicture can no longer be set by PATCH /api/me', async () => {
    /*
     * Removed from the update allowlist when upload shipped. It renders as an `<img src>` on
     * recruiter screens, so an arbitrary URL there is an arbitrary third-party fetch from someone
     * else's browser.
     */
    const response = await fetch(`${baseUrl}/api/me`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', profilePicture: 'https://evil.test/tracker.gif' }),
    });

    assert.equal(response.status, 200, 'the unknown key is stripped, not an error');

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.name, 'Renamed', 'the legitimate field still saved');
    assert.ok(!fresh.profilePicture, 'the URL was never written');
  });
});
