import { useEffect, useState } from 'react';

/**
 * True once the page has scrolled past `threshold`.
 *
 * Replaces the prototype's scroll handler, which fired unthrottled on every scroll frame and
 * performed eight-plus classList mutations each time. Here the listener is
 * requestAnimationFrame-throttled and produces a single boolean, so React re-renders only when
 * the value actually flips.
 *
 * That also fixes a real bug: because the prototype toggled several classes independently, the
 * transition could apply `text-gray-300` over a white background — roughly 1.9:1 contrast, a
 * clear WCAG failure. Deriving every colour from one boolean makes that state unreachable.
 *
 * @param {number} threshold
 * @returns {boolean}
 */
export function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = null;

    const read = () => {
      frame = null;
      setScrolled(window.scrollY > threshold);
    };

    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(read);
    };

    // Set the initial value: the page may load already scrolled (anchor link, restored position).
    read();

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
