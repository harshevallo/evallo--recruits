/**
 * Portfolio media providers — PRD §16.3.
 *
 * An allow-list, not a URL check: accepting any link would let a profile embed arbitrary
 * third-party content into a recruiter's browser, which is the exact risk §16.3 names.
 *
 * ── Why this lives in `shared` ────────────────────────────────────────────────────────────────
 *
 * Three places need to agree on "is this a video link we accept":
 *
 *   · the API's write path   `profileEntry.service` derives `provider` from it
 *   · the API's validation   `mediaBody.url` refuses anything it does not recognise
 *   · the BUILDER            "Add video" stays disabled until the link would be accepted
 *
 * The third is new, and it is exactly the case ADR-009 exists for: a second copy of the host list
 * in the client would drift, and the drift shows up as a button that is enabled for a link the
 * server then rejects — or disabled for one it would have taken. One list, imported by both.
 *
 * Environment-agnostic, as everything in this package must be: `URL` is standard in both Node and
 * the browser.
 */

export const VIDEO_PROVIDERS = Object.freeze({
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'vimeo.com': 'Vimeo',
  'www.vimeo.com': 'Vimeo',
});

/**
 * Resolves a URL to an allowed provider name, or `null` when it is not on the list.
 *
 * Hostname only — never a substring match. `youtube.com.evil.test` must not pass, and it is a
 * `String.includes` away from doing so.
 *
 * @param {string} url
 * @returns {'YouTube'|'Vimeo'|null}
 */
export function videoProviderFor(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return VIDEO_PROVIDERS[parsed.hostname] ?? null;
  } catch {
    return null;
  }
}

/** Convenience for the UI: would the server accept this link? */
export function isSupportedVideoUrl(url) {
  return videoProviderFor(url) !== null;
}
