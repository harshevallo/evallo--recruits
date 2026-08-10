import { cn } from '@/utils/cn';

/**
 * Native <select>.
 *
 * Deliberately not a custom listbox: the native control is keyboard-accessible, screen-reader
 * correct, and behaves properly on mobile for free.
 */
export function SelectInput({ options = [], hasError, className, ...props }) {
  return (
    <select
      className={cn(
        'w-full appearance-none rounded-xl border bg-white px-4 py-3 pr-10 text-sm font-medium text-brand-dark shadow-sm',
        'transition-colors',
        'focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15',
        hasError ? 'border-red-500' : 'border-slate-200',
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
