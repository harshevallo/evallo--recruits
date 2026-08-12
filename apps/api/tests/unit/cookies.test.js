/**
 * Refresh-cookie policy — ADR-005, TRD §13.
 *
 * `resolveCookiePolicy` decides whether the browser will send the refresh cookie at all. Getting
 * it wrong does not throw: it signs every user out fifteen minutes after they sign in, in
 * production only, with nothing in the logs. So the decision is pure, and pinned here for every
 * topology the product can be deployed into.
 *
 * Run: npm run test --workspace=apps/api
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCookiePolicy, registrableDomain, isSameSite } from '../../src/lib/cookies.js';

describe('registrableDomain', () => {
  test('reduces a host to its registrable domain', () => {
    assert.equal(registrableDomain('https://api.evallo.in'), 'evallo.in');
    assert.equal(registrableDomain('https://app.evallo.in'), 'evallo.in');
    assert.equal(registrableDomain('https://evallo.in'), 'evallo.in');
    assert.equal(registrableDomain('https://deep.sub.evallo.in:8443'), 'evallo.in');
  });

  test('handles multi-part public suffixes', () => {
    assert.equal(registrableDomain('https://api.evallo.co.uk'), 'evallo.co.uk');
    assert.equal(registrableDomain('https://app.evallo.co.in'), 'evallo.co.in');
  });

  test('treats localhost and IP literals as their own site', () => {
    assert.equal(registrableDomain('http://localhost:3001'), 'localhost');
    assert.equal(registrableDomain('http://127.0.0.1:8081'), '127.0.0.1');
  });

  test('returns null for anything unparseable', () => {
    assert.equal(registrableDomain('not a url'), null);
    assert.equal(registrableDomain(''), null);
    assert.equal(registrableDomain(undefined), null);
  });
});

describe('isSameSite', () => {
  test('subdomains of one registrable domain are the same site', () => {
    assert.equal(isSameSite('https://app.evallo.in', 'https://api.evallo.in'), true);
  });

  test('different registrable domains are cross-site', () => {
    assert.equal(isSameSite('https://evallo.vercel.app', 'https://evallo.onrender.com'), false);
  });

  test('unknown side yields null rather than a guess', () => {
    assert.equal(isSameSite('https://app.evallo.in', null), null);
  });
});

describe('resolveCookiePolicy — same-site deployment (TRD §13 point 3)', () => {
  const policy = resolveCookiePolicy({
    clientOrigin: 'https://app.evallo.in',
    apiPublicUrl: 'https://api.evallo.in',
    isProduction: true,
  });

  test('keeps SameSite=Lax — the stronger CSRF posture', () => {
    assert.equal(policy.sameSite, 'lax');
    assert.equal(policy.crossSite, false);
  });

  test('is Secure in production', () => {
    assert.equal(policy.secure, true);
  });

  test('reports how it decided', () => {
    assert.match(policy.source, /registrable domain/);
    assert.equal(policy.warning, null);
  });
});

describe('resolveCookiePolicy — genuinely cross-site deployment', () => {
  const policy = resolveCookiePolicy({
    clientOrigin: 'https://evallo.vercel.app',
    apiPublicUrl: 'https://evallo-api.onrender.com',
    isProduction: true,
  });

  test('escalates to SameSite=None, because Lax would never be sent', () => {
    assert.equal(policy.sameSite, 'none');
    assert.equal(policy.crossSite, true);
  });

  test('SameSite=None is always paired with Secure', () => {
    assert.equal(policy.secure, true);
  });
});

describe('resolveCookiePolicy — SameSite=None over plain HTTP', () => {
  const policy = resolveCookiePolicy({
    clientOrigin: 'http://localhost:3001',
    apiPublicUrl: 'http://127.0.0.1:8081',
    isProduction: false,
  });

  test('forces Secure on and warns, rather than emitting a cookie the browser discards', () => {
    assert.equal(policy.sameSite, 'none');
    assert.equal(policy.secure, true);
    assert.match(policy.warning, /Secure/);
  });
});

describe('resolveCookiePolicy — defaults and overrides', () => {
  test('without API_PUBLIC_URL it keeps the historical Lax default', () => {
    const policy = resolveCookiePolicy({
      clientOrigin: 'https://app.evallo.in',
      isProduction: true,
    });
    assert.equal(policy.sameSite, 'lax');
    assert.equal(policy.crossSite, null);
    assert.match(policy.source, /API_PUBLIC_URL not set/);
  });

  test('an explicit COOKIE_SAMESITE wins over the derived value', () => {
    const policy = resolveCookiePolicy({
      clientOrigin: 'https://app.evallo.in',
      apiPublicUrl: 'https://api.evallo.in',
      sameSite: 'none',
      isProduction: true,
    });
    assert.equal(policy.sameSite, 'none');
    assert.equal(policy.source, 'COOKIE_SAMESITE');
    assert.equal(policy.secure, true);
  });

  test('development stays non-Secure so http://localhost keeps working', () => {
    const policy = resolveCookiePolicy({
      clientOrigin: 'http://localhost:3001',
      apiPublicUrl: 'http://localhost:8081',
      isProduction: false,
    });
    assert.equal(policy.sameSite, 'lax');
    assert.equal(policy.secure, false);
  });

  test('COOKIE_SECURE can force Secure on in development', () => {
    const policy = resolveCookiePolicy({
      clientOrigin: 'http://localhost:3001',
      apiPublicUrl: 'http://localhost:8081',
      secure: true,
      isProduction: false,
    });
    assert.equal(policy.secure, true);
  });
});
