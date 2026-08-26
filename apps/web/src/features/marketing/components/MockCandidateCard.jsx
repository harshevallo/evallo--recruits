import { useState } from 'react';
import { VideoLightbox } from '@/features/media/VideoLightbox';
import { embedFor } from '@/features/media/videoEmbed';
import { marketingSampleVideoUrl } from '@/config/marketing';
import { Avatar, Badge, Icon } from '@/components/ui';

/**
 * Illustrative educator profile card in the educators section.
 *
 * Decorative and aria-hidden. The person and credentials are examples, not a real user.
 */
const SAMPLE_TITLE = 'Explaining Polynomials';

/**
 * The "Teaching Sample" frame.
 *
 * ── It used to promise something it could not do ─────────────────────────────────────
 *
 * This was a `<div>` with `cursor-pointer`, a play glyph and a hover animation — and no handler,
 * no video and no URL anywhere in the codebase. It read as a player to everyone who clicked it.
 *
 * There are now two honest states, and which one renders depends on configuration rather than on
 * anything in this file:
 *
 *   · **Configured** — a real `<button>` that opens the same `VideoLightbox` the candidate
 *     portfolio uses. Enter and Space work because it is a button, not a div pretending to be one.
 *   · **Not configured** — a plain illustration. No pointer cursor, no hover lift, not focusable.
 *     It still shows the frame and the caption, so the card looks the same in a screenshot; it
 *     simply stops claiming to be interactive.
 *
 * ── Why the lightbox is a SIBLING of the button ────────────────────────────────────
 *
 * Not a child. React events bubble through the REACT tree, not the DOM tree, so a dialog rendered
 * inside the button sends its own Close click back up to the button's `onClick` and reopens
 * instantly. That exact bug cost real time in the portfolio section; it is avoided here by
 * construction.
 */
function TeachingSampleFrame() {
  const [open, setOpen] = useState(false);

  /*
   * `embedFor` decides, not the presence of a string. A URL the allow-list cannot resolve — a typo,
   * or a host that is not YouTube or Vimeo — would otherwise render a play button over a lightbox
   * that returns null, which is the original bug with extra steps.
   */
  const playable = Boolean(marketingSampleVideoUrl && embedFor(marketingSampleVideoUrl));

  const frame = (
    <>
      <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
      <Icon
        name="play"
        className={`text-3xl text-white opacity-90 transition-all ${
          playable ? 'group-hover:scale-110 group-hover:opacity-100' : ''
        }`}
      />
      <span className="absolute bottom-3 left-4 text-xs font-medium text-white">
        &quot;{SAMPLE_TITLE}&quot;
      </span>
    </>
  );

  const shell = 'group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-gray-900';

  if (!playable) {
    /* No handler, no pointer, not in the tab order. An illustration, and it looks like one. */
    return <div className={shell}>{frame}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play the teaching sample: ${SAMPLE_TITLE}`}
        className={`${shell} cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2`}
      >
        {frame}
      </button>

      {/* Mounted only while open, so the homepage makes no request to the video host until asked. */}
      <VideoLightbox
        open={open}
        onClose={() => setOpen(false)}
        url={marketingSampleVideoUrl}
        title={SAMPLE_TITLE}
        subtitle="Teaching sample"
      />
    </>
  );
}

export function MockCandidateCard() {
  return (
    <div className="relative w-full overflow-x-clip lg:w-1/2" aria-hidden="true">
      {/*
        `overflow-x-clip` on the wrapper contains the tilted backdrop below: `scale-105` with
        `-rotate-3` pushes it about 8px past this card, which was enough to give the whole landing
        page a horizontal scrollbar at 375px. Clip rather than hidden — clip does not create a
        scroll container, so it cannot interfere with sticky or absolute descendants.
      */}
      <div className="absolute inset-0 -z-10 -rotate-3 scale-105 transform rounded-3xl bg-brand-light" />

      <div className="relative z-10 rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-6">
          <div className="flex items-center gap-4">
            <Avatar initials="PT" size="lg" tone="neutral" className="border-2 border-white shadow-sm" />
            <div>
              <p className="text-xl font-bold text-brand-dark">Sarah Jenkins</p>
              <p className="text-sm text-gray-600">Expert Math &amp; Science Educator</p>
            </div>
          </div>

          <Badge tone="successLight" size="sm" radius="full" weight="bold">
            <Icon name="shield-halved" /> Verified
          </Badge>
        </div>

        <div className="mb-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
            Verified Credentials
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral" size="lg" radius="md">
              <Icon name="star" className="text-sm text-yellow-400" />
              <span className="text-sm font-medium text-brand-dark">SAT Math: 800</span>
            </Badge>
            <Badge tone="neutral" size="lg" radius="md">
              <Icon name="award" className="text-sm text-brand-blue" />
              <span className="text-sm font-medium text-brand-dark">State Teaching Cert</span>
            </Badge>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
            Teaching Sample
          </p>
          {/* A video frame is legitimately dark — its own text stays light for that reason. */}
          <TeachingSampleFrame />
        </div>
      </div>
    </div>
  );
}
