import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** How long to keep looking for the target before giving up, in milliseconds. */
const LOOKUP_WINDOW_MS = 1500;

/** Gap between lookups. Short enough to feel immediate, long enough not to spin the main thread. */
const RETRY_INTERVAL_MS = 50;

/**
 * Scrolls to `#anchor` targets.
 *
 * React Router does not do this natively (03_TRD.md §4.5). The marketing page relies on it for
 * #businesses, #educators, #features, and #get-started.
 *
 * Three details that matter:
 *   - The target may not exist yet, so the lookup RETRIES rather than checking once. One
 *     deferred tick is enough when the section is already mounted — arriving at `/#businesses`
 *     from another page is not that case: the app boots, React paints, and the marketing
 *     sections appear later, by which point a one-shot lookup has given up silently and left
 *     the reader at the top of the page.
 *   - The retry uses a timer rather than requestAnimationFrame. rAF is tied to the frame loop,
 *     so in a backgrounded or non-compositing tab it may not fire at all — and "the anchor works
 *     unless the tab was in the background" is not a behaviour worth shipping.
 *   - Smooth scrolling respects prefers-reduced-motion (PRD §19), and focus moves with the
 *     viewport, or keyboard users stay where they were.
 */
export function ScrollToHash() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return undefined;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const deadline = Date.now() + LOOKUP_WINDOW_MS;

    let timer = 0;

    const attempt = () => {
      const element = document.getElementById(hash.slice(1));

      if (!element) {
        // Not painted yet. Keep looking until the window closes, then stop quietly.
        if (Date.now() < deadline) timer = window.setTimeout(attempt, RETRY_INTERVAL_MS);
        return;
      }

      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });

      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    };

    timer = window.setTimeout(attempt, 0);

    return () => window.clearTimeout(timer);
  }, [hash]);

  return null;
}
