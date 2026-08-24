import { useRef, useState } from 'react';
import {
  FormField,
  TextInput,
  Textarea,
  SelectInput,
  ComboboxInput,
  Checkbox,
} from '@/components/form';
import { Icon } from '@/components/ui';

/**
 * Renders one question from the bank (CAN-02, ADR-007).
 *
 * The control is chosen from the question's `type`, and how that control is DRAWN comes from its
 * `presentation` — cards, chips, pills, or the plain default. Both live in the bank, so adding a
 * question or changing how one is picked is a bank revision rather than a frontend change.
 *
 * Presentation never widens what may be stored. A chip picker over `subjects` still offers only
 * taxonomy options, because ADR-010 needs a controlled vocabulary for search to work — free-text
 * subjects would be unfindable the moment anyone typed a synonym.
 */

/* ── multi-select presentations ───────────────────────────────────────────────────────────── */

/**
 * Card glyphs by option value, matching the reference's per-role icons. Values the map does not
 * know fall back to a neutral glyph, so a taxonomy addition never breaks the picker.
 */
const CARD_OPTION_ICONS = {
  private_tutor: 'chalkboard',
  test_prep_tutor: 'chalkboard',
  academic_coach: 'chalkboard-user',
  school_teacher: 'school',
  teaching_assistant: 'school',
  special_education_teacher: 'school',
  professor_lecturer: 'building-columns',
  admissions_counselor: 'user-graduate',
  school_counselor: 'user-graduate',
  curriculum_designer: 'laptop-code',
  instructional_designer: 'laptop-code',
  academic_coordinator: 'briefcase',
  language_instructor: 'comments',
  teacher_trainer: 'chalkboard-user',
};

/**
 * Selectable cards. Rendered as real checkboxes inside labels, so selection state is announced,
 * the control is reachable by keyboard, and Space toggles it — none of which a clickable div does.
 */
function CardPicker({ field, options, selected, disabled, onToggle }) {
  return (
    <fieldset id={field.id} aria-describedby={field['aria-describedby']}>
      <legend className="sr-only">{field.legend}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`group relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all ${
                isSelected
                  ? 'border-brand-blue bg-brand-blue/[0.03] ring-1 ring-brand-blue'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                disabled={disabled}
                onChange={() => onToggle(option.value)}
              />
              <span className="mb-2 flex items-start justify-between">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    isSelected ? 'bg-blue-50 text-brand-blue' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <Icon
                    name={CARD_OPTION_ICONS[option.value] ?? 'graduation-cap'}
                    className="text-sm"
                  />
                </span>
                <Icon
                  name="circle-check"
                  className={`text-lg transition-opacity ${
                    isSelected ? 'text-brand-blue opacity-100' : 'text-gray-300 opacity-0'
                  }`}
                />
              </span>
              <span className="text-sm font-bold text-brand-dark">{option.label}</span>
              {option.description && (
                <span className="mt-1 text-xs leading-normal text-gray-500">
                  {option.description}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Compact tiles — a checkbox above a centred two-line label. Used for learner levels, where the
 * options are a short ordered scale and a full card per level would dominate the section.
 */
function TilePicker({ field, options, selected, disabled, onToggle }) {
  return (
    <fieldset id={field.id} aria-describedby={field['aria-describedby']}>
      <legend className="sr-only">{field.legend}</legend>
      {/*
        Four across only from lg. These labels are longer than a tile is wide at md — "Special
        educational needs" spills out of its box — so the scale stays two-up until there is room.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          // "High school (14–18)" → title on one line, range beneath, as the reference draws it.
          const [, title, detail] = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(option.label) ?? [
            null,
            option.label,
            null,
          ];

          return (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-3.5 text-center transition-colors ${
                isSelected
                  ? 'border-brand-blue bg-blue-50/30'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="mb-1 h-4 w-4 accent-brand-blue"
                checked={isSelected}
                disabled={disabled}
                onChange={() => onToggle(option.value)}
              />
              <span
                className={`text-xs [overflow-wrap:anywhere] ${isSelected ? 'font-bold text-brand-dark' : 'font-semibold text-gray-700'}`}
              >
                {title}
                {detail && (
                  <span
                    className={`block text-[10px] font-normal ${isSelected ? 'text-gray-500' : 'text-gray-400'}`}
                  >
                    ({detail})
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Compact inline toggles, for short option lists where a card would be overweight. */
function PillPicker({ field, options, selected, disabled, onToggle }) {
  return (
    <fieldset id={field.id} aria-describedby={field['aria-describedby']}>
      <legend className="sr-only">{field.legend}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                isSelected
                  ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                  : 'border-gray-200 bg-white font-medium hover:bg-gray-50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-blue"
                checked={isSelected}
                disabled={disabled}
                onChange={() => onToggle(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Chip picker — type to filter, Enter to add the top match, click or Backspace to remove.
 *
 * The reference lets a candidate type anything; this accepts only taxonomy options, and says so.
 * That is the one deliberate divergence: ADR-010 searches these values, so "Maths" and
 * "Mathematics" as separate free-text tags would silently split a candidate out of results.
 */
function ChipPicker({ field, options, selected, disabled, onToggle, onReplace }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const byValue = new Map(options.map((option) => [option.value, option]));
  const available = options.filter(
    (option) =>
      !selected.includes(option.value) &&
      option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function commit(value) {
    if (!value || selected.includes(value)) return; // duplicate prevention
    onToggle(value);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (available.length > 0) commit(available[0].value);
      return;
    }
    // Backspace on an empty box removes the last chip, as every tag input does.
    if (event.key === 'Backspace' && query === '' && selected.length > 0) {
      onReplace(selected.slice(0, -1));
    }
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div className="relative">
      <div
        className={`flex min-h-[6.5rem] flex-wrap items-start gap-2 rounded-xl border bg-white p-2.5 shadow-sm transition-all focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/15 ${
          field.hasError ? 'border-red-500' : 'border-slate-200'
        }`}
        onClick={() => inputRef.current?.focus()}
        role="presentation"
      >
        {selected.map((value) => (
          <span
            key={value}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-brand-dark"
          >
            {byValue.get(value)?.label ?? value}
            <button
              type="button"
              aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(value);
              }}
              className="text-gray-400 transition-colors hover:text-red-500"
            >
              <Icon name="xmark" className="text-[10px]" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={field.id}
          aria-describedby={field['aria-describedby']}
          role="combobox"
          aria-expanded={open && available.length > 0}
          aria-autocomplete="list"
          aria-controls={`${field.id}-options`}
          type="text"
          className="min-w-[10rem] flex-1 border-none bg-transparent px-2 py-1 text-sm font-medium text-brand-dark outline-none placeholder:font-normal placeholder:text-gray-400"
          placeholder={selected.length === 0 ? 'Type to search, then press Enter…' : 'Add another…'}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && available.length > 0 && (
        <ul
          id={`${field.id}-options`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {available.slice(0, 8).map((option, index) => (
            <li key={option.value} role="option" aria-selected={index === 0}>
              <button
                type="button"
                className="flex w-full items-center px-4 py-2 text-left text-sm text-brand-dark hover:bg-blue-50/70"
                // mousedown, not click: blur would close the list before click landed.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-gray-500">
        {selected.length === 0
          ? 'Nothing selected yet. These are the tags recruiters search on.'
          : `${selected.length} selected. Press Backspace to remove the last one.`}
      </p>
    </div>
  );
}

/* ── the question ─────────────────────────────────────────────────────────────────────────── */

/**
 * @param {boolean} [props.hideLabel]  The section already draws a heading for this question, so
 *                                     the field's own label would repeat it. Still rendered for
 *                                     assistive tech — hidden visually, never removed.
 * @param {string}  [props.className]  Spacing override, for sections that group fields in a grid.
 * @param {boolean} [props.searchable] Draw a `single_select` as a searchable box instead of a
 *                                     native select. A LAYOUT concern, like `icon`: it changes
 *                                     nothing about which options are valid or what is stored,
 *                                     so it does not belong in the bank alongside `presentation`.
 * @param {string}  [props.searchNoun] What the search box says it searches, e.g. "countries".
 */
export function BuilderQuestion({
  question,
  value,
  error,
  disabled,
  onChange,
  hideLabel = false,
  className = 'mb-6',
  icon = null,
  searchable = false,
  searchNoun = 'options',
}) {
  const { key, label, help, placeholder, type, options, maxLength, presentation } = question;

  const selected = Array.isArray(value) ? value : [];
  const toggle = (option) =>
    onChange(
      key,
      selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option],
    );

  /** Live character count, matching the reference's counters under long answers. */
  const counter =
    maxLength && (type === 'long_text' || type === 'short_text') ? (
      <p className="mt-1.5 text-right text-[11px] font-medium text-gray-400">
        {String(value ?? '').length} / {maxLength} characters
      </p>
    ) : null;

  return (
    <FormField
      label={label}
      name={key}
      error={error}
      hint={help ?? undefined}
      required={question.requiredForPublish}
      hideLabel={hideLabel}
      className={className}
    >
      {(field) => {
        const shared = { ...field, legend: label };

        if (type === 'multi_select' && presentation === 'cards') {
          return (
            <CardPicker
              field={shared}
              options={options ?? []}
              selected={selected}
              disabled={disabled}
              onToggle={toggle}
            />
          );
        }

        if (type === 'multi_select' && presentation === 'tiles') {
          return (
            <TilePicker
              field={shared}
              options={options ?? []}
              selected={selected}
              disabled={disabled}
              onToggle={toggle}
            />
          );
        }

        if (type === 'multi_select' && presentation === 'pills') {
          return (
            <PillPicker
              field={shared}
              options={options ?? []}
              selected={selected}
              disabled={disabled}
              onToggle={toggle}
            />
          );
        }

        if (type === 'multi_select' && presentation === 'chips') {
          return (
            <ChipPicker
              field={shared}
              options={options ?? []}
              selected={selected}
              disabled={disabled}
              onToggle={toggle}
              onReplace={(next) => onChange(key, next)}
            />
          );
        }

        switch (type) {
          case 'long_text':
            return (
              <>
                <Textarea
                  {...field}
                  rows={5}
                  maxLength={maxLength ?? undefined}
                  placeholder={placeholder ?? undefined}
                  value={value ?? ''}
                  disabled={disabled}
                  onChange={(e) => onChange(key, e.target.value)}
                />
                {counter}
              </>
            );

          case 'number':
            return (
              <TextInput
                {...field}
                type="number"
                min={question.min ?? undefined}
                max={question.max ?? undefined}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value === '' ? null : e.target.value)}
              />
            );

          case 'single_select':
            /*
             * Same answer, same vocabulary, different way in: a searchable box for lists long
             * enough that FINDING the option is the work. `onChange` still emits an option value
             * or null, so nothing downstream can tell which control produced it.
             */
            if (searchable) {
              return (
                <ComboboxInput
                  {...field}
                  options={options ?? []}
                  listboxLabel={label}
                  value={value ?? ''}
                  placeholder="Select…"
                  searchPlaceholder={`Search ${searchNoun}…`}
                  emptyMessage={`No ${searchNoun} match that search.`}
                  disabled={disabled}
                  onChange={(next) => onChange(key, next || null)}
                />
              );
            }

            return (
              <SelectInput
                {...field}
                options={[{ value: '', label: 'Select…' }, ...(options ?? [])]}
                value={value ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value || null)}
              />
            );

          case 'multi_select': {
            /*
             * Default multi-select: a checkbox group, not a custom widget. Native inputs bring
             * keyboard support and correct screen-reader semantics, and `fieldset`/`legend` is
             * what associates the group with its question (PRD §19 accessibility).
             */
            return (
              <fieldset
                id={field.id}
                name={field.name}
                aria-describedby={field['aria-describedby']}
                className="rounded-lg border border-gray-200 p-4"
              >
                <legend className="sr-only">{label}</legend>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {(options ?? []).map((option) => (
                    <Checkbox
                      key={option.value}
                      label={option.label}
                      checked={selected.includes(option.value)}
                      disabled={disabled}
                      onChange={() => toggle(option.value)}
                    />
                  ))}
                </div>
              </fieldset>
            );
          }

          default:
            return (
              <>
                {/* A leading glyph, where the section asks for one — a pin beside a location. */}
                <div className={icon ? 'relative flex items-center' : undefined}>
                  {icon && (
                    <Icon
                      name={icon}
                      className="pointer-events-none absolute left-3.5 text-sm text-gray-400"
                    />
                  )}
                  <TextInput
                    {...field}
                    type="text"
                    className={icon ? 'pl-10' : undefined}
                    maxLength={maxLength ?? undefined}
                    placeholder={placeholder ?? undefined}
                    value={value ?? ''}
                    disabled={disabled}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                </div>
                {counter}
              </>
            );
        }
      }}
    </FormField>
  );
}

/** Marks questions that PRD §8.5 requires before the profile can be published. */
export function publishHint(question) {
  return question.requiredForPublish ? 'Needed to publish' : null;
}
