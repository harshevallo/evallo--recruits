/**
 * Marketing content that is configuration, not code.
 *
 * ── Why the homepage sample video is an env var ───────────────────────────────────────────────
 *
 * The "Teaching Sample" card on the landing page illustrates a candidate profile, and its play
 * button was decorative for as long as the card existed — no video, no handler, no URL anywhere in
 * the repository. Hard-coding a clip here would put a specific video into the source tree, where
 * changing it means a code review and a deploy; marketing content should not need either.
 *
 * It is also the reason this can ship before the clip exists. When the value is unset the card
 * renders as a plain illustration with no play affordance — honest rather than broken — and setting
 * the variable turns the player on with no further change.
 *
 * Must be a YouTube or Vimeo URL: `videoEmbed.js` re-derives the provider from the hostname
 * (PRD §16.3) and anything else resolves to null, which the card treats as "not configured".
 */
export const marketingSampleVideoUrl =
  import.meta.env.VITE_MARKETING_SAMPLE_VIDEO_URL?.trim() || null;
