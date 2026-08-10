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
        'w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-brand-dark shadow-sm',
        'transition-colors placeholder:font-normal placeholder:text-gray-400',
        'focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15',
        hasError ? 'border-red-500' : 'border-slate-200',
        className,
      )}
      {...props}
    />
  );
}
