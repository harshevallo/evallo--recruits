import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to `#anchor` targets.
 *
 * React Router does not do this natively (03_TRD.md §4.5). The marketing page relies on it for
 * #businesses, #educators, #features, and #get-started.
 *
 * Two details that matter:
 *   - The target may not exist on first paint, so the lookup is deferred a frame.
 *   - Smooth scrolling respects prefers-reduced-motion (PRD §19).
 */
export function ScrollToHash() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return undefined;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const frame = window.requestAnimationFrame(() => {
      const element = document.getElementById(hash.slice(1));
      if (!element) return;

      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });

      // Move keyboard focus with the viewport, or keyboard users stay where they were.
      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return null;
}
