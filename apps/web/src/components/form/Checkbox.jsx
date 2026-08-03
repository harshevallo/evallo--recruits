import { useId } from 'react';
import { cn } from '@/utils/cn';

/**
 * Labelled checkbox.
 *
 * The label wraps the input, so clicking the text toggles it and screen readers get the
 * association without needing a separate htmlFor/id pair to be kept in sync.
 */
export function Checkbox({ label, description, className, id, ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn('flex cursor-pointer items-start gap-3 text-sm text-gray-700', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
        {...props}
      />
      <span>
        {label}
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
    </label>
  );
}
