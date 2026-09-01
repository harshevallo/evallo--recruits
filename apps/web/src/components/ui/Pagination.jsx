import { cn } from '@/utils/cn';
import { Icon } from './Icon';

/** The visible window of page numbers, keeping the control a fixed width. */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

/**
 * Page numbers with ellipses, plus the scroll every paginated list needs.
 *
 * ── Why the scroll lives HERE ───────────────────────────────────────────────────────
 *
 * This control sits at the BOTTOM of a list. Clicking "2" replaced the rows above it and left the
 * viewport exactly where it was — at the bottom — so the reader landed on the end of page two
 * having never seen its start. Five screens render this component and every one of them had the
 * same defect, which is the argument for fixing it in the component rather than five times over:
 * a sixth list cannot reintroduce it by forgetting.
 *
 * `prefers-reduced-motion` is honoured. A smooth scroll across a long results page is exactly the
 * kind of large-area motion that setting exists to suppress.
 */
export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const goTo = (next) => {
    if (next === page || next < 1 || next > totalPages) return;
    onChange(next);

    /*
     * After the handler, so the caller has already started loading. `scrollTo` is queued on the
     * same frame either way — the new rows render into a viewport that is already back at the top,
     * rather than the reader watching the page jump once content arrives.
     */
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  const buttonClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => goTo(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={cn(buttonClass, 'text-gray-600 hover:bg-gray-100')}
      >
        <Icon name="arrow-right" className="rotate-180" />
      </button>

      {pageWindow(page, totalPages).map((item, index) =>
        item === '…' ? (
          <span key={`gap-${index}`} className="px-2 text-gray-400" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => goTo(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              buttonClass,
              item === page
                ? 'bg-brand-blue text-white'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => goTo(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className={cn(buttonClass, 'text-gray-600 hover:bg-gray-100')}
      >
        <Icon name="arrow-right" />
      </button>
    </nav>
  );
}
