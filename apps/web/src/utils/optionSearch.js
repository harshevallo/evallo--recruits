/**
 * Searching a `{ value, label }[]` option list.
 *
 * Shared by every control that has to make a long vocabulary findable — the searchable combobox
 * and the talent-search facet panel. One implementation, so "ind" ranks India the same way
 * wherever a candidate or a recruiter types it.
 */

/**
 * Lower-cased and stripped of accents, so an ASCII keyboard reaches every option.
 *
 * Without this, "cote" misses Côte d'Ivoire, "aland" misses Åland Islands, "curacao" misses
 * Curaçao and "sao tome" misses São Tomé. Applied to BOTH sides, so typing the accent still works.
 */
export function foldText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Substring match, RANKED — so "ind" offers India, then Indonesia, then British Indian Ocean
 * Territory, rather than the alphabetical order that buries the obvious answer under a territory
 * almost nobody lives in.
 *
 * Four tiers, best first:
 *   0  EXACT — the label, or the value        "in" → India · "niger" → Niger before Nigeria
 *   1  the label starts with it               "ind" → India, Indonesia
 *   2  a WORD in the label starts with it     "kin" → United Kingdom
 *   3  anywhere in the label                  "ind" → British Indian Ocean Territory
 *
 * Tier 0 covers the value because a code is how some people type ("in", "gb"), and the label
 * because an exact name must never rank behind a longer name it happens to prefix. That second
 * case is currently satisfied by the data too — the country list is alphabetical, and a string
 * always sorts before anything it prefixes, so "Niger" would land above "Nigeria" anyway. Stating
 * it as a tier makes the guarantee independent of how the caller happens to have ordered its
 * options, which is what stops a future reordering silently changing search results.
 *
 * `sort` is stable in every engine we target, so options keep their incoming order — normally
 * alphabetical — within a tier. Ranking only reorders; it never removes a match a plain substring
 * search would have found, and an empty query returns the list untouched.
 *
 * @param {{value: string, label: string}[]} options
 * @param {string} query
 */
export function rankOptions(options, query) {
  const needle = foldText(String(query ?? '').trim());
  if (!needle) return options;

  /* The needle reaches a RegExp, so anything special in it must be a literal. */
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordStart = new RegExp(`\\b${escaped}`);

  const ranked = [];
  for (const option of options) {
    const label = foldText(option.label ?? option.value);
    let rank;

    if (foldText(option.value) === needle || label === needle) rank = 0;
    else if (label.startsWith(needle)) rank = 1;
    else if (label.includes(needle)) rank = wordStart.test(label) ? 2 : 3;
    else continue;

    ranked.push({ option, rank });
  }

  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.option);
}

/**
 * How many options justify a search box.
 *
 * Below this a filter is noise — the whole list is on screen and scanning it is faster than
 * typing. Above it, scrolling an unsorted-in-your-head list is the work, which is exactly what a
 * search box removes. Countries (250) are far past it; delivery modes (4) are nowhere near.
 */
export const SEARCH_THRESHOLD = 12;
