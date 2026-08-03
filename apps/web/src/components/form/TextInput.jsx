import { cn } from '@/utils/cn';

/**
 * Text/email input.
 *
 * Styling matches the prototype exactly. Note it keeps `focus:outline-none` only because a
 * visible `focus:ring-2` replaces it — removing an outline without a replacement fails
 * PRD §19 (visible focus).
 */
export function TextInput({ hasError, className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border px-4 py-3',
        'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue',
        hasError ? 'border-red-500' : 'border-gray-300',
        className,
      )}
      {...props}
    />
  );
}
