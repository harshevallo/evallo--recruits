import { cn } from '@/utils/cn';
import { Icon } from './Icon';

/** Page numbers with ellipses, keeping the control a fixed width. */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const buttonClass =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
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
            onClick={() => onChange(item)}
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
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className={cn(buttonClass, 'text-gray-600 hover:bg-gray-100')}
      >
        <Icon name="arrow-right" />
      </button>
    </nav>
  );
}
