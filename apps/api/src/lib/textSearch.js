/**
 * Free-text matching for the search endpoints.
 *
 * ── Why this exists, and what it replaced ─────────────────────────────────────────────────────
 *
 * Company and role search both used MongoDB's `$text` operator against a text index. `$text` is
 * genuinely good at what it does — stemming, relevance scoring, multi-field weights — but it
 * matches **whole words only**. There is no prefix or substring matching, by design.
 *
 * That is the wrong shape for a search box someone types into. Measured against the real data:
 *
 *     q=Northgate  →  1 result        q=north    →  0 results
 *     q=Learnova   →  1 result        q=learnov  →  0 results
 *
 * A person types "north", sees nothing, and concludes the search is broken or only covers what is
 * already on screen. The search was in fact querying the whole collection the entire time — every
 * page, not just the first — but a partial word could never match, so it looked otherwise.
 *
 * ── What this does instead ────────────────────────────────────────────────────────────────────
 *
 * Case-insensitive SUBSTRING matching, with every term required and any field allowed to satisfy
 * it. "Seven Square" matches a company named "Seven Square Learning"; "north" matches "Northgate".
 *
 * ── What was given up, and when to revisit ────────────────────────────────────────────────────
 *
 * Two things, both deliberate:
 *
 *   · **Relevance ranking.** `$text` produced a `textScore` that sorted the best match first.
 *     A regex match is binary, so callers fall back to their non-text sort. At pilot scale a
 *     directory search returns a handful of rows and the ordering barely matters; when it does,
 *     the answer is an aggregation that scores field matches, not a return to whole-word-only.
 *   · **Index use.** An unanchored regex cannot use a b-tree index, so this scans the candidate
 *     set left after every other filter has been applied. That set is small today because the
 *     visibility filter runs first. This is the line to watch as the collection grows — see I-10
 *     and I-11 — and the reason the text indexes are LEFT IN PLACE rather than dropped: switching
 *     back, or moving to a scored aggregation, should not need a migration.
 */

/** Escapes every regex metacharacter, so a query of `c++` searches for "c++" rather than throwing. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A Mongo filter fragment matching `query` across `fields`.
 *
 * Every whitespace-separated term must appear in at least one field — so a second word narrows
 * the result rather than widening it, which is what someone typing more words expects.
 *
 * @param   {string}   query
 * @param   {string[]} fields  dotted paths, e.g. `['name', 'description.short']`
 * @returns {object|null}      `{ $and: [...] }` fragment, or null when there is nothing to match
 */
export function substringFilter(query, fields) {
  const terms = String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0 || fields.length === 0) return null;

  return {
    $and: terms.map((term) => ({
      $or: fields.map((field) => ({
        [field]: { $regex: escapeRegex(term), $options: 'i' },
      })),
    })),
  };
}

/**
 * Merges a fragment into a filter under `$and`.
 *
 * Always `$and`, never a bare `$or` assignment: role search already sets `$or` for its region
 * match, and a second `$or` written straight onto the filter would silently replace the first —
 * turning "in Bengaluru AND matching 'physics'" into "matching 'physics'" with the location
 * quietly dropped. Composing under `$and` is what makes the two independent.
 */
export function andFilter(filter, fragment) {
  if (!fragment) return filter;
  filter.$and = [...(filter.$and ?? []), fragment];
  return filter;
}
