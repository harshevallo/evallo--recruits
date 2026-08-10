import { useState } from 'react';
import { Badge, Button, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import {
  createProfileEntry,
  updateProfileEntry,
  deleteProfileEntry,
} from '@/services';

/**
 * CAN-02 repeatable evidence entries — experience and education (PRD §8.3 sections 4–5, ADR-008).
 *
 * These are records in their own collections, not question-bank answers, so they get a different
 * shape of screen from the rest of the builder: a list you add to, edit in place, and remove
 * from, rather than a form you fill once. Each entry carries its own visibility because ADR-008
 * gives it its own row — a candidate can hide one role without hiding the rest.
 *
 * The other two entry kinds — media and credentials — have their own screens, because a video is
 * presented as a thumbnail card and a credential as a trust row. Only these two share a shape.
 */

/** The fields each kind collects. Mirrors the server's `writable` list for that kind. */
const FIELDS = {
  experience: {
    singular: 'role',
    addLabel: 'Add Role',
    /** Employers are recognised by name, so their tile carries initials. */
    avatar: { kind: 'initials', tone: 'bg-brand-dark' },
    emptyTitle: 'No roles added yet',
    emptyBody:
      'Recruiters read work history before anything else you write. Add the roles that show what you teach and who you teach.',
    primary: 'role',
    secondary: 'organization',
    fields: [
      { key: 'role', label: 'Role title', required: true, placeholder: 'e.g. Lead Physics Teacher' },
      {
        key: 'organization',
        label: 'Organization',
        required: true,
        placeholder: 'e.g. Beacon Learning Labs',
      },
      { key: 'location', label: 'Location', placeholder: 'e.g. Bengaluru (Remote)' },
      { key: 'startDate', label: 'Start month', type: 'month', half: true },
      { key: 'endDate', label: 'End month', type: 'month', half: true },
      { key: 'description', label: 'What you did', type: 'long' },
      {
        key: 'outcome',
        label: 'Measurable outcome',
        hint: 'One concrete result. For example: "Average +2 grades across 40 students".',
      },
    ],
  },
  education: {
    singular: 'qualification',
    addLabel: 'Add Degree',
    /** Institutions get a glyph — two-letter initials of a university name say nothing. */
    avatar: { kind: 'icon', icon: 'building-columns', tone: 'bg-red-800' },
    emptyTitle: 'No qualifications added yet',
    emptyBody: 'Degrees, teaching qualifications, and the institutions that awarded them.',
    primary: 'qualification',
    secondary: 'institution',
    fields: [
      {
        key: 'institution',
        label: 'Institution',
        required: true,
        placeholder: 'e.g. Indian Institute of Science',
      },
      { key: 'qualification', label: 'Qualification', placeholder: 'e.g. M.Sc.', half: true },
      { key: 'fieldOfStudy', label: 'Field of study', placeholder: 'e.g. Physics', half: true },
      { key: 'startDate', label: 'Start month', type: 'month', half: true },
      { key: 'endDate', label: 'End month', type: 'month', half: true },
      { key: 'description', label: 'Anything worth adding', type: 'long' },
    ],
  },
};

/** `2022-08` → `Aug 2022`. Falls back to the raw value rather than showing "Invalid Date". */
function formatMonth(value) {
  if (!value) return null;
  const [year, month] = String(value).split('-');
  const date = new Date(Number(year), Number(month) - 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function dateRange(entry) {
  const start = formatMonth(entry.startDate);
  const end = entry.current ? 'Present' : formatMonth(entry.endDate);
  if (!start && !end) return null;
  return [start, end].filter(Boolean).join(' – ');
}

function initialsOf(text) {
  const parts = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

export function EntrySection({ entryKind, entries, onChanged, title = null }) {
  const config = FIELDS[entryKind];

  const [editing, setEditing] = useState(null); // null | {} for new | entry for edit
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function openNew() {
    setValues({});
    setErrors({});
    setEditing({});
  }

  function openEdit(entry) {
    setValues(entry);
    setErrors({});
    setEditing(entry);
  }

  function setField(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});

    // Only the fields this kind collects — never the whole entry, which carries server-owned state.
    const payload = Object.fromEntries(
      config.fields.map((f) => [f.key, values[f.key] ?? '']).concat([['current', Boolean(values.current)]]),
    );

    try {
      if (editing?.id) await updateProfileEntry(entryKind, editing.id, payload);
      else await createProfileEntry(entryKind, payload);

      setEditing(null);
      setFeedback({ tone: 'success', text: editing?.id ? 'Entry updated.' : 'Entry added.' });
      await onChanged();
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    setBusy(true);
    try {
      await deleteProfileEntry(entryKind, entry.id);
      setFeedback({ tone: 'success', text: 'Entry removed.' });
      await onChanged();
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not remove that.' });
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-5">
          {feedback.text}
        </StatusRegion>
      )}

      {/* Reference header: the list's own name on the left, a blue-tinted add action on the right. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        {title ? (
          <h3 className="text-lg font-bold text-brand-dark">{title}</h3>
        ) : (
          <p className="text-sm text-gray-600">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        )}
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3.5 py-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
        >
          <Icon name="plus" /> {config.addLabel}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-sm font-semibold text-brand-dark">{config.emptyTitle}</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-500">{config.emptyBody}</p>
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="mt-4 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={openNew}
          >
            {config.addLabel}
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              {/*
                Reference-style actions: pen and trash in the card's corner, revealed on hover.
                `focus-within` keeps them reachable by keyboard — hover-only controls are not.
              */}
              <div className="absolute right-5 top-5 flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Edit ${entry[config.primary] || entry[config.secondary]}`}
                  onClick={() => openEdit(entry)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-brand-blue"
                >
                  <Icon name="pen" className="text-xs" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${entry[config.primary] || entry[config.secondary]}`}
                  onClick={() => setConfirmDelete(entry)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-red-500"
                >
                  <Icon name="trash" className="text-xs" />
                </button>
              </div>

              <div className="flex gap-4">
                <span
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl text-sm font-bold text-white ${config.avatar.tone}`}
                >
                  {config.avatar.kind === 'icon' ? (
                    <Icon name={config.avatar.icon} className="text-lg" />
                  ) : (
                    initialsOf(entry[config.secondary])
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-bold text-brand-dark">
                    {entry[config.primary] || entry[config.secondary]}
                  </h4>
                  <p className="text-xs font-semibold text-brand-blue">
                    {[entry[config.secondary], entry.location, entry.fieldOfStudy]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                  {dateRange(entry) && (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {dateRange(entry)}
                    </p>
                  )}

                  {entry.description && (
                    <p className="mt-3 text-sm leading-relaxed text-gray-600">{entry.description}</p>
                  )}

                  {entry.outcome && (
                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        Quantified Outcome
                      </p>
                      <p className="flex items-center gap-2 text-xs text-gray-700">
                        <Icon name="chart-line" className="shrink-0 text-emerald-500" />
                        {entry.outcome}
                      </p>
                    </div>
                  )}

                  {/*
                    Per-item verification state (ADR-008). Shown only once something has actually
                    verified it — a permanent "Unverified" chip on every entry would read as a
                    fault rather than the default it is.
                  */}
                  {entry.verificationStatus && entry.verificationStatus !== 'unverified' && (
                    <Badge tone="successLight" size="sm" radius="full" className="mt-3">
                      {entry.verificationStatus}
                    </Badge>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${config.singular}` : `Add ${config.singular}`}
        description="Everything here saves as a draft. Nothing is visible until you publish."
      >
        <form noValidate onSubmit={submit}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {config.fields.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                name={field.key}
                error={errors[field.key]}
                hint={field.hint}
                required={field.required}
                className={`mb-4 ${field.half ? '' : 'sm:col-span-2'}`}
              >
                {({ hasError: _hasError, ...control }) =>
                  field.type === 'long' ? (
                    <Textarea
                      {...control}
                      rows={3}
                      value={values[field.key] ?? ''}
                      disabled={busy}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  ) : (
                    <TextInput
                      {...control}
                      type={field.type === 'month' ? 'month' : 'text'}
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ''}
                      disabled={busy || (field.key === 'endDate' && Boolean(values.current))}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  )
                }
              </FormField>
            ))}
          </div>

          {/* Mirrors the server rule: "still here" and an end date cannot both be true. */}
          <Checkbox
            label={
              entryKind === 'education' ? 'I am still studying here' : 'I currently work here'
            }
            name="current"
            checked={Boolean(values.current)}
            disabled={busy}
            onChange={(e) => {
              setField('current', e.target.checked);
              if (e.target.checked) setField('endDate', '');
            }}
          />

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" radius="lg" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title={`Remove this ${config.singular}?`}
        description="This deletes the entry from your profile. It cannot be undone."
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirmDelete(null)}
          >
            Keep it
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy}
            onClick={() => remove(confirmDelete)}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
