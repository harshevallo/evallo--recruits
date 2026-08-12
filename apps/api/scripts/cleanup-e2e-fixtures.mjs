/**
 * Removes ONLY end-to-end test fixtures from the configured database.
 *
 * Scope is pinned to two identifiers that no real record can hold, and nothing else:
 *   users      whose email ends `@evallo-test.local` — a reserved, undeliverable test domain
 *   companies  whose name starts `E2E Academy ` — the fixture name used by the E2E harness
 *
 * Everything else is derived from those two id sets, so a real user or a real company can never
 * be selected. Dependent documents are matched by the id fields they hold, per collection.
 *
 * `--include-suite-fixtures` additionally selects the residue the INTEGRATION SUITES leave behind
 * in the shared development database: `@example.com` accounts (RFC 2606 reserved, undeliverable)
 * and `@deleted.invalid` tombstones written by the account-deletion tests. It is opt-in rather
 * than default because it widens the net from one bespoke domain to a general one, and the default
 * should stay the most conservative thing that works.
 *
 * Dry run by default; pass `--apply` to delete.
 *
 *   node apps/api/scripts/cleanup-e2e-fixtures.mjs                             # report only
 *   node apps/api/scripts/cleanup-e2e-fixtures.mjs --apply                     # delete
 *   node apps/api/scripts/cleanup-e2e-fixtures.mjs --include-suite-fixtures    # wider report
 */

/* eslint-disable no-console -- a CLI report writes to stdout; the app logger is for the server. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../.env') });

const APPLY = process.argv.includes('--apply');
const INCLUDE_SUITE = process.argv.includes('--include-suite-fixtures');

await mongoose.connect(process.env.MONGODB_CLOUD);
const db = mongoose.connection.db;
console.log(`connected to ${mongoose.connection.name}\n`);

/** Every pattern here is a reserved or synthetic domain that no real account can hold. */
const emailPatterns = [/@evallo-test\.local$/];
if (INCLUDE_SUITE) emailPatterns.push(/@example\.com$/, /@deleted\.invalid$/);

const users = await db.collection('users').find({ $or: emailPatterns.map((email) => ({ email })) }).project({ _id: 1, email: 1 }).toArray();
const companies = await db.collection('companies').find({ name: /^E2E Academy / }).project({ _id: 1, name: 1, status: 1 }).toArray();

const userIds = users.map((u) => u._id);
const companyIds = companies.map((c) => c._id);

const profiles = await db.collection('candidateProfiles').find({ userId: { $in: userIds } }).project({ _id: 1 }).toArray();
const profileIds = profiles.map((p) => p._id);

const conversations = await db.collection('conversations').find({ $or: [{ companyId: { $in: companyIds } }, { candidateId: { $in: profileIds } }] }).project({ _id: 1 }).toArray();
const conversationIds = conversations.map((c) => c._id);

console.log(`users:        ${users.length}`);
users.forEach((u) => console.log(`  ${u.email}`));
console.log(`companies:    ${companies.length}`);
companies.forEach((c) => console.log(`  ${c.name} (${c.status})`));
console.log(`profiles:     ${profileIds.length}`);
console.log(`conversations:${conversationIds.length}\n`);

/** field name → the id list it may hold. Unknown fields simply never match. */
const idFields = {
  userId: userIds,
  actorUserId: userIds,
  ownerId: userIds,
  senderUserId: userIds,
  invitedByUserId: userIds,
  decidedByUserId: userIds,
  interviewerUserId: userIds,
  authorUserId: userIds,
  companyId: companyIds,
  actorCompanyId: companyIds,
  candidateId: profileIds,
  candidateProfileId: profileIds,
  profileId: profileIds,
  conversationId: conversationIds,
};

const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
let total = 0;

for (const name of collections) {
  if (name === 'users' || name === 'companies') continue;
  const or = Object.entries(idFields)
    .filter(([, ids]) => ids.length)
    .map(([field, ids]) => ({ [field]: { $in: ids } }));
  const filter = { $or: or };
  const count = await db.collection(name).countDocuments(filter);
  if (!count) continue;
  total += count;
  if (APPLY) {
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    console.log(`${name}: deleted ${deletedCount}`);
  } else {
    console.log(`${name}: would delete ${count}`);
  }
}

/*
 * Email-keyed rows that carry no user id (invitations to addresses that never signed up).
 *
 * `verificationTokens` is camelCase — the model sets it explicitly. The lowercase spelling below
 * was never matching anything, so those rows were only ever removed via their `userId`.
 */
const byEmail = { $or: emailPatterns.map((email) => ({ email })) };
const emailFilters = [
  ['companyInvitations', byEmail],
  ['verificationTokens', byEmail],
  ['earlyAccessRequests', byEmail],
];
for (const [name, filter] of emailFilters) {
  if (!collections.includes(name)) continue;
  const count = await db.collection(name).countDocuments(filter);
  if (!count) continue;
  total += count;
  if (APPLY) {
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    console.log(`${name} (by email): deleted ${deletedCount}`);
  } else {
    console.log(`${name} (by email): would delete ${count}`);
  }
}

if (APPLY) {
  const c = await db.collection('companies').deleteMany({ _id: { $in: companyIds } });
  const u = await db.collection('users').deleteMany({ _id: { $in: userIds } });
  console.log(`companies: deleted ${c.deletedCount}`);
  console.log(`users: deleted ${u.deletedCount}`);
  total += c.deletedCount + u.deletedCount;
  console.log(`\nTOTAL deleted: ${total}`);
} else {
  console.log(`\nTOTAL to delete: ${total + companies.length + users.length} (dry run — pass --apply)`);
}

await mongoose.disconnect();
