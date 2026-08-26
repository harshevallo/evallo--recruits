/**
 * The hiring record — `getHires` (REC-14).
 *
 * ── What is actually being pinned ─────────────────────────────────────────────────────────────
 *
 * Two things, and the second is the one that motivated the screen.
 *
 * 1. **Only hires appear.** Not rejected entries, not live ones. The board and this list read the
 *    same collection, so "closed" must not quietly mean "closed OR rejected".
 * 2. **`hiredAt` comes from the stage-history row, not from `updatedAt` or `closedAt`.** Both of
 *    those move for reasons that are not the hire — reassigning an owner bumps `updatedAt`, and an
 *    entry moved out of `hired` and back carries a `closedAt` from the wrong moment. There is a
 *    test below that edits an entry after hiring and asserts the date does not drift.
 *
 * Candidate visibility is inherited from `hydrate`, which the board already uses, so a candidate
 * who goes private disappears from both. That is asserted too, because it is the one way this
 * screen could leak something the board would have withheld.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { PIPELINE_STAGES, COMPANY_STATUS, CANDIDATE_VISIBILITY } from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { PipelineEntry, REJECTION_REASONS } from '../../src/modules/pipeline/pipelineEntry.model.js';
import { getHires, changeStage } from '../../src/modules/pipeline/pipeline.service.js';

const SLUG = 'hires-test-co';
const EMAILS = ['hire-a@example.test', 'hire-b@example.test', 'hire-c@example.test', 'recruiter@example.test'];

let company;
let recruiter;

before(connectDatabase);

after(async () => {
  await cleanup();
  await disconnectDatabase();
});

async function cleanup() {
  const co = await Company.findOne({ slug: SLUG }).select('_id').lean();
  if (co) await PipelineEntry.deleteMany({ companyId: co._id });
  await Company.deleteMany({ slug: SLUG });

  const users = await User.find({ email: { $in: EMAILS } }).select('_id').lean();
  await CandidateProfile.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: EMAILS } });
}

/** A discoverable candidate, so `hydrate` keeps them. */
async function makeCandidate(email, name) {
  const user = await User.create({ email, name, emailVerified: true });
  const profile = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    headline: `${name} headline`,
  });
  return profile;
}

async function addEntry(candidateId, overrides = {}) {
  return PipelineEntry.create({
    companyId: company._id,
    candidateId,
    stage: PIPELINE_STAGES.REVIEWING,
    source: 'search',
    ...overrides,
  });
}

/** Hires through the real service, so the stage-history row is written the way production writes it. */
const hire = (entryId, outcome) =>
  changeStage(company._id, entryId, recruiter._id, {
    stage: PIPELINE_STAGES.HIRED,
    outcome,
  });

beforeEach(async () => {
  await cleanup();
  company = await Company.create({
    slug: SLUG,
    name: 'Hires Test Co',
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    location: { country: 'IN' },
  });
  recruiter = await User.create({
    email: 'recruiter@example.test',
    name: 'Ravi Recruiter',
    emailVerified: true,
  });
});

describe('only hires appear', () => {
  test('a hired entry is listed with the facts the dialog collected', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);

    await hire(entry._id, { roleTitle: 'IB Physics Teacher', startDate: '2026-09-01' });

    const { hires, total } = await getHires(company._id);
    assert.equal(total, 1);
    assert.equal(hires[0].candidate.name, 'Asha Kumar');
    assert.equal(hires[0].roleTitle, 'IB Physics Teacher');
    assert.equal(hires[0].startDate, '2026-09-01');
  });

  test('records who made the decision', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);
    await hire(entry._id, { roleTitle: 'Maths Tutor' });

    const { hires } = await getHires(company._id);
    assert.equal(hires[0].hiredBy.name, 'Ravi Recruiter');
    assert.equal(hires[0].hiredBy.id, String(recruiter._id));
  });

  test('a LIVE entry is never listed', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    await addEntry(candidate._id, { stage: PIPELINE_STAGES.INTERVIEW });

    const { total } = await getHires(company._id);
    assert.equal(total, 0, 'the pipeline is not the hiring record');
  });

  test('a REJECTED entry is never listed', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);

    await changeStage(company._id, entry._id, recruiter._id, {
      stage: PIPELINE_STAGES.REJECTED,
      reasonCode: Object.values(REJECTION_REASONS)[0],
    });

    const { total } = await getHires(company._id);
    assert.equal(total, 0, 'closed must not mean rejected as well as hired');
  });

  test('another company\'s hire is never listed', async () => {
    const other = await Company.create({
      slug: `${SLUG}-other`,
      name: 'Other Co',
      organizationType: 'tutoring_center',
      status: COMPANY_STATUS.PUBLISHED,
      location: { country: 'IN' },
    });

    try {
      const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
      const entry = await PipelineEntry.create({
        companyId: other._id,
        candidateId: candidate._id,
        stage: PIPELINE_STAGES.REVIEWING,
        source: 'search',
      });
      await changeStage(other._id, entry._id, recruiter._id, {
        stage: PIPELINE_STAGES.HIRED,
        outcome: { roleTitle: 'Somewhere else' },
      });

      const { total } = await getHires(company._id);
      assert.equal(total, 0);
    } finally {
      await PipelineEntry.deleteMany({ companyId: other._id });
      await Company.deleteOne({ _id: other._id });
    }
  });

  test('a candidate who has gone private disappears, exactly as on the board', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);
    await hire(entry._id, { roleTitle: 'Physics Teacher' });

    assert.equal((await getHires(company._id)).total, 1);

    await CandidateProfile.updateOne(
      { _id: candidate._id },
      { $set: { status: CANDIDATE_VISIBILITY.PRIVATE } },
    );

    const { total } = await getHires(company._id);
    assert.equal(total, 0, 'the entry is retained; the CARD is withheld (PRD §11.4)');
  });
});

describe('the hire date is the moment of the decision', () => {
  test('editing the entry afterwards does not move hiredAt', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);
    await hire(entry._id, { roleTitle: 'Physics Teacher' });

    const before = (await getHires(company._id)).hires[0].hiredAt;
    assert.ok(before, 'a hire must carry a date');

    /* Anything that bumps `updatedAt` without being the hire. */
    await new Promise((r) => setTimeout(r, 25));
    await PipelineEntry.updateOne({ _id: entry._id }, { $set: { nextAction: 'Send contract' } });

    const after = (await getHires(company._id)).hires[0].hiredAt;
    assert.equal(
      new Date(after).getTime(),
      new Date(before).getTime(),
      'hiredAt must come from stageHistory, not updatedAt',
    );
  });

  test('re-hiring after a move away uses the LATEST decision', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);

    await hire(entry._id, { roleTitle: 'First attempt' });
    const first = (await getHires(company._id)).hires[0].hiredAt;

    /* Moved out (a mistake being corrected), then hired again. */
    await changeStage(company._id, entry._id, recruiter._id, {
      stage: PIPELINE_STAGES.OFFER,
    });
    await new Promise((r) => setTimeout(r, 25));
    await hire(entry._id, { roleTitle: 'Corrected role' });

    const { hires } = await getHires(company._id);
    assert.equal(hires[0].roleTitle, 'Corrected role');
    assert.ok(
      new Date(hires[0].hiredAt).getTime() > new Date(first).getTime(),
      'the second decision is the one that counts',
    );
  });

  test('newest hire first', async () => {
    const a = await makeCandidate('hire-a@example.test', 'First Hired');
    const b = await makeCandidate('hire-b@example.test', 'Second Hired');

    const entryA = await addEntry(a._id);
    await hire(entryA._id, { roleTitle: 'Role A' });

    await new Promise((r) => setTimeout(r, 25));
    const entryB = await addEntry(b._id);
    await hire(entryB._id, { roleTitle: 'Role B' });

    const { hires } = await getHires(company._id);
    assert.deepEqual(
      hires.map((row) => row.candidate.name),
      ['Second Hired', 'First Hired'],
    );
  });

  test('daysToHire measures entry to decision, and is never negative', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);

    /*
     * Backdate the entry so the span is deterministic rather than sub-second.
     *
     * Through the NATIVE driver, not `PipelineEntry.updateOne`: Mongoose marks `createdAt`
     * immutable under `timestamps: true` and silently drops a `$set` on it, which made this test
     * measure zero days and look like a bug in `daysToHire` rather than in its own fixture.
     */
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    await PipelineEntry.collection.updateOne(
      { _id: entry._id },
      { $set: { createdAt: tenDaysAgo } },
    );

    await hire(entry._id, { roleTitle: 'Physics Teacher' });

    const { hires } = await getHires(company._id);
    assert.equal(hires[0].daysToHire, 10);
    assert.ok(hires[0].daysToHire >= 0);
  });
});

describe('the payload', () => {
  test('carries no rejection data and no raw ids', async () => {
    const candidate = await makeCandidate('hire-a@example.test', 'Asha Kumar');
    const entry = await addEntry(candidate._id);
    await hire(entry._id, { roleTitle: 'Physics Teacher' });

    const { hires } = await getHires(company._id);
    const raw = JSON.stringify(hires[0]);

    assert.ok(!raw.includes('rejectionNote'), 'internal rejection notes never reach this screen');
    assert.ok(!raw.includes('rejectionReason'));
    assert.ok(!('companyId' in hires[0]));
    assert.ok(!('candidateId' in hires[0]));

    /* Exactly the fields the screen renders. */
    assert.deepEqual(Object.keys(hires[0]).sort(), [
      'candidate',
      'daysToHire',
      'hiredAt',
      'hiredBy',
      'id',
      'owner',
      'roleTitle',
      'source',
      'startDate',
    ]);
  });

  test('an empty record is an empty list, not an error', async () => {
    const result = await getHires(company._id);
    assert.deepEqual(result, { hires: [], total: 0 });
  });

  test('a company id with no entries at all returns empty', async () => {
    const result = await getHires(new mongoose.Types.ObjectId());
    assert.equal(result.total, 0);
  });
});
