/**
 * ADR-025 — rewrite pre-existing conversations into two-person threads.
 *
 * Before ADR-025 a conversation was keyed on a candidate PROFILE and a COMPANY (later plus an
 * optional employee). Now it is keyed on two USERS. This script turns each legacy row into one or
 * more person-to-person conversations, repairs the messages beneath it, and replaces the indexes.
 *
 *   cd apps/api && node scripts/migrate-conversations-to-direct.mjs           # report only
 *   cd apps/api && node scripts/migrate-conversations-to-direct.mjs --apply   # write
 *
 * Run from `apps/api` — `dotenv/config` resolves `.env` from the working directory.
 *
 * ── What happens to each legacy row ───────────────────────────────────────────────────────────
 *
 * The candidate's user is read from their profile. The person on the other side is whoever wrote
 * the company-side messages (`recruiterUserId` when set, else the distinct `senderUserId`s):
 *
 *   one attributable person      → the row is rewritten IN PLACE, keeping its `_id` so every
 *                                  message and every saved link still resolves
 *   several people               → SPLIT: one conversation per person. Each keeps that person's
 *                                  own messages and a copy of the candidate's, so nobody's words
 *                                  are put under someone else's name and nobody loses what they
 *                                  themselves wrote or received. The first person keeps the
 *                                  original `_id`.
 *   two rows for the same pair   → MERGED into one, messages moved, counts recomputed
 *   nobody attributable          → left in place, flagged `legacy.unmigrated` with the reason;
 *                                  invisible to the application (it has no `participants`) and
 *                                  listed in the report for a human to decide
 *   the same person on both sides (one account that is both the candidate and the recruiter)
 *                                → flagged the same way: a conversation with oneself is not one
 *
 * Messages: `senderUserId` is backfilled (candidate-side messages → the candidate's user; an
 * unattributed company-side message → the one attributable person, and only when there is exactly
 * one); `senderType` is removed.
 *
 * ── Indexes ───────────────────────────────────────────────────────────────────────────────────
 *
 * The legacy unique index `{ candidateId, companyId, recruiterUserId }` MUST be dropped: every new
 * document keys as `(null, null, null)` under it and the second one would be refused. Mongoose never
 * drops an index it stops declaring, so this script does. The new indexes are created here as well
 * so the first request after deploy does not pay for them.
 *
 * ── Ordering ──────────────────────────────────────────────────────────────────────────────────
 *
 * Stop every API instance running pre-ADR-025 code BEFORE running with `--apply`: an old instance
 * recreates the legacy indexes on boot (`autoIndex`), silently undoing step one. Then deploy the
 * new code. Idempotent — safe to re-run; already-converted rows are skipped.
 */

/* eslint-disable no-console -- a CLI migration reports to stdout; the app logger is for the server. */

import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const PREVIEW_LENGTH = 200;

const uri = process.env.MONGODB_CLOUD;
if (!uri) {
  console.error('MONGODB_CLOUD is not set.');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
const conversations = db.collection('conversations');
const messages = db.collection('messages');
const profiles = db.collection('candidateProfiles');

console.log(`database: ${mongoose.connection.name}${APPLY ? '' : '  (DRY RUN — pass --apply to write)'}`);

const str = (value) => (value == null ? null : String(value));
const pairKeyFor = (a, b) => [str(a), str(b)].sort().join(':');
const sortedPair = (a, b) =>
  [str(a), str(b)].sort().map((id) => new mongoose.Types.ObjectId(id));

const report = { converted: 0, split: 0, merged: 0, unmigrated: [], skipped: 0 };

/**
 * Pairs written during THIS run, so a dry run reports a merge where an apply run would perform
 * one. Without it two legacy rows for the same pair both print "convert in place" under `--dry-run`
 * and only the real run reveals that the second is a merge.
 */
const claimed = new Map();

/** Recomputes the denormalised fields of one conversation from its messages. */
async function recompute(conversationId, { status, members, extra = {} }) {
  const rows = await messages
    .find({ conversationId })
    .sort({ createdAt: 1 })
    .project({ senderUserId: 1, body: 1, createdAt: 1 })
    .toArray();

  const first = rows[0];
  const last = rows[rows.length - 1];
  const startedBy = first?.senderUserId ?? members[0].userId;
  const recipient = members.find((m) => str(m.userId) !== str(startedBy))?.userId;

  /* Anyone who has written back has accepted, whatever the legacy state said. */
  const recipientWrote = rows.some((row) => str(row.senderUserId) === str(recipient));
  const resolvedStatus = recipientWrote ? 'accepted' : status;

  const set = {
    startedBy,
    status: resolvedStatus,
    members,
    messageCount: rows.length,
    lastMessageAt: last?.createdAt ?? null,
    lastMessagePreview: last ? String(last.body ?? '').slice(0, PREVIEW_LENGTH) : null,
    lastMessageSenderId: last?.senderUserId ?? null,
    ...extra,
  };

  if (APPLY) await conversations.updateOne({ _id: conversationId }, { $set: set });
  return set;
}

function memberState(userId, unread = 0, mutedAt = null) {
  return { userId, unread: Math.max(0, Number(unread) || 0), mutedAt: mutedAt ?? null, lastReadAt: null };
}

const LEGACY_FIELDS = {
  candidateId: '',
  companyId: '',
  recruiterUserId: '',
  interestId: '',
  lastMessageSenderType: '',
  candidateUnread: '',
  companyUnread: '',
  candidateState: '',
  candidateRespondedAt: '',
  mutedAt: '',
  participantKey: '',
  legacy: '',
};

async function flagUnmigrated(row, reason) {
  report.unmigrated.push({ id: str(row._id), reason });
  if (APPLY) {
    await conversations.updateOne(
      { _id: row._id },
      { $set: { legacy: { unmigrated: true, reason } } },
    );
  }
}

/**
 * Writes one person-to-person conversation for a legacy row and a counterpart.
 *
 * @param {object} row            the legacy document
 * @param {ObjectId} candidateUser
 * @param {ObjectId} counterpart
 * @param {object[]} rowMessages  every message of the legacy row, oldest first
 * @param {boolean} reuseId       whether this counterpart keeps the legacy `_id`
 */
async function writeTarget(row, candidateUser, counterpart, rowMessages, reuseId) {
  const pairKey = pairKeyFor(candidateUser, counterpart);
  const mine = rowMessages.filter(
    (m) => str(m.senderUserId) === str(counterpart) || str(m.senderUserId) === str(candidateUser),
  );

  const candidateMember = memberState(candidateUser, row.candidateUnread, row.mutedAt);
  const otherMember = memberState(counterpart, row.companyUnread, null);
  const legacyStatus = ['pending', 'accepted', 'declined'].includes(row.candidateState)
    ? row.candidateState
    : 'pending';

  const common = {
    participants: sortedPair(candidateUser, counterpart),
    pairKey,
    respondedAt: row.candidateRespondedAt ?? null,
    origin: {
      companyId: row.companyId ?? null,
      candidateId: row.candidateId ?? null,
      interestId: row.interestId ?? null,
    },
    reportedAt: row.reportedAt ?? null,
    reportedBy: row.reportedAt ? candidateUser : null,
    reportReason: row.reportReason ?? null,
  };

  /* Already a two-person thread for this pair — in the database, or earlier in this run? Merge. */
  const existing =
    (await conversations.findOne({ pairKey })) ??
    (claimed.has(pairKey) ? { _id: claimed.get(pairKey), members: [], status: 'pending' } : null);
  if (existing && str(existing._id) !== str(row._id)) {
    console.log(`  merge ${row._id} → ${existing._id} (${pairKey})`);
    report.merged += 1;
    if (APPLY) {
      await messages.updateMany(
        { _id: { $in: mine.map((m) => m._id) } },
        { $set: { conversationId: existing._id } },
      );
      if (reuseId) await conversations.deleteOne({ _id: row._id });
    }

    /*
     * A target written earlier in THIS run has no member state yet (it is computed once, after
     * every row that feeds it has been seen), so start from zero and let the caller sum. A target
     * from a previous run carries real state, which is added to.
     */
    const base = existing.members?.length
      ? existing.members
      : [memberState(candidateUser), memberState(counterpart)];
    const members = base.map((m) => {
      if (str(m.userId) === str(candidateUser)) {
        return {
          ...m,
          unread: (m.unread ?? 0) + candidateMember.unread,
          mutedAt: m.mutedAt ?? candidateMember.mutedAt,
        };
      }
      if (str(m.userId) === str(counterpart)) {
        return { ...m, unread: (m.unread ?? 0) + otherMember.unread };
      }
      return m;
    });
    const status =
      existing.status === 'accepted' || legacyStatus === 'accepted'
        ? 'accepted'
        : existing.status === 'declined' || legacyStatus === 'declined'
          ? 'declined'
          : 'pending';
    return { targetId: existing._id, status, members };
  }

  let targetId = row._id;
  if (reuseId) {
    console.log(`  convert ${row._id} in place (${pairKey})`);
    if (APPLY) {
      await conversations.updateOne(
        { _id: row._id },
        { $set: { ...common, createdAt: row.createdAt, updatedAt: new Date() }, $unset: LEGACY_FIELDS },
      );
    }
  } else {
    targetId = new mongoose.Types.ObjectId();
    console.log(`  split  ${row._id} → new ${targetId} (${pairKey})`);
    report.split += 1;
    if (APPLY) {
      await conversations.insertOne({
        _id: targetId,
        ...common,
        createdAt: row.createdAt,
        updatedAt: new Date(),
        __v: 0,
      });
      /* This person's own messages move; the candidate's are copied so both sides stay complete. */
      const theirs = mine.filter((m) => str(m.senderUserId) === str(counterpart));
      const candidates = mine.filter((m) => str(m.senderUserId) === str(candidateUser));
      if (theirs.length) {
        await messages.updateMany(
          { _id: { $in: theirs.map((m) => m._id) } },
          { $set: { conversationId: targetId } },
        );
      }
      if (candidates.length) {
        await messages.insertMany(
          candidates.map(({ _id: _omit, senderType: _legacy, ...m }) => ({
            ...m,
            _id: new mongoose.Types.ObjectId(),
            conversationId: targetId,
          })),
        );
      }
    }
  }

  claimed.set(pairKey, targetId);
  report.converted += 1;
  return { targetId, status: legacyStatus, members: [candidateMember, otherMember] };
}

/** Folds a second contribution to the same target into the first: unread sums, status ratchets. */
function combine(prior, next) {
  const members = prior.members.map((m) => {
    const also = next.members.find((n) => str(n.userId) === str(m.userId));
    if (!also) return m;
    return { ...m, unread: (m.unread ?? 0) + (also.unread ?? 0), mutedAt: m.mutedAt ?? also.mutedAt };
  });
  const status =
    prior.status === 'accepted' || next.status === 'accepted'
      ? 'accepted'
      : prior.status === 'declined' || next.status === 'declined'
        ? 'declined'
        : 'pending';
  return { targetId: prior.targetId, status, members };
}

/* ── Legacy indexes — dropped FIRST ──────────────────────────────────────────────────────────── */

/*
 * The old unique index has to go before any row is rewritten, not after. A rewritten row no longer
 * carries `candidateId` / `companyId` / `recruiterUserId`, so under that index it keys as
 * `(null, null, null)` — and the SECOND rewritten row is refused as a duplicate. The rehearsal run
 * against a copy of production failed exactly there, one split in.
 */
const LEGACY_INDEXES = [
  'candidateId_1_companyId_1_recruiterUserId_1',
  'candidateId_1_companyId_1',
  'candidateId_1_lastMessageAt_-1',
  'companyId_1_lastMessageAt_-1',
];

const present = (await conversations.indexes()).map((index) => index.name);
for (const name of LEGACY_INDEXES) {
  if (!present.includes(name)) continue;
  console.log(`drop index ${name}`);
  if (APPLY) await conversations.dropIndex(name);
}

/*
 * "Legacy" means "has no pairKey". One live row already carried a `participants` array from an
 * earlier experiment while still being shaped the old way, so the presence of `participants` alone
 * proves nothing; `pairKey` is written only by the ADR-025 model and this script.
 */
const legacyRows = await conversations
  .find({ pairKey: { $exists: false } })
  .sort({ createdAt: 1 })
  .toArray();

console.log(`legacy conversations: ${legacyRows.length}`);

for (const row of legacyRows) {
  console.log(`\n${row._id}  candidate=${str(row.candidateId)} company=${str(row.companyId)}`);

  const profile = row.candidateId
    ? await profiles.findOne({ _id: row.candidateId }, { projection: { userId: 1 } })
    : null;
  if (!profile?.userId) {
    await flagUnmigrated(row, 'candidate profile not found');
    console.log('  unmigrated: candidate profile not found');
    continue;
  }
  const candidateUser = profile.userId;

  const rowMessages = await messages.find({ conversationId: row._id }).sort({ createdAt: 1 }).toArray();

  /* Who was on the company side? */
  const companySenders = new Set(
    rowMessages
      .filter((m) => m.senderType === 'company' && m.senderUserId)
      .map((m) => str(m.senderUserId)),
  );
  if (row.recruiterUserId) companySenders.add(str(row.recruiterUserId));

  const counterparts = [...companySenders].filter((id) => id !== str(candidateUser));
  if (companySenders.size > 0 && counterparts.length === 0) {
    await flagUnmigrated(row, 'the same person is on both sides');
    console.log('  unmigrated: the same person is on both sides');
    continue;
  }
  if (counterparts.length === 0) {
    await flagUnmigrated(row, 'no attributable person on the company side');
    console.log('  unmigrated: no attributable person on the company side');
    continue;
  }

  const unattributed = rowMessages.filter((m) => m.senderType === 'company' && !m.senderUserId);
  if (unattributed.length > 0 && counterparts.length > 1) {
    await flagUnmigrated(row, 'unattributed company messages in a multi-person thread');
    console.log('  unmigrated: unattributed company messages in a multi-person thread');
    continue;
  }

  /* Repair message attribution before anything is moved. */
  if (APPLY) {
    await messages.updateMany(
      { conversationId: row._id, senderType: 'candidate' },
      { $set: { senderUserId: candidateUser } },
    );
    if (unattributed.length > 0) {
      await messages.updateMany(
        { conversationId: row._id, senderType: 'company', senderUserId: { $in: [null] } },
        { $set: { senderUserId: new mongoose.Types.ObjectId(counterparts[0]) } },
      );
    }
    await messages.updateMany({ conversationId: row._id }, { $unset: { senderType: '' } });
  }
  for (const m of rowMessages) {
    if (m.senderType === 'candidate') m.senderUserId = candidateUser;
    if (m.senderType === 'company' && !m.senderUserId) {
      m.senderUserId = new mongoose.Types.ObjectId(counterparts[0]);
    }
  }

  /*
   * Move every message first, recompute every target afterwards. A split takes the second
   * person's messages OUT of the in-place target, so counting that target before the split ran
   * would leave its `messageCount` one message too high.
   */
  const targets = new Map();
  for (const [index, counterpart] of counterparts.entries()) {
    const result = await writeTarget(
      row,
      candidateUser,
      new mongoose.Types.ObjectId(counterpart),
      rowMessages,
      index === 0,
    );
    if (!result) continue;
    const key = str(result.targetId);
    targets.set(key, targets.has(key) ? combine(targets.get(key), result) : result);
  }
  for (const target of targets.values()) {
    await recompute(target.targetId, { status: target.status, members: target.members });
  }
}

/* ── New indexes ─────────────────────────────────────────────────────────────────────────────── */

if (APPLY) {
  await conversations.createIndex(
    { pairKey: 1 },
    { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } },
  );
  await conversations.createIndex({ participants: 1, lastMessageAt: -1 });
  await conversations.createIndex({ startedBy: 1, createdAt: -1 });
  await messages.createIndex({ senderUserId: 1, createdAt: -1 });
  console.log('ensured ADR-025 indexes');
}

console.log('\nsummary:', JSON.stringify(report, null, 2));
if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');

await mongoose.disconnect();
