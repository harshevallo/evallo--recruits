import { cn } from '@/utils/cn';

/**
 * Announces asynchronous results to assistive technology.
 *
 * The prototype reports submission with `alert()`. A screen-reader user needs the outcome
 * announced in place; `aria-live` does that without stealing focus.
 *
 * `role="status"` (polite) for success, `role="alert"` (assertive) for errors — an error
 * interrupts, a confirmation waits its turn.
 */
export function StatusRegion({ tone = 'success', children, className }) {
  if (!children) {
    // Rendered even when empty so the live region exists in the DOM before content arrives —
    // regions inserted at the same time as their content are often not announced.
    return <div role="status" aria-live="polite" className="sr-only" />;
  }

  const tones = {
    success: 'bg-green-50 text-green-800',
    error: 'bg-red-50 text-red-800',
    // PRD §19.1 lists a pale-blue information state alongside the success/error ones.
    info: 'bg-blue-50 text-blue-900',
  };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('rounded-lg p-4 text-sm', tones[tone], className)}
    >
      {children}
    </div>
  );
}
