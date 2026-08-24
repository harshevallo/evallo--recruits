/**
 * ACCOUNT languages — "languages you speak", on `users.accountLanguages`.
 *
 * ── Not the same thing as LANGUAGE_OPTIONS, and the difference matters ────────────────────────
 *
 * `LANGUAGE_OPTIONS` in `candidate.js` is the TEACHING taxonomy. It backs `users.languages`, which
 * is a recruiter search facet (`search.service.js`), a stated match reason, a filter panel, and the
 * "Teaches in …" line on every portfolio. It is deliberately weighted to the pilot's markets,
 * because a tutor in Chennai teaching in Tamil is exactly who that field is for.
 *
 * This list answers a different question — which languages the person speaks — and writes to its
 * own field. Keeping them apart is not tidiness: Settings → Account and the profile builder used to
 * edit the SAME array, so a curated global list in Settings would have made a Tamil teacher's
 * teaching language invisible in one screen and unremovable, and would have written values into a
 * search facet that `search.schema.js` then rejects.
 *
 * **Do not use this list for teaching languages, or that one for account languages.**
 *
 * ── What is in it ─────────────────────────────────────────────────────────────────────────────
 *
 * ISO 639-1 codes, so the two lists share a code space and a value never means two things.
 * Inclusion rule, applied consistently rather than by feel: a language is here if it is an
 * official or national language of a sovereign state, or among the most-spoken languages
 * worldwide. That is why Bengali and Urdu appear (national languages of Bangladesh and Pakistan,
 * and both in the global top ten) while Indian STATE languages such as Telugu, Marathi, Gujarati,
 * Kannada and Malayalam do not — those remain in the teaching taxonomy, where they belong.
 *
 * Sorted by label so the list reads A–Z; the selector searches it, so no ordering by "importance"
 * is needed or wanted.
 */

export const ACCOUNT_LANGUAGE_OPTIONS = Object.freeze([
  { value: 'ar', label: 'Arabic' },
  { value: 'bn', label: 'Bengali' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'en', label: 'English' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ms', label: 'Malay' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fa', label: 'Persian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'sw', label: 'Swahili' },
  { value: 'sv', label: 'Swedish' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'ta', label: 'Tamil' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ur', label: 'Urdu' },
  { value: 'vi', label: 'Vietnamese' },
]);

export const ACCOUNT_LANGUAGE_VALUES = Object.freeze(
  ACCOUNT_LANGUAGE_OPTIONS.map((option) => option.value),
);

export const ACCOUNT_LANGUAGE_LABELS = Object.freeze(
  Object.fromEntries(ACCOUNT_LANGUAGE_OPTIONS.map((option) => [option.value, option.label])),
);

/** True when this is a selectable account language. Used by the API to refuse anything else. */
export function isAccountLanguage(value) {
  return ACCOUNT_LANGUAGE_VALUES.includes(String(value ?? '').trim().toLowerCase());
}
