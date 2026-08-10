/**
 * CAN-02 evidence entries — experience and education (PRD §8.3 sections 4–5, ADR-008).
 *
 * One service for both kinds. They are separate collections (per-item verification will diverge)
 * but the OPERATIONS are identical — list, create, update, remove, all scoped to one candidate —
 * and writing that twice is how the two drift into behaving differently for no reason.
 *
 * Every function takes the candidate's own profile. Nothing here accepts a candidateId from a
 * request: an entry belongs to the person editing it, and the only way to reach another
 * candidate's entries would be to pass their id, so that is never a parameter.
 */

import { ApiError } from '../../lib/ApiError.js';
import { ENTRY_KINDS, providerFor } from './profileEntry.model.js';

function kindOf(kind) {
  const entry = ENTRY_KINDS[kind];
  if (!entry) throw ApiError.notFound('Unknown profile section.');
  return entry;
}

/** Strips anything the caller may not write, so a crafted body cannot set verificationStatus. */
function pickWritable(kind, input = {}) {
  const values = {};
  for (const field of kind.writable) {
    if (input[field] !== undefined) values[field] = input[field];
  }

  /*
   * "Currently here" and an end date are mutually exclusive claims. Clearing the date when
   * `current` is set means the two can never disagree in storage, so no reader has to decide
   * which one to believe.
   */
  if (values.current === true) values.endDate = null;

  /*
   * `provider` is derived, never accepted. The allow-list decides what may be embedded, so
   * letting a caller name the provider would make the check advisory.
   */
  if (values.url !== undefined) values.provider = providerFor(values.url);

  return values;
}

function toView(doc) {
  const { _id, candidateId, __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  void candidateId;
  void __v;
  return { id: String(_id), ...rest };
}

/** Newest first, with explicit ordering winning where the candidate has set it. */
function sortEntries(entries) {
  return entries.sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')),
  );
}

export async function listEntries(profile, kind) {
  const { model } = kindOf(kind);
  const entries = await model.find({ candidateId: profile._id }).lean();
  return sortEntries(entries).map(toView);
}

/** All entry kinds at once, for the builder's section counts. */
export async function listAllEntries(profile) {
  const kinds = Object.keys(ENTRY_KINDS);
  const lists = await Promise.all(kinds.map((kind) => listEntries(profile, kind)));
  return Object.fromEntries(kinds.map((kind, index) => [kind, lists[index]]));
}

export async function createEntry(profile, kind, input) {
  const entryKind = kindOf(kind);

  const doc = await entryKind.model.create({
    ...pickWritable(entryKind, input),
    candidateId: profile._id,
  });

  return toView(doc);
}

/** Scoped by candidateId as well as id, so another candidate's entry is invisible, not forbidden. */
export async function updateEntry(profile, kind, entryId, input) {
  const entryKind = kindOf(kind);

  const doc = await entryKind.model.findOne({ _id: entryId, candidateId: profile._id });
  if (!doc) throw ApiError.notFound('Entry not found.');

  Object.assign(doc, pickWritable(entryKind, input));
  await doc.save();

  return toView(doc);
}

/**
 * Removes an entry outright.
 *
 * A hard delete, unlike a removed membership or a cancelled invitation: this is the candidate's
 * own data about themselves, PRD §16.1 gives them correction and deletion rights over it, and
 * there is no counterparty whose audit trail depends on it surviving.
 */
export async function removeEntry(profile, kind, entryId) {
  const entryKind = kindOf(kind);

  const doc = await entryKind.model.findOneAndDelete({ _id: entryId, candidateId: profile._id });
  if (!doc) throw ApiError.notFound('Entry not found.');

  return { removed: true, id: String(doc._id) };
}
