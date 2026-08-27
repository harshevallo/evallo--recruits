import { useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { Icon } from '@/components/ui';

/**
 * Free-text list entry — subjects, service regions, educator perks.
 *
 * These are `[String]` on the model with no taxonomy behind them. They used to be one
 * comma-separated line, which works but hides the value: you cannot see where one entry ends, a
 * stray comma silently splits a name, and removing the third of six means counting commas.
 *
 * ── Committing on blur, which is the bug this exists to avoid ─────────────────────────────────
 *
 * Typing "AP Calculus" and clicking Save without pressing Enter must not discard it. `onBlur`
 * commits whatever is pending, so the visible text always ends up in the value. Without that, a
 * chip input silently loses the last thing a person typed — the single most common complaint
 * about this control everywhere it appears.
 *
 * ── Why the raw text is local state ───────────────────────────────────────────────────────────
 *
 * The component owns the in-progress string; the caller owns the committed array. Feeding a parsed
 * value back into the text box would rewrite it as the user types.
 *
 * @param {string[]} value            Committed entries.
 * @param {Function} onChange         Called with the next array.
 * @param {number}   [maxTags]        Refuses further entries once reached.
 * @param {number}   [maxLength=80]   Per-entry cap, matching the server's own.
 */
export function TagInput({
  id,
  name,
  value = [],
  onChange,
  disabled = false,
  placeholder,
  hasError = false,
  maxTags,
  maxLength = 80,
  ...rest
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const atLimit = typeof maxTags === 'number' && value.length >= maxTags;

  function commit(raw) {
    const entry = raw.trim().slice(0, maxLength);
    if (!entry) return;

    /* Case-insensitive, because "SAT" and "sat" are the same subject to everyone but a string. */
    const duplicate = value.some((existing) => existing.toLowerCase() === entry.toLowerCase());
    if (duplicate || atLimit) {
      setText('');
      return;
    }

    onChange([...value, entry]);
    setText('');
  }

  function removeAt(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(event) {
    /* Comma as well as Enter: people paste and type lists with commas out of habit. */
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(text);
      return;
    }

    /* Backspace on an empty box removes the last chip — the convention for every chip input. */
    if (event.key === 'Backspace' && text === '' && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-[3.25rem] flex-wrap items-start gap-2 rounded-xl border bg-white p-2.5 shadow-sm transition-colors',
        'focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/15',
        hasError ? 'border-red-500' : 'border-slate-200',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      {value.map((entry, index) => (
        <span
          key={entry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-brand-dark"
        >
          {entry}
          <button
            type="button"
            disabled={disabled}
            onClick={() => removeAt(index)}
            aria-label={`Remove ${entry}`}
            className="rounded text-slate-400 transition-colors hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-not-allowed"
          >
            <Icon name="xmark" className="text-[10px]" />
          </button>
        </span>
      ))}

      {/*
        The real control. `FormField` labels THIS via `id`, so the surrounding box stays a plain
        container — it is not focusable and carries no role of its own, which keeps the tab order
        to one stop per input plus one per remove button.
      */}
      <input
        {...rest}
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={text}
        disabled={disabled || atLimit}
        placeholder={atLimit ? `Limit of ${maxTags} reached` : placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(text)}
        className="min-w-[10rem] flex-1 border-none bg-transparent px-2 py-1.5 text-sm font-medium text-brand-dark outline-none placeholder:font-normal placeholder:text-gray-400 disabled:cursor-not-allowed"
      />
    </div>
  );
}
