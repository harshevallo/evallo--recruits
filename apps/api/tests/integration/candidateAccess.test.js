/**
 * `resolveCandidateAccess` — the fail-closed authorization gate (ADR-006 §6.2, PRD §4.3).
 *
 * ── What these tests are for ──────────────────────────────────────────────────────────────────
 *
 * This function used to answer "may this company see this candidate?" by denying four states and
 * then falling through to `visible: true`. The default was YES and the denials were exceptions
 * carved out of it, which meant a new member of `CANDIDATE_VISIBILITY` — a one-line change in a
 * shared constants file — would silently grant every company access to every candidate in the new
 * state, and nothing would fail.
 *
 * It is now a `switch` with an explicit `default: denied`. These tests exist in two halves:
 *
 *   1. **The five existing states behave EXACTLY as before.** This was a security hardening
 *      change, not a product change, so the regression half is the more important one. If any of
 *      these five change meaning, the fix went too far.
 *   2. **Anything else is denied.** Including a value that does not exist in the enum today —
 *      which is the case the whole change is about, and the one that could not be written before
 *      because there was no behaviour to assert.
 *
 * ── Why the service is called directly ────────────────────────────────────────────────────────
 *
 * Through the HTTP surface, an unknown visibility value is unreachable: `candidate.validation.js`
 * rejects it on write, and no migration produces one. That is exactly why the hazard survived —
 * it cannot be provoked from outside. So these call the function with documents written straight
 * to the collection, which is the only way to exercise a state the API will not let you set.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { AccessGrant } from '../../src/modules/interests/accessGrant.model.js';
import {
  resolveCandidateAccess,
  ACCESS_DENIED,
} from '../../src/modules/candidates/candidateAccess.service.js';

const EMAIL = 'access-gate@example.test';

/** A stable company id. Never persisted — the gate takes an id, not a document. */
const COMPANY_ID = new mongoose.Types.ObjectId();
const OTHER_COMPANY_ID = new mongoose.Types.ObjectId();

let profile;

before(connectDatabase);

after(async () => {
  await cleanup();
  await disconnectDatabase();
});

async function cleanup() {
  const user = await User.findOne({ email: EMAIL }).select('_id').lean();
  if (user) {
    const owned = await CandidateProfile.find({ userId: user._id }).select('_id').lean();
    await AccessGrant.deleteMany({ candidateId: { $in: owned.map((p) => p._id) } });
    await CandidateProfile.deleteMany({ userId: user._id });
  }
  await User.deleteMany({ email: EMAIL });
}

/**
 * Writes `status` straight to the collection.
 *
 * `updateOne` through the native driver, because Mongoose would reject a value outside the schema
 * enum — and a value outside the enum is precisely what the unknown-state tests need.
 */
async function setStatus(status) {
  await CandidateProfile.collection.updateOne({ _id: profile._id }, { $set: { status } });
  return CandidateProfile.findById(profile._id);
}

const grant = () =>
  AccessGrant.create({ candidateId: profile._id, companyId: COMPANY_ID, grantedAt: new Date() });

beforeEach(async () => {
  await cleanup();
  const user = await User.create({ email: EMAIL, name: 'Access Gate', emailVerified: true });
  profile = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
  });
});

describe('the five existing states are unchanged', () => {
  test('DRAFT is never visible, with or without a grant', async () => {
    const draft = await setStatus(CANDIDATE_VISIBILITY.DRAFT);

    let access = await resolveCandidateAccess(draft, COMPANY_ID);
    assert.equal(access.visible, false);
    assert.equal(access.reason, ACCESS_DENIED.NOT_PUBLISHED);
    assert.equal(access.contactRevealed, false);

    /* A grant does not rescue a draft: it was never published to grant access TO. */
    await grant();
    access = await resolveCandidateAccess(await CandidateProfile.findById(profile._id), COMPANY_ID);
    assert.equal(access.visible, false, 'a grant must not override "not published"');
    assert.equal(access.reason, ACCESS_DENIED.NOT_PUBLISHED);
  });

  test('ARCHIVED is never visible, with or without a grant', async () => {
    const archived = await setStatus(CANDIDATE_VISIBILITY.ARCHIVED);

    let access = await resolveCandidateAccess(archived, COMPANY_ID);
    assert.equal(access.visible, false);
    assert.equal(access.reason, ACCESS_DENIED.ARCHIVED);

    await grant();
    access = await resolveCandidateAccess(await CandidateProfile.findById(profile._id), COMPANY_ID);
    assert.equal(access.visible, false, 'archived outranks a grant');
    assert.equal(access.reason, ACCESS_DENIED.ARCHIVED);
  });

  test('PRIVATE is denied without a grant and allowed with one (§21.3)', async () => {
    const priv = await setStatus(CANDIDATE_VISIBILITY.PRIVATE);

    const before = await resolveCandidateAccess(priv, COMPANY_ID);
    assert.equal(before.visible, false);
    assert.equal(before.reason, ACCESS_DENIED.PRIVATE_NO_GRANT);

    await grant();
    const after = await resolveCandidateAccess(priv, COMPANY_ID);
    assert.equal(after.visible, true, 'a grant is what makes private reachable');
    assert.equal(after.reason, null);
  });

  test("PRIVATE: another company's grant grants nothing", async () => {
    const priv = await setStatus(CANDIDATE_VISIBILITY.PRIVATE);
    await grant();

    const access = await resolveCandidateAccess(priv, OTHER_COMPANY_ID);
    assert.equal(access.visible, false, 'a grant is per company, not global');
    assert.equal(access.reason, ACCESS_DENIED.PRIVATE_NO_GRANT);
  });

  test('PRIVATE: a WITHDRAWN grant stops granting', async () => {
    const priv = await setStatus(CANDIDATE_VISIBILITY.PRIVATE);
    const created = await grant();

    assert.equal((await resolveCandidateAccess(priv, COMPANY_ID)).visible, true);

    await AccessGrant.updateOne({ _id: created._id }, { $set: { withdrawnAt: new Date() } });
    const access = await resolveCandidateAccess(priv, COMPANY_ID);
    assert.equal(access.visible, false, 'withdrawal must revoke, not merely record');
    assert.equal(access.reason, ACCESS_DENIED.PRIVATE_NO_GRANT);
  });

  test('PAUSED keeps previously authorized companies and refuses new ones', async () => {
    const paused = await setStatus(CANDIDATE_VISIBILITY.PAUSED);

    const stranger = await resolveCandidateAccess(paused, COMPANY_ID);
    assert.equal(stranger.visible, false);
    assert.equal(stranger.reason, ACCESS_DENIED.PAUSED_NO_GRANT);

    await grant();
    const authorized = await resolveCandidateAccess(paused, COMPANY_ID);
    assert.equal(authorized.visible, true, '"remains available to previously authorized companies"');
  });

  test('DISCOVERABLE is visible without a grant', async () => {
    const discoverable = await setStatus(CANDIDATE_VISIBILITY.DISCOVERABLE);

    const access = await resolveCandidateAccess(discoverable, COMPANY_ID);
    assert.equal(access.visible, true);
    assert.equal(access.reason, null);
  });

  test('a block overrides every state, including DISCOVERABLE', async () => {
    await CandidateProfile.updateOne(
      { _id: profile._id },
      { $set: { blockedCompanyIds: [COMPANY_ID] } },
    );
    const blocked = await CandidateProfile.findById(profile._id);

    for (const status of [
      CANDIDATE_VISIBILITY.DISCOVERABLE,
      CANDIDATE_VISIBILITY.PRIVATE,
      CANDIDATE_VISIBILITY.PAUSED,
    ]) {
      blocked.status = status;
      const access = await resolveCandidateAccess(blocked, COMPANY_ID);
      assert.equal(access.visible, false, `${status} must still be blocked`);
      assert.equal(access.reason, ACCESS_DENIED.BLOCKED);
    }
  });

  test('the contact rule is unchanged by this fix', async () => {
    const discoverable = await setStatus(CANDIDATE_VISIBILITY.DISCOVERABLE);

    /* Default is HIDDEN. */
    assert.equal((await resolveCandidateAccess(discoverable, COMPANY_ID)).contactRevealed, false);

    await CandidateProfile.updateOne(
      { _id: profile._id },
      { $set: { contactVisibility: CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS } },
    );
    const open = await CandidateProfile.findById(profile._id);
    assert.equal((await resolveCandidateAccess(open, COMPANY_ID)).contactRevealed, true);
  });
});

describe('fail-closed: anything not named is denied', () => {
  /*
   * The regression this change exists to prevent.
   *
   * Before the fix each of these fell past every `if` and returned `visible: true` with contact
   * resolution applied. None of them is a state the product understands, and the difference
   * between "no rule for this" and "allow" is a privacy breach.
   */
  const unknownValues = [
    /*
     * A state that does not exist. `public` used to stand here and no longer can — it is real now
     * and has its own `case`. The slot is kept filled deliberately: the guarantee being tested is
     * "a state with no rule is denied", and it needs a value with no rule to test it with.
     */
    ['a future state not yet implemented', 'federated'],
    ['a typo or renamed value', 'discoverabel'],
    ['an empty string', ''],
    ['a value from another domain', 'published'],
  ];

  for (const [label, value] of unknownValues) {
    test(`${label} (\`${value}\`) is denied`, async () => {
      const unknown = await setStatus(value);

      const access = await resolveCandidateAccess(unknown, COMPANY_ID);
      assert.equal(access.visible, false, `"${value}" must not be visible`);
      assert.equal(access.reason, ACCESS_DENIED.UNKNOWN_VISIBILITY);
      assert.equal(access.contactRevealed, false, 'and contact must never leak with it');
    });
  }

  test('a missing status is denied on BOTH read paths', async () => {
    await CandidateProfile.collection.updateOne({ _id: profile._id }, { $unset: { status: '' } });

    /*
     * Two paths, two different reasons, one outcome — and the difference is worth pinning.
     *
     * Hydrated through Mongoose, the schema's `default: DRAFT` fills the gap, so the gate sees
     * `draft` and denies as "not published". Read with `.lean()` no default is applied, `status`
     * is `undefined`, and the gate's own `default:` branch denies it. Callers use both styles —
     * `pipeline.service` hydrates, `search.service` leans — so both had to be checked.
     *
     * The point is that a malformed document is refused either way. It stopped being possible for
     * one of these paths to answer "yes" the moment the fall-through was removed.
     */
    const hydrated = await CandidateProfile.findById(profile._id);
    const viaMongoose = await resolveCandidateAccess(hydrated, COMPANY_ID);
    assert.equal(viaMongoose.visible, false, 'a malformed document is not a licence to disclose');
    assert.equal(viaMongoose.reason, ACCESS_DENIED.NOT_PUBLISHED, "Mongoose's default is DRAFT");

    const lean = await CandidateProfile.findById(profile._id).lean();
    assert.equal(lean.status, undefined, 'lean applies no schema default');
    const viaLean = await resolveCandidateAccess(lean, COMPANY_ID);
    assert.equal(viaLean.visible, false);
    assert.equal(viaLean.reason, ACCESS_DENIED.UNKNOWN_VISIBILITY, "the gate's own default denies");
    assert.equal(viaLean.contactRevealed, false);
  });

  test('an unknown state is denied even WITH an active grant', async () => {
    const unknown = await setStatus('not_a_real_state');
    await grant();

    const access = await resolveCandidateAccess(unknown, COMPANY_ID);
    assert.equal(access.visible, false, 'a grant cannot substitute for a missing rule');
    assert.equal(access.reason, ACCESS_DENIED.UNKNOWN_VISIBILITY);
  });
});

describe('PUBLIC (Phase 3C) has an explicit rule, not an inherited one', () => {
  /*
   * Phase 3A carried a test asserting `public` was UNKNOWN and therefore denied — written when
   * the state did not exist, and designed to fail the day it did. It has now been replaced by
   * these, which is exactly what that test was a reminder to do: `public` is visible to a company
   * because a `case` says so, not because a fall-through allowed it.
   */
  test('PUBLIC is in the production enum', () => {
    assert.equal(CANDIDATE_VISIBILITY.PUBLIC, 'public');
  });

  test('PUBLIC is visible to a company without a grant, like DISCOVERABLE', async () => {
    const pub = await setStatus(CANDIDATE_VISIBILITY.PUBLIC);

    const access = await resolveCandidateAccess(pub, COMPANY_ID);
    assert.equal(access.visible, true, 'public is a SUPERSET of discoverable, not a narrowing');
    assert.equal(access.reason, null);
  });

  test('PUBLIC still obeys a block', async () => {
    await CandidateProfile.updateOne(
      { _id: profile._id },
      { $set: { status: CANDIDATE_VISIBILITY.PUBLIC, blockedCompanyIds: [COMPANY_ID] } },
    );
    const blocked = await CandidateProfile.findById(profile._id);

    const access = await resolveCandidateAccess(blocked, COMPANY_ID);
    assert.equal(access.visible, false, 'a block outranks every state, public included');
    assert.equal(access.reason, ACCESS_DENIED.BLOCKED);
  });

  test('PUBLIC still obeys the contact rule for companies', async () => {
    /*
     * The public PAGE never shows contact (see publicPortfolio.test.js). A signed-in company is a
     * different audience, and choosing a public portfolio does not silently open contact to them
     * either — that stays the candidate's own `contactVisibility` decision.
     */
    await CandidateProfile.updateOne(
      { _id: profile._id },
      { $set: { status: CANDIDATE_VISIBILITY.PUBLIC, contactVisibility: CONTACT_VISIBILITY.HIDDEN } },
    );
    const pub = await CandidateProfile.findById(profile._id);

    assert.equal((await resolveCandidateAccess(pub, COMPANY_ID)).contactRevealed, false);
  });
});
