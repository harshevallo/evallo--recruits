/**
 * REC-07 — replace the companyMembers uniqueness indexes.
 *
 * `userId_1_companyId_1` was created unique and unfiltered. An invitation to an address with no
 * account carries no userId, so every such row would index as (null, companyId) and the second
 * one at any company would be rejected. Mongoose cannot alter an existing index's options — it
 * reports IndexOptionsConflict and moves on — so the old index has to be dropped here.
 *
 * Idempotent: safe to run repeatedly, and safe on a database that has never had the old index.
 *
 *   node apps/api/scripts/migrate-invitation-indexes.mjs
 */

/* eslint-disable no-console -- a CLI migration reports to stdout; the app logger is for the server. */

import 'dotenv/config';
import mongoose from 'mongoose';

const OLD = 'userId_1_companyId_1';

const uri = process.env.MONGODB_CLOUD;
if (!uri) {
  console.error('MONGODB_CLOUD is not set.');
  process.exit(1);
}

await mongoose.connect(uri);
const collection = mongoose.connection.db.collection('companyMembers');
console.log(`database: ${mongoose.connection.name}`);

const before = await collection.indexes();
const existing = before.find((index) => index.name === OLD);

if (existing && !existing.partialFilterExpression) {
  /*
   * Refuse to drop uniqueness while a duplicate could slip in unnoticed. There should never be
   * one — the index has been enforcing it — but a failed check here is far cheaper than
   * discovering two memberships for the same person afterwards.
   */
  const duplicates = await collection
    .aggregate([
      { $match: { userId: { $type: 'objectId' } } },
      { $group: { _id: { userId: '$userId', companyId: '$companyId' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicates.length > 0) {
    console.error('Refusing to migrate — duplicate memberships exist:', duplicates);
    await mongoose.disconnect();
    process.exit(1);
  }

  await collection.dropIndex(OLD);
  console.log(`dropped ${OLD} (was unique, unfiltered)`);
} else {
  console.log(`${OLD} is already partial or absent — nothing to drop`);
}

await collection.createIndex(
  { userId: 1, companyId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);

await collection.createIndex(
  { companyId: 1, invitedEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'invited', invitedEmail: { $type: 'string' } },
  },
);

for (const index of await collection.indexes()) {
  console.log(
    ` ${index.name}`,
    index.unique ? 'unique' : '',
    index.partialFilterExpression ? `partial ${JSON.stringify(index.partialFilterExpression)}` : '',
  );
}

await mongoose.disconnect();
