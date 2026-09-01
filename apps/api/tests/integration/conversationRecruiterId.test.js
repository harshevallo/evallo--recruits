/**
 * `conversations.recruiterUserId` — ADR-024 steps 1 and 2.
 *
 * ── What these tests are for ──────────────────────────────────────────────────────────────────
 *
 * Step 1 added one nullable field; step 2 widened the unique index to include it. Neither changes
 * behaviour — and a claim of neutrality is exactly the kind that is easy to assert and easy to get
 * wrong: a stray `required: true`, a field reading back `undefined` where the next phase expects
 * `null`, or a widened index that quietly stops protecting legacy threads.
 *
 * So these pin the neutrality itself rather than any new behaviour:
 *
 *   1. **A document written without the field is valid** — this is what makes "no backfill"
 *      possible. If the field were required, the live threads would be unloadable.
 *   2. **A row already in the collection without the field reads back as `null`.** Written through
 *      the native driver, because that is the only way to produce a document that genuinely lacks
 *      the path, the way every existing production row does.
 *   3. **The index is now three keys, the old two-key one is gone, and the legacy guarantee
 *      survives.** Widening a unique key is permissive, so the risk is not that it rejects
 *      something — it is that it stops rejecting a second SHARED thread. That is asserted directly,
 *      as is the old index's absence, which is the only way to catch a database where the migration
 *      script was never run.
 *   4. **Nothing reads the field.** The candidate- and company-side services are exercised over a
 *      thread whose `recruiterUserId` is set to a real user, and their payloads must be identical
 *      to the same thread with it null.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY, COMPANY_STATUS } from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { Conversation } from '../../src/modules/messaging/conversation.model.js';
import { Message } from '../../src/modules/messaging/message.model.js';

const SLUG = 'adr024-step1-co';
const CANDIDATE_EMAIL = 'adr024-candidate@example.test';
const RECRUITER_EMAIL = 'adr024-recruiter@example.test';
const OTHER_EMAIL = 'adr024-colleague@example.test';
const EMAILS = [CANDIDATE_EMAIL, RECRUITER_EMAIL, OTHER_EMAIL];

let company;
let profile;
let recruiter;
/** A second member of the SAME company — the one who must not see the first one's thread. */
let other;

before(connectDatabase);

after(async () => {
  await cleanup();
  await disconnectDatabase();
});

async function cleanup() {
  const co = await Company.findOne({ slug: SLUG }).select('_id').lean();
  const users = await User.find({ email: { $in: EMAILS } }).select('_id').lean();
  const profiles = await CandidateProfile.find({ userId: { $in: users.map((u) => u._id) } })
    .select('_id')
    .lean();

  const convoFilter = {
    ...(co ? { companyId: co._id } : {}),
    ...(profiles.length ? { candidateId: { $in: profiles.map((p) => p._id) } } : {}),
  };
  if (Object.keys(convoFilter).length) {
    const convos = await Conversation.find(convoFilter).select('_id').lean();
    await Message.deleteMany({ conversationId: { $in: convos.map((c) => c._id) } });
    await Conversation.deleteMany({ _id: { $in: convos.map((c) => c._id) } });
  }

  await Company.deleteMany({ slug: SLUG });
  await CandidateProfile.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: EMAILS } });
}

beforeEach(async () => {
  await cleanup();

  company = await Company.create({
    slug: SLUG,
    name: 'ADR-024 Step One Co',
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    location: { country: 'IN' },
  });

  const candidateUser = await User.create({
    email: CANDIDATE_EMAIL,
    name: 'Asha Candidate',
    emailVerified: true,
  });
  profile = await CandidateProfile.create({
    userId: candidateUser._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
  });

  recruiter = await User.create({
    email: RECRUITER_EMAIL,
    name: 'Ravi Recruiter',
    emailVerified: true,
  });

  other = await User.create({
    email: OTHER_EMAIL,
    name: 'Nita Colleague',
    emailVerified: true,
  });
});

describe('the field is optional, which is what makes "no backfill" possible', () => {
  test('a conversation created without recruiterUserId is valid', async () => {
    const conversation = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
    });

    assert.ok(conversation._id, 'creation must not require the new field');
    assert.equal(conversation.recruiterUserId, null, 'absent means "shared company thread"');
  });

  test('validation passes with the field omitted entirely', async () => {
    const conversation = new Conversation({ candidateId: profile._id, companyId: company._id });
    await assert.doesNotReject(() => conversation.validate());
  });

  test('an explicit null is accepted', async () => {
    const conversation = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: null,
    });
    assert.equal(conversation.recruiterUserId, null);
  });

  test('a real user id round-trips, so step 3 has somewhere to write', async () => {
    const conversation = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: recruiter._id,
    });

    const reloaded = await Conversation.findById(conversation._id);
    assert.equal(String(reloaded.recruiterUserId), String(recruiter._id));
  });
});

describe('rows that predate the field', () => {
  /**
   * Written through the native driver on purpose.
   *
   * `Conversation.create()` applies the schema default, so it cannot produce a document that truly
   * lacks the path. Every existing production row does lack it, and the question this test answers
   * is what those rows read back as — `null`, or `undefined`.
   */
  test('a document with no recruiterUserId path loads, and reads back as null', async () => {
    const inserted = await Conversation.collection.insertOne({
      candidateId: profile._id,
      companyId: company._id,
      candidateUnread: 0,
      companyUnread: 0,
      candidateState: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const legacy = await Conversation.findById(inserted.insertedId);
    assert.ok(legacy, 'an existing conversation must still load');
    assert.equal(legacy.recruiterUserId, null, 'the default applies on read, so step 3 sees null');

    /* And it must still be saveable — a legacy thread has to accept replies. */
    legacy.lastMessagePreview = 'a reply to a legacy thread';
    await assert.doesNotReject(() => legacy.save());
  });

  test('a lean read of a legacy row is simply missing the key', async () => {
    const inserted = await Conversation.collection.insertOne({
      candidateId: profile._id,
      companyId: company._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const lean = await Conversation.findById(inserted.insertedId).lean();
    assert.ok(lean, 'the row still reads');

    /*
     * Documented rather than corrected. `.lean()` bypasses hydration, so no default is applied and
     * the key is absent. `== null` is true either way, which is why this is safe today — but step 3
     * must compare with `== null` or `?? null`, never `=== null`, on lean reads.
     */
    assert.equal(lean.recruiterUserId, undefined, 'lean reads skip defaults');
    assert.ok(lean.recruiterUserId == null, 'both spellings are still "no owner"');
  });
});

describe('the index is keyed on the employee too — step 2', () => {
  /**
   * These two inverted at step 2, deliberately.
   *
   * Until step 2 they asserted the opposite — that a second thread was impossible and the key was
   * two fields — and their whole purpose was to fail the moment the index changed. That is the
   * signal that step 2 has run, so they are flipped rather than deleted: the same two facts, now
   * pinned the other way round.
   */
  test('a differing recruiterUserId is now a separate thread', async () => {
    await Conversation.create({ candidateId: profile._id, companyId: company._id });

    const owned = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: recruiter._id,
    });

    assert.ok(owned._id, 'the wider key permits one thread per employee');
    const both = await Conversation.countDocuments({
      candidateId: profile._id,
      companyId: company._id,
    });
    assert.equal(both, 2, 'the shared thread and the owned one coexist');
  });

  /**
   * The guarantee the old index gave, which must survive widening it.
   *
   * A missing path and an explicit `null` index as the same value, so every legacy thread keys as
   * `(candidate, company, null)` and a second shared thread for one pair is still rejected. If this
   * regressed, duplicate company threads could appear with nothing to stop them.
   */
  test('a second SHARED (null) thread for one pair is still rejected', async () => {
    await Conversation.create({ candidateId: profile._id, companyId: company._id });

    await assert.rejects(
      () => Conversation.create({ candidateId: profile._id, companyId: company._id }),
      (error) => error.code === 11000,
      'widening the key must not weaken the legacy guarantee',
    );
  });

  test('the same employee cannot open two threads with one candidate', async () => {
    await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: recruiter._id,
    });

    await assert.rejects(
      () =>
        Conversation.create({
          candidateId: profile._id,
          companyId: company._id,
          recruiterUserId: recruiter._id,
        }),
      (error) => error.code === 11000,
      'a reply must continue the thread, not fork it',
    );
  });

  test('the unique index is now keyed on candidateId + companyId + recruiterUserId', async () => {
    const indexes = await Conversation.collection.indexes();
    const unique = indexes.filter((index) => index.unique);

    assert.equal(unique.length, 1, 'exactly one unique index on conversations');
    assert.deepEqual(unique[0].key, { candidateId: 1, companyId: 1, recruiterUserId: 1 });
  });

  /**
   * The migration, not just the declaration.
   *
   * Mongoose creates the new index on boot but never drops the old one, so a database can end up
   * carrying both — and the old two-key index would still forbid the per-person threads step 3
   * creates. Asserting its absence is the only way to catch a database where the migration script
   * was never run.
   */
  test('the old two-key unique index is gone, not merely undeclared', async () => {
    const indexes = await Conversation.collection.indexes();
    const old = indexes.find((index) => index.name === 'candidateId_1_companyId_1');
    assert.equal(old, undefined, 'run scripts/migrate-conversation-indexes.mjs');
  });
});

describe('the field now drives behaviour — step 3', () => {
  /**
   * These two also inverted, and for the same reason as the index pair above.
   *
   * Through steps 1 and 2 they asserted that setting `recruiterUserId` changed nothing — that was
   * the proof those steps were inert. Step 3 is the step that makes it mean something, so the same
   * two payloads are now pinned to the behaviour it introduces.
   */
  test('the candidate-side list names the person once the thread has an owner', async () => {
    const { listConversations } = await import('../../src/modules/messaging/messaging.service.js');

    const thread = await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      lastMessageAt: new Date('2026-08-01T00:00:00.000Z'),
      lastMessagePreview: 'hello',
    });

    const shared = await listConversations(profile);
    assert.equal(shared[0].recruiter, null, 'a legacy thread has no one owner to name');

    await Conversation.updateOne({ _id: thread._id }, { $set: { recruiterUserId: recruiter._id } });

    const owned = await listConversations(profile);
    assert.equal(owned[0].recruiter?.name, 'Ravi Recruiter');
    assert.equal(owned[0].company.name, 'ADR-024 Step One Co', 'company stays as context');
  });

  /**
   * The owner is resolved from the thread, not from whoever wrote last.
   *
   * `lastMessageFrom` is null whenever the candidate replied most recently, so a title built on it
   * would flip between a name and nothing. This is the test that pins the difference.
   */
  test('the person survives the candidate replying last', async () => {
    const { listConversations } = await import('../../src/modules/messaging/messaging.service.js');

    await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: recruiter._id,
      lastMessageAt: new Date('2026-08-01T00:00:00.000Z'),
      lastMessagePreview: 'my reply',
      lastMessageSenderType: 'candidate',
      lastMessageSenderId: null,
    });

    const [row] = await listConversations(profile);
    assert.equal(row.lastMessageFrom, null, 'the candidate wrote last, so there is no sender name');
    assert.equal(row.recruiter?.name, 'Ravi Recruiter', 'the title must not flip to nothing');
  });

  test("the company-side list hides a colleague's thread", async () => {
    const { listCompanyConversations } = await import(
      '../../src/modules/messaging/companyMessaging.service.js'
    );

    await Conversation.create({
      candidateId: profile._id,
      companyId: company._id,
      recruiterUserId: recruiter._id,
      lastMessageAt: new Date('2026-08-01T00:00:00.000Z'),
      lastMessagePreview: 'private',
    });

    const owner = await listCompanyConversations(company._id, recruiter._id);
    assert.equal(owner.conversations.length, 1, 'the owner sees their own thread');

    const colleague = await listCompanyConversations(company._id, other._id);
    assert.equal(colleague.conversations.length, 0, "a colleague's private thread is not listed");
  });
});
