import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { rankOptions } from '@/utils/optionSearch';
import { cn } from '@/utils/cn';

/**
 * Searchable single-select.
 *
 * `SelectInput` is still the right control for a handful of options — native, free keyboard and
 * mobile behaviour, nothing to maintain. This exists for the lists where scanning is the problem:
 * a candidate looking for their country should be able to type "ind" rather than hunt down a
 * scroll list. It never widens what may be stored — the options are the caller's vocabulary, and
 * a value is only ever emitted by picking one of them, so free text cannot leak into the answer.
 *
 * The ARIA 1.2 combobox pattern with list autocomplete: the text box IS the field — it holds the
 * selected label when closed and the search query when open — and options are announced through
 * `aria-activedescendant` rather than by moving focus, so the box keeps focus and every keystroke
 * still reaches it.
 *
 * @param {{value: string, label: string}[]} props.options
 * @param {string}   props.value           Selected option value; '' for none.
 * @param {Function} props.onChange        Receives the next VALUE (not an event); '' when cleared.
 * @param {string}   [props.listboxLabel]  Accessible name for the popup, e.g. the field label.
 */
export function ComboboxInput({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyMessage = 'No matches.',
  listboxLabel = 'Options',
  hasError = false,
  disabled = false,
  className,
  id,
  ...props
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const listboxId = `${fieldId}-listbox`;
  const optionId = (index) => `${fieldId}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((option) => option.value === value) ?? null;

  /* Ranked substring match, shared with the talent-search facet panel — see utils/optionSearch. */
  const matches = useMemo(() => rankOptions(options, query), [options, query]);

  /* Clamped at render: typing shortens the list under whatever was highlighted. */
  const activeOption = activeIndex >= 0 && activeIndex < matches.length ? activeIndex : -1;

  function openList(startIndex = null) {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    /* Reopening lands on the current answer, so Enter re-confirms rather than silently changing it. */
    setActiveIndex(startIndex ?? options.findIndex((option) => option.value === value));
  }

  function closeList() {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
  }

  function commit(option) {
    onChange(option ? option.value : '');
    closeList();
    inputRef.current?.focus();
  }

  /*
   * Clicking away closes without committing — `pointerdown` because it fires before focus moves,
   * so the list is already gone by the time the click lands on whatever is underneath.
   */
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) closeList();
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  /* Keeps the highlighted row inside the scroll box when arrowing past its edge. */
  useEffect(() => {
    if (!open || activeOption < 0) return;
    document.getElementById(optionId(activeOption))?.scrollIntoView({ block: 'nearest' });
  });

  function move(delta) {
    if (matches.length === 0) return;
    const from = activeOption < 0 ? (delta > 0 ? -1 : 0) : activeOption;
    /* Wraps, as a listbox does — Up from the first option reaches the last. */
    setActiveIndex((from + delta + matches.length) % matches.length);
  }

  function onKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) move(1);
        else openList();
        return;

      case 'ArrowUp':
        event.preventDefault();
        if (open) move(-1);
        else openList(options.length - 1);
        return;

      case 'Enter':
        /* Only swallowed while the list is open, so Enter still submits the form when it is not. */
        if (!open) return;
        event.preventDefault();
        if (activeOption >= 0) commit(matches[activeOption]);
        return;

      case 'Escape':
        if (!open) return;
        /* Stops here: an Escape meant for this list must not also close a surrounding dialog. */
        event.preventDefault();
        event.stopPropagation();
        closeList();
        return;

      case 'Tab':
        /* Leaving the field abandons the query and keeps the previous answer. */
        if (open) closeList();
        return;

      default:
    }
  }

  /*
   * Clearable whenever there is something to clear — including when the field is `required`. The
   * native select this replaces could always be put back to its "Select…" row, and the builder
   * saves partial sections by design (PRD §8.3), so removing an answer must stay possible.
   */
  const showClear = Boolean(selected) && !disabled;

  return (
    <div ref={rootRef} className="relative">
      <input
        {...props}
        ref={inputRef}
        id={fieldId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && activeOption >= 0 ? optionId(activeOption) : undefined}
        disabled={disabled}
        className={cn(
          'w-full rounded-xl border bg-white py-3 pl-4 text-sm font-medium text-brand-dark shadow-sm',
          'transition-colors placeholder:font-normal placeholder:text-gray-400',
          'focus:outline-none focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-gray-400',
          showClear ? 'pr-[4.5rem]' : 'pr-11',
          hasError ? 'border-red-500' : 'border-slate-200',
          className,
        )}
        /* Closed, the box READS as the field: it shows the answer. Open, it is the search input. */
        value={open ? query : (selected?.label ?? '')}
        placeholder={open ? searchPlaceholder : placeholder}
        onChange={(event) => {
          if (!open) setOpen(true);
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onMouseDown={() => {
          /* A click on the field toggles the list, which is what a dropdown does. */
          if (open) closeList();
          else openList();
        }}
        onKeyDown={onKeyDown}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
        {showClear && (
          <button
            type="button"
            /* Parity with the native select's "Select…" row — an optional answer stays clearable. */
            aria-label="Clear selection"
            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(null)}
          >
            <Icon name="xmark" className="text-[11px]" />
          </button>
        )}
        <Icon name="chevron-down" className="text-xs text-gray-400" />
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel}
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            /* Not an option row: there is nothing to choose, so nothing here should be selectable. */
            <li className="px-4 py-2.5 text-sm text-gray-500">{emptyMessage}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  'cursor-pointer px-4 py-2.5 text-sm text-brand-dark',
                  index === activeOption && 'bg-blue-50/70',
                  option.value === value && 'font-semibold',
                )}
                /* mousedown would blur the box and close the list before the click landed. */
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
