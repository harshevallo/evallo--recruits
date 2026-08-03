/**
 * Scaffold smoke test.
 *
 * Verifies the response envelope and the error handler are wired correctly — the two pieces
 * every later route depends on. Under ADR-002 tests substitute for the compiler, so route-level
 * integration tests are mandatory rather than optional (13_BACKLOG.md T-02).
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';

let server;
let baseUrl;

before(async () => {
  await connectDatabase();
  const app = createApp();
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

describe('GET /api/health', () => {
  test('returns the success envelope with database status', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.database.status, 'connected');
  });
});

describe('unknown routes', () => {
  test('return the error envelope, not an Express HTML page', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
