import { cn } from '@/utils/cn';
import { Icon } from '@/components/ui';

/**
 * A multi-select drawn as selectable cards rather than a column of checkboxes.
 *
 * The control underneath is still a real `<input type="checkbox">` inside a `<label>` — the card
 * is styling on top of it, never a `<div>` with an onClick. So keyboard focus, space to toggle,
 * and screen-reader announcement all work exactly as they do for a plain checkbox, and the
 * selected state is carried by the input's own `:checked`, not by a class we have to keep in sync.
 *
 * The checkbox is visually hidden but NOT `display: none` — `sr-only` keeps it focusable. The card
 * shows focus through `peer-focus-visible`, so tabbing through the group is visible.
 *
 * @param {'pill'|'tile'|'grid'} layout
 *   `pill` — a wrapping row of compact options (delivery model: three of them, short labels).
 *   `tile` — a grid of larger targets, for a short vocabulary worth giving room (learner segments).
 *   `grid` — two columns of ordinary rows, for a long vocabulary (education services: twelve).
 */
const LAYOUTS = {
  pill: 'flex flex-wrap gap-3',
  tile: 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4',
  grid: 'grid grid-cols-1 gap-2.5 sm:grid-cols-2',
};

const CARDS = {
  pill: 'flex items-center gap-2 rounded-lg border px-4 py-2.5',
  tile: 'flex h-full flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center',
  grid: 'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
};

/**
 * @param {string} [id]
 *   Applied to the FIRST option's input. The wizard moves focus to `field-<name>` when a required
 *   field is missing, and a fieldset is not focusable — without this the "still needed" message
 *   would point at a control the caret never reaches.
 * @param {boolean} [required]
 *   Draws the same `*` marker `FormField` draws, so a required multi-select is not the one control
 *   on the form whose requirement is invisible.
 */
export function CheckCardGroup({
  id,
  legend,
  hint,
  options,
  selected = [],
  onToggle,
  disabled = false,
  layout = 'grid',
  hasError = false,
  required = false,
  describedBy,
}) {
  return (
    <fieldset
      aria-describedby={describedBy}
      className={cn(hasError && 'rounded-lg border border-red-500 p-3')}
    >
      <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
        {legend}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </legend>
      {hint && <p className="mb-3 text-xs text-gray-500">{hint}</p>}

      <div className={LAYOUTS[layout] ?? LAYOUTS.grid}>
        {options.map((option, i) => {
          const checked = selected.includes(option.value);

          return (
            <label
              key={option.value}
              className={cn(
                'group cursor-pointer transition-colors',
                CARDS[layout] ?? CARDS.grid,
                checked
                  ? 'border-brand-blue bg-blue-50/40'
                  : 'border-gray-200 bg-white hover:bg-gray-50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                /* Only the first carries the group id — see the note on `id` above. */
                id={i === 0 ? id : undefined}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                disabled={disabled}
                aria-required={required || undefined}
                onChange={(event) => onToggle(option.value, event.target.checked)}
              />

              {/*
                The tick box is drawn, because the real input is `sr-only`. `peer-focus-visible`
                is what puts a visible focus ring on it when the hidden input is focused — without
                it a keyboard user moving through the group would see nothing move.
              */}
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue peer-focus-visible:ring-offset-2',
                  checked ? 'border-brand-blue bg-brand-blue text-white' : 'border-gray-300 bg-white',
                  layout === 'grid' && 'mt-0.5',
                )}
              >
                {checked && <Icon name="circle-check" className="text-[9px]" />}
              </span>

              <span
                className={cn(
                  'text-sm',
                  checked ? 'font-semibold text-brand-dark' : 'font-medium text-gray-700',
                  layout === 'tile' && 'text-xs leading-snug',
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
