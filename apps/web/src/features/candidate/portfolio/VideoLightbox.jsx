import { Icon, Modal } from '@/components/ui';
import { embedFor } from './videoEmbed';

/**
 * A portfolio video, played INSIDE the product.
 *
 * One player, two call sites: the builder's Portfolio & Media section (where the candidate manages
 * their clips) and the portfolio document itself (preview, recruiter view, share link). Both used
 * to be `<a target="_blank">` links to youtube.com — which, for a recruiter halfway down a
 * portfolio, loses their place and lands them on a page built to show them somebody else's videos
 * next.
 *
 * ── Why an iframe here is defensible ──────────────────────────────────────────────────────────
 *
 * The link those surfaces used to render was defended on privacy grounds: it kept third-party
 * script off our page entirely rather than merely sandboxed within it. That concern is answered
 * rather than dropped:
 *
 *   · **Nothing loads until asked.** This component is only mounted while `open` is true, so a
 *     portfolio with six videos makes ZERO requests to YouTube or Vimeo until a viewer opens one.
 *     Closing unmounts the frame, which is also what stops playback.
 *   · **`youtube-nocookie.com`**, so even then no tracking cookie is set before playback.
 *   · **The allow-list still decides.** `embedFor` re-derives the provider from the hostname
 *     (PRD §16.3); a URL it cannot resolve returns null and the caller falls back to a link.
 *   · **`referrerPolicy="strict-origin-when-cross-origin"`** — a share token in the path is never
 *     handed to the video host.
 *
 * The reader keeps the choice the old link made for them: "Watch on YouTube" is in the player.
 */
export function VideoLightbox({ open, onClose, url, title, subtitle }) {
  const embed = embedFor(url);

  /* Nothing to play — the caller should have rendered a link instead. Fail closed, not blank. */
  if (!embed) return null;

  return (
    <Modal open={open} onClose={onClose} size="wide" title={title} description={subtitle}>
      {/* 16:9, so the frame is the video's shape rather than the dialog's. */}
      <div className="relative w-full overflow-hidden rounded-xl bg-black pt-[56.25%]">
        <iframe
          src={embed.src}
          title={`${title} — ${embed.title}`}
          className="absolute inset-0 h-full w-full"
          /* No `allow-popups`: the player may not navigate the reader away on its own. */
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
        >
          <Icon name="link" className="text-xs" />
          Watch on {embed.provider}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
