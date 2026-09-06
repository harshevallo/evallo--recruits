/**
 * Direct messaging — ADR-025 (PRD §11.2, §16.3).
 *
 * ── What this suite pins ──────────────────────────────────────────────────────────────────────
 *
 *   · a conversation is between TWO PEOPLE, keyed on the pair — the same pair is one thread
 *     whichever company context started it, and whichever side wrote first
 *   · colleagues do not share: an owner cannot read a recruiter's thread, and two employees
 *     writing to one candidate hold two threads
 *   · a CANDIDATE can start one — with a person who chose to be listed on a published page —
 *     and cannot with anyone else (absent, not forbidden)
 *   · the request model: pending until the recipient answers; replying accepts; declining closes
 *     the thread to the starter and can be reopened by the decliner; reporting closes it to the
 *     reported party; the starter cannot turn an unanswered request into a monologue
 *   · a company block bites on every person at that company, in both directions, mid-conversation
 *   · per-person limits (new conversations per day, messages per minute) return 429
 *   · the public team listing and the member's own opt-in switch
 *   · the data export carries a recruiter's conversations even without a candidate profile
 *
 * HTTP-level throughout, so the routes, validation and authorization are exercised as deployed.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  COMPANY_ROLES,
  COMPANY_STATUS,
  MEMBERSHIP_STATUS,
  MESSAGING_LIMITS,
} from '@evallo/shared';
import { createApp } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { VerificationToken } from '../../src/modules/auth/verificationToken.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { AuditEvent } from '../../src/modules/audit/auditEvent.model.js';
import {
  Conversation,
  pairKeyFor,
  sortedPair,
} from '../../src/modules/messaging/conversation.model.js';
import { Message } from '../../src/modules/messaging/message.model.js';

let server;
let baseUrl;

const CARA = 'dm-cara-candidate@example.com';
const ANA = 'dm-ana-owner@example.com';
const BEN = 'dm-ben-recruiter@example.com';
const VIC = 'dm-vic-viewer@example.com';
const DEE = 'dm-dee-outsider@example.com';
const ALL_EMAILS = [CARA, ANA, BEN, VIC, DEE];
const PASSWORD = 'Password123';

const ACME = 'dm-acme-tutoring';
const BRIGHT = 'dm-bright-schools';

const jsonPost = (path, body) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const authGet = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });

const authSend = (method) => (path, token, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const authPost = authSend('POST');
const authPut = authSend('PUT');
const authPatch = authSend('PATCH');

const bodyOf = async (res) => (await res.json()).data;
const errorOf = async (res) => (await res.json()).error;

async function onboard(email, patch = {}) {
  await jsonPost('/api/auth/signup', { email });
  const user = await User.findOne({ email });
  const { generateVerificationToken } = await import('../../src/lib/tokens.js');
  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: 'email_verification',
    userId: user._id,
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
  if (Object.keys(patch).length) await User.findByIdAndUpdate(user._id, patch);
  return { accessToken: (await res.json()).data.accessToken, user };
}

let cara;
let ana;
let ben;
let vic;
let dee;
let acme;
let bright;
let caraProfile;

/** Ana → Cara, through Acme. The most common first contact. */
const anaWrites = (body = 'Hello from Acme about our maths role.') =>
  authPost('/api/me/conversations', ana.accessToken, {
    candidateId: String(caraProfile._id),
    companyId: acme.slug,
    body,
  });

async function removeFixtures() {
  const users = await User.find({ email: { $in: ALL_EMAILS } }).select('_id').lean();
  const userIds = users.map((u) => u._id);
  const conversations = await Conversation.find({ participants: { $in: userIds } })
    .select('_id')
    .lean();
  await Promise.all([
    Message.deleteMany({ conversationId: { $in: conversations.map((c) => c._id) } }),
    Message.deleteMany({ senderUserId: { $in: userIds } }),
    Conversation.deleteMany({ participants: { $in: userIds } }),
    Conversation.deleteMany({ startedBy: { $in: userIds } }),
    CandidateProfile.deleteMany({ userId: { $in: userIds } }),
    CompanyMember.deleteMany({ userId: { $in: userIds } }),
    AuditEvent.deleteMany({ actorUserId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
  ]);
  await Company.deleteMany({ slug: { $in: [ACME, BRIGHT] } });
  await User.deleteMany({ email: { $in: ALL_EMAILS } });
}

before(async () => {
  await connectDatabase();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await removeFixtures();
  server?.close();
  await disconnectDatabase();
});

beforeEach(async () => {
  await removeFixtures();

  cara = await onboard(CARA, {
    name: 'Cara Candidate',
    location: { country: 'IN', region: 'Bengaluru', timezone: 'Asia/Kolkata' },
  });
  caraProfile = await CandidateProfile.create({
    userId: cara.user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
    publishedAt: new Date(),
    headline: 'Maths teacher',
  });

  ana = await onboard(ANA, { name: 'Ana Owner' });
  ben = await onboard(BEN, { name: 'Ben Recruiter' });
  vic = await onboard(VIC, { name: 'Vic Viewer' });
  dee = await onboard(DEE, { name: 'Dee Outsider' });

  acme = await Company.create({
    slug: ACME,
    name: 'Acme Tutoring',
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    location: { country: 'IN' },
  });
  bright = await Company.create({
    slug: BRIGHT,
    name: 'Bright Schools',
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    location: { country: 'IN' },
  });

  const member = (user, company, role, extra = {}) =>
    CompanyMember.create({
      userId: user._id,
      companyId: company._id,
      role,
      status: MEMBERSHIP_STATUS.ACTIVE,
      acceptedAt: new Date(),
      ...extra,
    });

  /*
   * Showing on the public page is ON by default. Ana and Vic switch it off so the suite can tell
   * "hidden but on the hiring team" (Ana, reachable) from "hidden and not on it" (Vic, not).
   */
  await member(ana.user, acme, COMPANY_ROLES.OWNER, { showOnPublicTeam: false });
  /* Ana also recruits for Bright — the same person, two company contexts. */
  await member(ana.user, bright, COMPANY_ROLES.RECRUITER, { showOnPublicTeam: false });
  await member(ben.user, acme, COMPANY_ROLES.RECRUITER);
  await member(vic.user, acme, COMPANY_ROLES.VIEWER, { showOnPublicTeam: false });
});

/* ── One conversation per pair of people ────────────────────────────────────────────────────── */

describe('one conversation per pair of people', () => {
  test('the same two people hold one thread whichever company context started it', async () => {
    const first = await anaWrites();
    assert.equal(first.status, 201);
    const opened = await bodyOf(first);
    assert.equal(opened.created, true);
    assert.equal(opened.status, 'pending', 'a first message is a request');

    /* Ana again, this time acting for Bright. */
    const again = await bodyOf(
      await authPost('/api/me/conversations', ana.accessToken, {
        candidateId: String(caraProfile._id),
        companyId: bright.slug,
        body: 'Also — Bright Schools is hiring.',
      }),
    );
    assert.equal(again.conversationId, opened.conversationId, 'same two people, same thread');
    assert.equal(again.created, false);
    assert.equal(await Conversation.countDocuments({ participants: ana.user._id }), 1);

    const stored = await Conversation.findById(opened.conversationId).lean();
    assert.deepEqual(
      stored.participants.map(String),
      sortedPair(ana.user._id, cara.user._id),
      'participants are the two user ids, in canonical order',
    );
    assert.equal(stored.pairKey, pairKeyFor(ana.user._id, cara.user._id));
    assert.equal(String(stored.origin.companyId), String(acme._id), 'the first context is kept');
  });

  test('and the same thread whichever side wrote first', async () => {
    /* Cara writes to Ben (listed), then Ben writes to Cara through Acme. */
    const fromCara = await bodyOf(
      await authPost('/api/me/conversations', cara.accessToken, {
        recipientUserId: String(ben.user._id),
        body: 'Hi Ben — I saw you on the Acme page.',
      }),
    );
    const fromBen = await bodyOf(
      await authPost('/api/me/conversations', ben.accessToken, {
        candidateId: String(caraProfile._id),
        companyId: acme.slug,
        body: 'Hi Cara!',
      }),
    );
    assert.equal(fromBen.conversationId, fromCara.conversationId);
    assert.equal(fromBen.status, 'accepted', 'the recipient writing back accepts the request');
  });

  test('two colleagues writing to one candidate hold two private threads', async () => {
    const anas = await bodyOf(await anaWrites());
    const bens = await bodyOf(
      await authPost('/api/me/conversations', ben.accessToken, {
        candidateId: String(caraProfile._id),
        companyId: acme.slug,
        body: 'Hello from Ben.',
      }),
    );
    assert.notEqual(anas.conversationId, bens.conversationId);

    /* Cara sees two people; each of them sees only their own. */
    const caraInbox = await bodyOf(await authGet('/api/me/conversations', cara.accessToken));
    assert.deepEqual(
      caraInbox.conversations.map((row) => row.other.name).sort(),
      ['Ana Owner', 'Ben Recruiter'],
    );
    assert.equal(caraInbox.pendingRequests, 2);

    const anaInbox = await bodyOf(await authGet('/api/me/conversations', ana.accessToken));
    assert.equal(anaInbox.conversations.length, 1);
    assert.equal(
      (await authGet(`/api/me/conversations/${bens.conversationId}`, ana.accessToken)).status,
      404,
      "an owner cannot open a recruiter's thread — absent, not forbidden",
    );
    assert.equal(
      (
        await authPost(`/api/me/conversations/${bens.conversationId}/messages`, ana.accessToken, {
          body: 'Let me in',
        })
      ).status,
      404,
    );
  });

  test('you cannot message yourself', async () => {
    const res = await authPost('/api/me/conversations', ana.accessToken, {
      recipientUserId: String(ana.user._id),
      body: 'Note to self',
    });
    assert.equal(res.status, 400);
  });

  test('a recipient must be named exactly once, and a candidate needs a company context', async () => {
    assert.equal(
      (await authPost('/api/me/conversations', ana.accessToken, { body: 'To nobody' })).status,
      400,
    );
    assert.equal(
      (
        await authPost('/api/me/conversations', ana.accessToken, {
          candidateId: String(caraProfile._id),
          body: 'No company context',
        })
      ).status,
      400,
    );
  });
});

/* ── The candidate can start one ────────────────────────────────────────────────────────────── */

describe('a candidate starting a conversation', () => {
  test('reaches a person listed on a published company page', async () => {
    const res = await authPost('/api/me/conversations', cara.accessToken, {
      recipientUserId: String(ben.user._id),
      body: 'Hi Ben, are you hiring maths teachers?',
    });
    assert.equal(res.status, 201);
    const data = await bodyOf(res);
    assert.equal(data.created, true);

    const benInbox = await bodyOf(await authGet('/api/me/conversations', ben.accessToken));
    assert.equal(benInbox.conversations.length, 1);
    assert.equal(benInbox.conversations[0].isRequest, true);
    assert.equal(benInbox.conversations[0].other.name, 'Cara Candidate');
    assert.equal(benInbox.conversations[0].company.name, 'Acme Tutoring', 'the listing is the context');
    assert.equal(benInbox.unreadTotal, 1);
  });

  test('reaches the hiring team even when they hide from the public page', async () => {
    /* Ana is an owner who switched the public listing off — a signed-in candidate can still write. */
    const res = await authPost('/api/me/conversations', cara.accessToken, {
      recipientUserId: String(ana.user._id),
      body: 'Hi Ana',
    });
    assert.equal(res.status, 201);
  });

  test('cannot reach someone who is neither on the hiring team nor shown (absent, not forbidden)', async () => {
    /* Vic is a viewer — no message:send — and hidden. Nothing invited a conversation. */
    const res = await authPost('/api/me/conversations', cara.accessToken, {
      recipientUserId: String(vic.user._id),
      body: 'Hi Vic',
    });
    assert.equal(res.status, 404);
    assert.equal(await Conversation.countDocuments({ participants: cara.user._id }), 0);
  });

  test('cannot reach a listed person whose company is not published', async () => {
    await Company.updateOne({ _id: acme._id }, { $set: { status: COMPANY_STATUS.DRAFT } });
    const res = await authPost('/api/me/conversations', cara.accessToken, {
      recipientUserId: String(ben.user._id),
      body: 'Hi Ben',
    });
    assert.equal(res.status, 404);
  });

  test('cannot reach an account that does not exist', async () => {
    const res = await authPost('/api/me/conversations', cara.accessToken, {
      recipientUserId: String(new mongoose.Types.ObjectId()),
      body: 'Hello?',
    });
    assert.equal(res.status, 404);
  });
});

/* ── Company context rules ──────────────────────────────────────────────────────────────────── */

describe('starting through a company', () => {
  test('requires message:send at that company — a viewer is refused', async () => {
    const res = await authPost('/api/me/conversations', vic.accessToken, {
      candidateId: String(caraProfile._id),
      companyId: acme.slug,
      body: 'Hello from a viewer',
    });
    assert.equal(res.status, 403);
  });

  test('requires membership — an outsider sees no such company', async () => {
    const res = await authPost('/api/me/conversations', dee.accessToken, {
      candidateId: String(caraProfile._id),
      companyId: acme.slug,
      body: 'Hello from outside',
    });
    assert.equal(res.status, 404);
  });

  test('requires the candidate to be visible to that company', async () => {
    await CandidateProfile.updateOne(
      { _id: caraProfile._id },
      { $set: { status: CANDIDATE_VISIBILITY.PRIVATE } },
    );
    assert.equal((await anaWrites()).status, 404);
  });

  test('a colleague at the same company can always be written to', async () => {
    const res = await authPost('/api/me/conversations', ana.accessToken, {
      recipientUserId: String(vic.user._id),
      companyId: acme.slug,
      body: 'Vic, can you review this candidate?',
    });
    assert.equal(res.status, 201);
  });

  test('a sender without a name is asked to add one first', async () => {
    await User.updateOne({ _id: ana.user._id }, { $unset: { name: '' } });
    const res = await anaWrites();
    assert.equal(res.status, 400);
    assert.ok((await errorOf(res)).message.includes('name'));
  });
});

/* ── The request model ──────────────────────────────────────────────────────────────────────── */

describe('message requests (PRD §11.2)', () => {
  test('replying accepts; unread and read receipts are per person', async () => {
    const { conversationId } = await bodyOf(await anaWrites());

    const caraInbox = await bodyOf(await authGet('/api/me/conversations', cara.accessToken));
    assert.equal(caraInbox.conversations[0].unread, 1);
    assert.equal(caraInbox.conversations[0].isRequest, true);

    /* Cara opens it: her unread clears, Ana's message is marked read. */
    const opened = await bodyOf(await authGet(`/api/me/conversations/${conversationId}`, cara.accessToken));
    assert.equal(opened.conversation.unread, 0);
    assert.equal(opened.messages[0].mine, false);
    assert.equal(opened.messages[0].senderName, 'Ana Owner');
    assert.equal(opened.messages[0].readAt, null, 'read receipts are for the author only');

    const asAna = await bodyOf(await authGet(`/api/me/conversations/${conversationId}`, ana.accessToken));
    assert.ok(asAna.messages[0].readAt, 'Ana sees that Cara has read it');

    /* Cara replies: the request is accepted and Ana has one unread. */
    const reply = await authPost(`/api/me/conversations/${conversationId}/messages`, cara.accessToken, {
      body: 'Yes, tell me more.',
    });
    assert.equal(reply.status, 201);
    assert.equal((await bodyOf(reply)).status, 'accepted');

    const summary = await bodyOf(await authGet('/api/me/conversations/summary', ana.accessToken));
    assert.deepEqual(summary, { unreadTotal: 1, pendingRequests: 0 });
  });

  test('only the recipient can accept or decline', async () => {
    const { conversationId } = await bodyOf(await anaWrites());
    const res = await authPost(`/api/me/conversations/${conversationId}/respond`, ana.accessToken, {
      accepted: true,
    });
    assert.equal(res.status, 400, 'the starter already made their choice by writing');
  });

  test('declining closes the thread to the starter; the decliner can reopen it by writing', async () => {
    const { conversationId } = await bodyOf(await anaWrites());

    const declined = await bodyOf(
      await authPost(`/api/me/conversations/${conversationId}/respond`, cara.accessToken, {
        accepted: false,
      }),
    );
    assert.equal(declined.status, 'declined');
    assert.equal(declined.muted, true, 'declining implies not wanting to be prompted');

    const blocked = await authPost(`/api/me/conversations/${conversationId}/messages`, ana.accessToken, {
      body: 'Please?',
    });
    assert.equal(blocked.status, 403);

    const anaInbox = await bodyOf(await authGet('/api/me/conversations', ana.accessToken));
    assert.equal(anaInbox.conversations[0].closed, true);
    assert.equal(anaInbox.conversations[0].closedReason, 'declined');

    /* Cara changes her mind and writes back — that reopens it. */
    const reopened = await authPost(`/api/me/conversations/${conversationId}/messages`, cara.accessToken, {
      body: 'Actually, let us talk.',
    });
    assert.equal(reopened.status, 201);
    assert.equal((await bodyOf(reopened)).status, 'accepted');
    assert.equal(
      (
        await authPost(`/api/me/conversations/${conversationId}/messages`, ana.accessToken, {
          body: 'Great!',
        })
      ).status,
      201,
    );
    assert.equal(await Message.countDocuments({ conversationId }), 3, 'nothing was deleted');
  });

  test('a request cannot become a monologue, until the recipient answers', async () => {
    let res;
    for (let i = 0; i < MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP; i += 1) {
      res = await anaWrites(`Message ${i + 1}`);
      assert.equal(res.status, 201);
    }
    const { conversationId } = await bodyOf(res);

    const overflow = await anaWrites('One more');
    assert.equal(overflow.status, 400);
    assert.ok((await errorOf(overflow)).details?.body);

    const anaInbox = await bodyOf(await authGet('/api/me/conversations', ana.accessToken));
    assert.equal(anaInbox.conversations[0].closedReason, 'awaiting_reply');

    await authPost(`/api/me/conversations/${conversationId}/respond`, cara.accessToken, {
      accepted: true,
    });
    assert.equal((await anaWrites('Thank you for accepting.')).status, 201);
  });

  test('reporting closes the thread to the reported party and keeps the record', async () => {
    const { conversationId } = await bodyOf(await anaWrites('Something inappropriate.'));

    const reported = await authPost(`/api/me/conversations/${conversationId}/report`, cara.accessToken, {
      reason: 'Inappropriate outreach',
    });
    assert.equal(reported.status, 200);

    assert.equal(
      (
        await authPost(`/api/me/conversations/${conversationId}/messages`, ana.accessToken, {
          body: 'Wait—',
        })
      ).status,
      403,
    );

    const asCara = await authGet(`/api/me/conversations/${conversationId}`, cara.accessToken);
    assert.equal(asCara.status, 200, 'the reporter keeps the evidence');
    assert.equal((await bodyOf(asCara)).conversation.reportedByMe, true);
    assert.equal(await Message.countDocuments({ conversationId }), 1);
  });

  test('mute is per person and hides nothing', async () => {
    const { conversationId } = await bodyOf(await anaWrites());

    const muted = await bodyOf(
      await authPut(`/api/me/conversations/${conversationId}/mute`, cara.accessToken, { muted: true }),
    );
    assert.equal(muted.muted, true);

    const caraInbox = await bodyOf(await authGet('/api/me/conversations', cara.accessToken));
    assert.equal(caraInbox.conversations[0].muted, true);
    const anaInbox = await bodyOf(await authGet('/api/me/conversations', ana.accessToken));
    assert.equal(anaInbox.conversations[0].muted, false, "Cara's mute is not Ana's");
  });
});

/* ── Blocks ─────────────────────────────────────────────────────────────────────────────────── */

describe('company blocks (CAN-04, PRD §16.3)', () => {
  test('bite on every person at the blocked company, in both directions, mid-conversation', async () => {
    const { conversationId } = await bodyOf(await anaWrites());

    await authPost('/api/me/candidate-profile/blocked-companies', cara.accessToken, {
      companyId: String(acme._id),
    });

    assert.equal(
      (
        await authPost(`/api/me/conversations/${conversationId}/messages`, ana.accessToken, {
          body: 'Hello?',
        })
      ).status,
      403,
      'Ana works at the blocked company',
    );
    assert.equal(
      (
        await authPost(`/api/me/conversations/${conversationId}/messages`, cara.accessToken, {
          body: 'Go away',
        })
      ).status,
      403,
      'the thread is closed for the blocker too',
    );
    assert.equal(
      (
        await authPost('/api/me/conversations', ben.accessToken, {
          candidateId: String(caraProfile._id),
          companyId: acme.slug,
          body: 'Hi from Ben',
        })
      ).status,
      404,
      'a colleague cannot start a fresh one either',
    );
    assert.equal(
      (
        await authPost('/api/me/conversations', cara.accessToken, {
          recipientUserId: String(ben.user._id),
          body: 'Hi Ben',
        })
      ).status,
      404,
      'nor can the blocker reach the listed colleague',
    );
  });
});

/* ── Limits ─────────────────────────────────────────────────────────────────────────────────── */

describe('per-person limits (PRD §16.3)', () => {
  test('new conversations per day', async () => {
    /* Fill the allowance with threads to strangers, written directly. */
    const filler = [];
    for (let i = 0; i < MESSAGING_LIMITS.NEW_CONVERSATIONS_PER_DAY; i += 1) {
      const other = new mongoose.Types.ObjectId();
      filler.push({
        participants: sortedPair(ana.user._id, other),
        pairKey: pairKeyFor(ana.user._id, other),
        startedBy: ana.user._id,
        members: [{ userId: ana.user._id }, { userId: other }],
      });
    }
    await Conversation.insertMany(filler);

    const res = await anaWrites();
    assert.equal(res.status, 429);
    assert.equal((await errorOf(res)).code, 'RATE_LIMITED');
  });

  test('messages per minute', async () => {
    const { conversationId } = await bodyOf(await anaWrites());
    const burst = [];
    for (let i = 0; i < MESSAGING_LIMITS.MESSAGES_PER_MINUTE; i += 1) {
      burst.push({ conversationId, senderUserId: ana.user._id, body: `burst ${i}` });
    }
    await Message.insertMany(burst);

    await authPost(`/api/me/conversations/${conversationId}/respond`, cara.accessToken, {
      accepted: true,
    });
    const res = await authPost(`/api/me/conversations/${conversationId}/messages`, ana.accessToken, {
      body: 'one more',
    });
    assert.equal(res.status, 429);
  });
});

/* ── Public team listing ────────────────────────────────────────────────────────────────────── */

describe('the public team listing', () => {
  test('shows everyone who has not hidden themselves, with the id a candidate messages', async () => {
    const page = await bodyOf(await fetch(`${baseUrl}/api/public/companies/${ACME}`));
    assert.deepEqual(
      page.team.map((member) => member.name),
      ['Ben Recruiter'],
      'Ana and Vic switched the listing off; Ben kept the default',
    );
    assert.equal(page.team[0].userId, String(ben.user._id));
    assert.equal(page.team[0].email, undefined, 'never an email address');
  });

  test('a member switches their own listing on and off, and nobody else’s', async () => {
    const on = await authPatch(`/api/companies/${ACME}/members/me`, ana.accessToken, {
      showOnPublicTeam: true,
    });
    assert.equal(on.status, 200);
    assert.deepEqual(await bodyOf(on), { showOnPublicTeam: true });

    const page = await bodyOf(await fetch(`${baseUrl}/api/public/companies/${ACME}`));
    assert.deepEqual(page.team.map((m) => m.name).sort(), ['Ana Owner', 'Ben Recruiter']);

    /* Now Cara can reach Ana too. */
    assert.equal(
      (
        await authPost('/api/me/conversations', cara.accessToken, {
          recipientUserId: String(ana.user._id),
          body: 'Hi Ana',
        })
      ).status,
      201,
    );

    const off = await authPatch(`/api/companies/${ACME}/members/me`, ana.accessToken, {
      showOnPublicTeam: false,
    });
    assert.deepEqual(await bodyOf(off), { showOnPublicTeam: false });

    /* A viewer may list themselves too — it is consent about oneself, not a permission. */
    assert.equal(
      (
        await authPatch(`/api/companies/${ACME}/members/me`, vic.accessToken, {
          showOnPublicTeam: true,
        })
      ).status,
      200,
    );
    /* An outsider has no membership to switch. */
    assert.equal(
      (
        await authPatch(`/api/companies/${ACME}/members/me`, dee.accessToken, {
          showOnPublicTeam: true,
        })
      ).status,
      404,
    );
    /* The dashboard reports the caller's own flag. */
    const dashboard = await bodyOf(await authGet(`/api/companies/${ACME}/dashboard`, vic.accessToken));
    assert.equal(dashboard.yourMembership.showOnPublicTeam, true);
  });
});

/* ── Export and access control ──────────────────────────────────────────────────────────────── */

describe('cross-cutting', () => {
  test('the data export carries a recruiter’s conversations, unnamed on the other side', async () => {
    const { conversationId } = await bodyOf(await anaWrites('Exportable.'));
    await authPost(`/api/me/conversations/${conversationId}/messages`, cara.accessToken, {
      body: 'Reply.',
    });

    /* The export is a downloadable document, not an envelope — the body IS the data. */
    const exported = await (await authGet('/api/me/settings/export', ana.accessToken)).json();
    assert.equal(exported.conversations.length, 1);
    assert.equal(exported.conversations[0].company, 'Acme Tutoring');
    assert.equal(exported.conversations[0].startedByMe, true);
    assert.deepEqual(
      exported.conversations[0].messages.map((m) => m.from),
      ['me', 'them'],
    );
    assert.ok(!JSON.stringify(exported.conversations).includes('Cara'), 'the other person is not named');
  });

  test('every messaging route rejects an unauthenticated caller', async () => {
    for (const [method, path] of [
      ['GET', '/api/me/conversations'],
      ['GET', '/api/me/conversations/summary'],
      ['POST', '/api/me/conversations'],
    ]) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? '{}' : undefined,
      });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  test('the old company-scoped messaging routes no longer exist', async () => {
    assert.equal(
      (await authGet(`/api/companies/${ACME}/conversations`, ana.accessToken)).status,
      404,
    );
    assert.equal(
      (
        await authPost(`/api/companies/${ACME}/conversations`, ana.accessToken, {
          candidateId: String(caraProfile._id),
          body: 'Old route',
        })
      ).status,
      404,
    );
  });
});
