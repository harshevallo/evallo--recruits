/**
 * One-to-one messaging — ADR-024 step 3.
 *
 * ── What these tests are for ──────────────────────────────────────────────────────────────────
 *
 * Steps 1 and 2 were inert: a nullable field and a wider index. This is the step that changes what
 * the product does, so these tests cover the two things that could go wrong, in opposite
 * directions:
 *
 *   1. **Separation actually happens.** Two colleagues messaging one candidate get one thread each,
 *      and neither can read the other's — reported as absent, not forbidden, because a 403 would
 *      confirm that a named candidate is talking to a named teammate.
 *   2. **Legacy shared threads are untouched.** They stay readable and repliable by the whole team,
 *      a reply continues them in place, and — the subtle one — replying does NOT adopt the thread.
 *      Adoption would privatise a shared thread with no consent, and re-deriving the thread from
 *      the candidate id would fork a second one while the team lost sight of the first.
 *
 * The fork case is the reason `replyAsCompany` no longer routes through `sendCompanyMessage`, and
 * it is asserted directly below: it is invisible in any single-recruiter test.
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
import {
  sendCompanyMessage,
  replyAsCompany,
  listCompanyConversations,
  getCompanyConversation,
} from '../../src/modules/messaging/companyMessaging.service.js';

const SLUG = 'adr024-step3-co';
const CANDIDATE_EMAIL = 'step3-candidate@example.test';
const ANA_EMAIL = 'step3-ana@example.test';
const BEN_EMAIL = 'step3-ben@example.test';
const EMAILS = [CANDIDATE_EMAIL, ANA_EMAIL, BEN_EMAIL];

let company;
let profile;
let ana;
let ben;

before(connectDatabase);

after(async () => {
  await cleanup();
  await disconnectDatabase();
});

async function cleanup() {
  const co = await Company.findOne({ slug: SLUG }).select('_id').lean();
  if (co) {
    const convos = await Conversation.find({ companyId: co._id }).select('_id').lean();
    await Message.deleteMany({ conversationId: { $in: convos.map((c) => c._id) } });
    await Conversation.deleteMany({ companyId: co._id });
  }
  await Company.deleteMany({ slug: SLUG });

  const users = await User.find({ email: { $in: EMAILS } }).select('_id').lean();
  await CandidateProfile.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: EMAILS } });
}

beforeEach(async () => {
  await cleanup();

  company = await Company.create({
    slug: SLUG,
    name: 'Step Three Co',
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

  ana = await User.create({ email: ANA_EMAIL, name: 'Ana Recruiter', emailVerified: true });
  ben = await User.create({ email: BEN_EMAIL, name: 'Ben Recruiter', emailVerified: true });
});

/** A thread from before ADR-024: no owner, shared by the whole company. */
const legacyThread = () =>
  Conversation.create({ candidateId: profile._id, companyId: company._id });

describe('two colleagues get two threads', () => {
  test('the second sender opens their own thread rather than joining the first', async () => {
    const first = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Hello from Ana',
    });
    const second = await sendCompanyMessage(company._id, ben._id, {
      candidateId: profile._id,
      body: 'Hello from Ben',
    });

    assert.notEqual(first.conversationId, second.conversationId, 'this is the whole feature');

    const threads = await Conversation.find({
      candidateId: profile._id,
      companyId: company._id,
    }).lean();
    assert.equal(threads.length, 2);
    assert.deepEqual(
      threads.map((t) => String(t.recruiterUserId)).sort(),
      [String(ana._id), String(ben._id)].sort(),
      'each thread is owned by the person who opened it',
    );
  });

  test('the same sender continues their own thread', async () => {
    const first = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Hello',
    });
    const again = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Following up',
    });

    assert.equal(first.conversationId, again.conversationId, 'a second message must not fork');
    assert.equal(await Conversation.countDocuments({ companyId: company._id }), 1);
  });
});

describe('a colleague cannot reach a private thread', () => {
  test("it is absent from the colleague's list", async () => {
    await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Private to Ana',
    });

    const hers = await listCompanyConversations(company._id, ana._id);
    assert.equal(hers.conversations.length, 1);

    const his = await listCompanyConversations(company._id, ben._id);
    assert.equal(his.conversations.length, 0, "Ben must not see Ana's thread");
  });

  /**
   * 404, not 403.
   *
   * A "forbidden" would confirm the thread exists — that this candidate is in conversation with
   * this teammate — which is precisely the fact a private thread must not disclose.
   */
  test('opening it by id is reported as absent, not forbidden', async () => {
    const { conversationId } = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Private to Ana',
    });

    await assert.rejects(
      () => getCompanyConversation(company._id, conversationId, ben._id),
      (error) => error.status === 404,
      'existence must not leak through the status code',
    );
  });

  test('replying into it is refused the same way', async () => {
    const { conversationId } = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Private to Ana',
    });

    await assert.rejects(
      () => replyAsCompany(company._id, ben._id, conversationId, 'butting in'),
      (error) => error.status === 404,
    );
    assert.equal(await Message.countDocuments({ conversationId }), 1, 'nothing was written');
  });
});

describe('legacy shared threads keep working', () => {
  test('every member still sees one', async () => {
    await legacyThread();

    for (const [who, actor] of [
      ['Ana', ana],
      ['Ben', ben],
    ]) {
      const list = await listCompanyConversations(company._id, actor._id);
      assert.equal(list.conversations.length, 1, `${who} must still see the shared thread`);
    }
  });

  test('either member may reply, and the reply continues it in place', async () => {
    const legacy = await legacyThread();

    await replyAsCompany(company._id, ana._id, legacy._id, 'Ana replying');
    await replyAsCompany(company._id, ben._id, legacy._id, 'Ben replying');

    assert.equal(
      await Conversation.countDocuments({ companyId: company._id }),
      1,
      'replying must not fork a second thread',
    );
    assert.equal(await Message.countDocuments({ conversationId: legacy._id }), 2);
  });

  /**
   * The adoption guard.
   *
   * Stamping the first replier as owner would privatise, silently and with no undo, a thread the
   * whole team could previously read.
   */
  test('replying does NOT adopt the thread', async () => {
    const legacy = await legacyThread();
    await replyAsCompany(company._id, ana._id, legacy._id, 'Ana replying');

    const after = await Conversation.findById(legacy._id).lean();
    assert.ok(after.recruiterUserId == null, 'a shared thread stays shared');

    const his = await listCompanyConversations(company._id, ben._id);
    assert.equal(his.conversations.length, 1, 'Ben has not lost sight of it');
  });

  /**
   * The fork this step had to be written carefully to avoid.
   *
   * `sendCompanyMessage` keys on the sender, so routing a reply through it would miss the shared
   * thread — whose owner is null, not Ana — and open a second one beside it.
   */
  test('a NEW message from a member with a shared thread opens their own, leaving it intact', async () => {
    const legacy = await legacyThread();

    await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'Ana starting her own',
    });

    const shared = await Conversation.findById(legacy._id).lean();
    assert.ok(shared.recruiterUserId == null, 'the shared thread is untouched');
    assert.equal(
      await Conversation.countDocuments({ companyId: company._id }),
      2,
      "the shared thread and Ana's own now coexist",
    );
  });
});

describe('unread counts follow the thread', () => {
  test("one member reading their thread does not clear a colleague's", async () => {
    const anaThread = await sendCompanyMessage(company._id, ana._id, {
      candidateId: profile._id,
      body: 'from Ana',
    });
    const benThread = await sendCompanyMessage(company._id, ben._id, {
      candidateId: profile._id,
      body: 'from Ben',
    });

    /* A candidate reply to each, so both have something unread on the company side. */
    for (const id of [anaThread.conversationId, benThread.conversationId]) {
      await Conversation.updateOne({ _id: id }, { $set: { companyUnread: 1 } });
    }

    await getCompanyConversation(company._id, anaThread.conversationId, ana._id);

    const hers = await Conversation.findById(anaThread.conversationId).lean();
    const his = await Conversation.findById(benThread.conversationId).lean();
    assert.equal(hers.companyUnread, 0, 'Ana read hers');
    assert.equal(his.companyUnread, 1, "Ben's is untouched");
  });
});
