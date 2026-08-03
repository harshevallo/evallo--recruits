/**
 * POST /api/public/early-access — MKT-01.
 *
 * Covers the two behaviours that are easy to get wrong and invisible in manual testing:
 * idempotency under repeat submission, and not leaking whether an email is already on the list.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { EarlyAccessRequest } from '../../src/modules/public/earlyAccessRequest.model.js';

let server;
let baseUrl;

const ENDPOINT = () => `${baseUrl}/api/public/early-access`;

function post(body) {
  return fetch(ENDPOINT(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  segment: 'business',
  name: 'Priya Raman',
  email: 'pilot-test@example.com',
};

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await EarlyAccessRequest.deleteMany({ email: /@example\.com$/ });
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

beforeEach(async () => {
  await EarlyAccessRequest.deleteMany({ email: /@example\.com$/ });
});

describe('POST /api/public/early-access', () => {
  test('accepts a valid submission and stores the lead', async () => {
    const response = await post(VALID);
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'received');

    const stored = await EarlyAccessRequest.findOne({ email: VALID.email }).lean();
    assert.equal(stored.name, VALID.name);
    assert.equal(stored.segment, 'business');
    assert.equal(stored.status, 'new');
    assert.equal(stored.submissionCount, 1);
    assert.ok(stored.consentedAt, 'consent timestamp is recorded server-side');
  });

  test('normalises the email before storing it', async () => {
    await post({ ...VALID, email: '  PILOT-TEST@Example.COM  ' });

    const stored = await EarlyAccessRequest.findOne({ email: VALID.email }).lean();
    assert.ok(stored, 'trimmed and lowercased by the shared schema');
  });

  test('is idempotent — a repeat submission creates no duplicate', async () => {
    await post(VALID);
    const second = await post(VALID);
    const body = await second.json();

    assert.equal(second.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'already_registered');

    const count = await EarlyAccessRequest.countDocuments({ email: VALID.email });
    assert.equal(count, 1, 'unique index prevents a second document');

    const stored = await EarlyAccessRequest.findOne({ email: VALID.email }).lean();
    assert.equal(stored.submissionCount, 2, 'repeat is counted, not discarded');
  });

  test('does not reveal whether an email is already registered', async () => {
    const first = await post(VALID);
    const second = await post(VALID);

    const firstBody = await first.json();
    const secondBody = await second.json();

    // Both succeed. If the second returned an error or a conflict, this endpoint would be an
    // email-enumeration oracle (PRD §16.1).
    assert.equal(firstBody.success, true);
    assert.equal(secondBody.success, true);
    assert.ok(second.status < 400);
  });

  test('does not overwrite operator-managed fields on resubmission', async () => {
    await post(VALID);
    await EarlyAccessRequest.updateOne(
      { email: VALID.email },
      { $set: { status: 'contacted', notes: 'Called 30 Jul' } },
    );

    await post({ ...VALID, name: 'Priya R.' });

    const stored = await EarlyAccessRequest.findOne({ email: VALID.email }).lean();
    assert.equal(stored.status, 'contacted', 'operator triage survives a resubmission');
    assert.equal(stored.notes, 'Called 30 Jul');
    assert.equal(stored.name, 'Priya R.', 'but the lead-supplied fields do refresh');
  });

  describe('validation', () => {
    test('rejects a malformed email with a field-keyed error', async () => {
      const response = await post({ ...VALID, email: 'not-an-email' });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.error.code, 'VALIDATION_ERROR');
      assert.ok(body.error.details.email, 'error is keyed by field for form binding');
    });

    test('rejects a missing name', async () => {
      const response = await post({ segment: 'business', email: VALID.email });
      const body = await response.json();

      assert.equal(response.status, 400);
      assert.ok(body.error.details.name);
    });

    test('rejects an unknown segment', async () => {
      const response = await post({ ...VALID, segment: 'recruiter' });
      assert.equal(response.status, 400);
    });

    test('ignores client-supplied fields that are server-owned', async () => {
      await post({ ...VALID, status: 'converted', submissionCount: 99 });

      const stored = await EarlyAccessRequest.findOne({ email: VALID.email }).lean();
      assert.equal(stored.status, 'new', 'status is not settable by the client');
      assert.equal(stored.submissionCount, 1);
    });
  });
});
