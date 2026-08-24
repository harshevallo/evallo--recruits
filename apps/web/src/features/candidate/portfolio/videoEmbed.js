/**
 * Turns a candidate's video link into a player URL — for the two providers, and only those two.
 *
 * PRD §16.3 keeps portfolio embeds behind a provider allow-list, and the server already enforces
 * it: `profileEntry.model.js#providerFor()` derives `provider` on write from the URL's hostname and
 * refuses anything not on `MEDIA_PROVIDERS`. This function is the rendering half of the same rule,
 * and it re-derives from the hostname rather than trusting the stored `provider` string — a value
 * that reached the client is data, and the check costs nothing.
 *
 * Returns `null` for anything it cannot confidently turn into a player. The caller falls back to
 * a plain link, so an unrecognised URL degrades to what the portfolio did before inline playback
 * existed rather than rendering an empty black box.
 */

/**
 * `youtube-nocookie.com`, not `youtube.com`.
 *
 * A shared portfolio is opened by people who never chose to visit YouTube — a recruiter following
 * a link, or anyone holding a share token. The nocookie host serves the same player without
 * setting tracking cookies until playback actually begins, which is the least this page can do for
 * a viewer who came to read a CV.
 */
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** YouTube ids are 11 chars of base64url; Vimeo ids are numeric. Anything else is not an id. */
const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d+$/;

function youtubeId(parsed) {
  if (parsed.hostname === 'youtu.be') {
    return parsed.pathname.slice(1).split('/')[0] || null;
  }

  const watch = parsed.searchParams.get('v');
  if (watch) return watch;

  /* /embed/<id>, /shorts/<id> and /live/<id> all carry the id in the same position. */
  const [, kind, id] = parsed.pathname.split('/');
  if (['embed', 'shorts', 'live', 'v'].includes(kind) && id) return id;

  return null;
}

function vimeoId(parsed) {
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0] === 'video') return segments[1] ?? null;
  /* A plain vimeo.com/<id>, and vimeo.com/<id>/<privacy-hash> which we deliberately do not carry. */
  return segments[0] ?? null;
}

/**
 * @param {string} url  The candidate's link, as stored.
 * @returns {{ src: string, provider: 'YouTube'|'Vimeo', title: string }|null}
 */
export function embedFor(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const id = youtubeId(parsed);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return {
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`,
      provider: 'YouTube',
      title: 'YouTube video player',
    };
  }

  if (VIMEO_HOSTS.has(parsed.hostname)) {
    const id = vimeoId(parsed);
    if (!id || !VIMEO_ID.test(id)) return null;
    return {
      src: `https://player.vimeo.com/video/${encodeURIComponent(id)}`,
      provider: 'Vimeo',
      title: 'Vimeo video player',
    };
  }

  return null;
}
