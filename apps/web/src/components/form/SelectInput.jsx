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
        'w-full appearance-none rounded-lg border bg-white px-4 py-3',
        'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue',
        hasError ? 'border-red-500' : 'border-gray-300',
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
