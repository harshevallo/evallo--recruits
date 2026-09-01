/**
 * ADR-024 step 2 — widen the conversations uniqueness index to include the employee.
 *
 * `candidateId_1_companyId_1` enforced one thread per candidate per company. ADR-024 makes a
 * thread candidate-to-one-employee, so the key gains `recruiterUserId`. Mongoose creates indexes it
 * declares but never drops ones it stops declaring, and this project does not call `syncIndexes()`
 * — so editing the model alone leaves the old two-key index in place, still forbidding the
 * per-person threads step 3 exists to create. This script is what actually removes it.
 *
 * ── Create first, drop second ─────────────────────────────────────────────────────────────────
 *
 * The ADR described dropping and recreating back to back. Creating first is strictly better and is
 * what this does: the new key is a superset of the old one, so every document already legal stays
 * legal and the build cannot fail on existing data. While both exist the stricter old index still
 * governs, so behaviour is unchanged mid-migration; dropping it is the single moment anything
 * relaxes. There is never a window with no uniqueness constraint at all.
 *
 * Idempotent: safe to run repeatedly, and safe on a database that never had the old index.
 *
 *   cd apps/api && node scripts/migrate-conversation-indexes.mjs
 *
 * Run from `apps/api` — `dotenv/config` resolves `.env` from the working directory, and that is
 * where this project keeps it.
 */

/* eslint-disable no-console -- a CLI migration reports to stdout; the app logger is for the server. */

import 'dotenv/config';
import mongoose from 'mongoose';

const OLD = 'candidateId_1_companyId_1';
const NEW_KEY = { candidateId: 1, companyId: 1, recruiterUserId: 1 };

const uri = process.env.MONGODB_CLOUD;
if (!uri) {
  console.error('MONGODB_CLOUD is not set.');
  process.exit(1);
}

await mongoose.connect(uri);
const collection = mongoose.connection.db.collection('conversations');
console.log(`database: ${mongoose.connection.name}`);

/*
 * Refuse to touch anything if two threads already share the new key.
 *
 * This should be impossible — the old index has been enforcing a stricter rule — so a hit here
 * means an assumption is wrong, and finding that out before dropping a uniqueness constraint is
 * the entire point. `$ifNull` folds a missing path and an explicit null together, which is exactly
 * how MongoDB will index them.
 */
const duplicates = await collection
  .aggregate([
    {
      $group: {
        _id: {
          candidateId: '$candidateId',
          companyId: '$companyId',
          recruiterUserId: { $ifNull: ['$recruiterUserId', null] },
        },
        n: { $sum: 1 },
      },
    },
    { $match: { n: { $gt: 1 } } },
  ])
  .toArray();

if (duplicates.length > 0) {
  console.error('Refusing to migrate — duplicate conversations exist:', duplicates);
  await mongoose.disconnect();
  process.exit(1);
}

/* Create the wider index first, so uniqueness is never absent. */
const created = await collection.createIndex(NEW_KEY, { unique: true });
console.log(`ensured ${created} (unique)`);

const before = await collection.indexes();
if (before.some((index) => index.name === OLD)) {
  await collection.dropIndex(OLD);
  console.log(`dropped ${OLD}`);
} else {
  console.log(`${OLD} is already absent — nothing to drop`);
}

console.log('final index state:');
for (const index of await collection.indexes()) {
  console.log(` ${index.name}`, index.unique ? 'unique' : '');
}

await mongoose.disconnect();
