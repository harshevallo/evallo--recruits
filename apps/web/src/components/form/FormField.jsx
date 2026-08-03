import { useId } from 'react';
import { cn } from '@/utils/cn';

/**
 * Label + control + error, correctly wired.
 *
 * The prototype's labels are plain <label> elements with no `for` attribute and inputs with no
 * `id`, so nothing connects them — a screen reader announces "edit text, blank" with no idea
 * what the field is. This component owns that wiring so it cannot be forgotten again.
 *
 * Renders via a function child so the generated ids reach the control:
 *
 *   <FormField label="Email" error={errors.email}>
 *     {(props) => <TextInput {...props} value={…} onChange={…} />}
 *   </FormField>
 */
export function FormField({ label, name, error, hint, required = false, className, children }) {
  const generatedId = useId();
  const fieldId = name ? `field-${name}` : generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const describedBy = cn(error && errorId, hint && hintId) || undefined;

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      {children({
        id: fieldId,
        name,
        required,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
        hasError: Boolean(error),
      })}

      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      )}

      {/*
        Reserves no space when empty, so validation does not shift the layout — PRD §19.1
        requires inline errors without layout jumps.
      */}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
