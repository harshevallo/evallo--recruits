import { useState } from 'react';
import { Badge, Button, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { createProfileEntry, updateProfileEntry, deleteProfileEntry } from '@/services';

/**
 * CAN-02 section 7 — credentials and scores (PRD §8.3 section 5, ADR-008).
 *
 * The reference shows an "uploaded PDF" badge on every row. There is no file storage in this API,
 * so that badge would be a claim nothing backs — and on a screen whose entire purpose is trust
 * signals, a fake verification chip is the worst possible thing to draw. Rows instead show what is
 * true: a link the candidate hosts, or nothing yet.
 */

/** The kinds worth suggesting. Stored as free text, so this list can grow without a migration. */
const CREDENTIAL_TYPES = [
  'Standardised test score',
  'Teaching licence or certification',
  'Background check clearance',
  'Degree or diploma',
  'Other',
];

/** One glyph per kind, so a row is identifiable before it is read. */
function iconFor(type) {
  const value = String(type ?? '').toLowerCase();
  if (value.includes('score') || value.includes('test')) return 'star';
  if (value.includes('licence') || value.includes('license') || value.includes('certif')) {
    return 'id-card';
  }
  if (value.includes('background')) return 'file-shield';
  return 'certificate';
}

/** `2028-08` → `Aug 2028`. Falls back to the raw value rather than showing "Invalid Date". */
function formatMonth(value) {
  if (!value) return null;
  const [year, month] = String(value).split('-');
  const date = new Date(Number(year), Number(month) - 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

const EMPTY = {
  name: '',
  credentialType: '',
  issuer: '',
  result: '',
  startDate: '',
  endDate: '',
  documentUrl: '',
  description: '',
};

export function CredentialsSection({ entries = [], onChanged }) {
  const [editing, setEditing] = useState(null); // null | {} for new | entry for edit
  const [values, setValues] = useState(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function openNew() {
    setValues(EMPTY);
    setErrors({});
    setEditing({});
  }

  function openEdit(entry) {
    setValues({ ...EMPTY, ...entry });
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

    const payload = Object.fromEntries(Object.keys(EMPTY).map((key) => [key, values[key] ?? '']));

    try {
      if (editing?.id) await updateProfileEntry('credential', editing.id, payload);
      else await createProfileEntry('credential', payload);

      setEditing(null);
      setFeedback({ tone: 'success', text: editing?.id ? 'Credential updated.' : 'Credential added.' });
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
      await deleteProfileEntry('credential', entry.id);
      setFeedback({ tone: 'success', text: 'Credential removed.' });
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

      <div className="space-y-4">
        {entries.map((entry) => {
          const expiry = formatMonth(entry.endDate);
          const issued = formatMonth(entry.startDate);

          return (
            <div
              key={entry.id}
              className="group relative flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-blue/30 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-blue-50 text-lg text-brand-blue">
                  <Icon name={iconFor(entry.credentialType)} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-brand-dark">{entry.name}</h4>
                  {(entry.result || entry.issuer) && (
                    <p className="text-xs font-medium text-gray-600">
                      {[entry.result, entry.issuer].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {entry.current
                      ? issued
                        ? `Issued ${issued} · does not expire`
                        : 'Does not expire'
                      : [issued && `Issued ${issued}`, expiry && `Expires ${expiry}`]
                          .filter(Boolean)
                          .join(' · ') || 'No dates given'}
                  </p>
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-3 sm:pr-16">
                {entry.documentUrl ? (
                  <a
                    href={entry.documentUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:text-brand-blue"
                  >
                    <Icon name="link" className="text-[10px]" /> View document
                  </a>
                ) : (
                  <Badge tone="neutral" size="sm" radius="md">
                    No document linked
                  </Badge>
                )}
              </div>

              <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 sm:top-1/2 sm:-translate-y-1/2">
                <button
                  type="button"
                  aria-label={`Edit ${entry.name}`}
                  onClick={() => openEdit(entry)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-brand-blue"
                >
                  <Icon name="pen" className="text-xs" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => setConfirmDelete(entry)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-red-500"
                >
                  <Icon name="trash" className="text-xs" />
                </button>
              </div>
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
            <p className="text-sm font-semibold text-brand-dark">No credentials added yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-500">
              Licences, certifications and standardised scores. These become trust signals on
              recruiter search.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={openNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-5 text-sm font-semibold text-gray-500 transition-all hover:border-brand-blue hover:bg-blue-50/40 hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
        >
          <Icon name="plus" /> Add credential, licence, or score report
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        File upload is not available yet, so nothing here is verified. Link a document you already
        host if you want a recruiter to be able to check it.
      </p>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit credential' : 'Add credential or score'}
        description="Everything here saves as a draft. Nothing is visible until you publish."
      >
        <form noValidate onSubmit={submit}>
          <FormField
            label="Credential type"
            name="credential-type"
            error={errors.credentialType}
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <SelectInput
                {...control}
                options={[
                  { value: '', label: 'Select…' },
                  ...CREDENTIAL_TYPES.map((type) => ({ value: type, label: type })),
                ]}
                value={values.credentialType}
                disabled={busy}
                onChange={(event) => setField('credentialType', event.target.value)}
              />
            )}
          </FormField>

          <FormField label="Credential name" name="credential-name" error={errors.name} required className="mb-4">
            {({ hasError: _hasError, ...control }) => (
              <TextInput
                {...control}
                type="text"
                placeholder="e.g. SAT official score report"
                value={values.name}
                disabled={busy}
                onChange={(event) => setField('name', event.target.value)}
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Issued by" name="credential-issuer" error={errors.issuer} className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="text"
                  placeholder="e.g. College Board"
                  value={values.issuer}
                  disabled={busy}
                  onChange={(event) => setField('issuer', event.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="Result or reference"
              name="credential-result"
              error={errors.result}
              className="mb-4"
            >
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="text"
                  placeholder="e.g. 1590 total (800 Math, 790 ERW)"
                  value={values.result}
                  disabled={busy}
                  onChange={(event) => setField('result', event.target.value)}
                />
              )}
            </FormField>

            <FormField label="Issued" name="credential-issued" error={errors.startDate} className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="month"
                  value={values.startDate}
                  disabled={busy}
                  onChange={(event) => setField('startDate', event.target.value)}
                />
              )}
            </FormField>

            <FormField label="Expires" name="credential-expires" error={errors.endDate} className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="month"
                  value={values.endDate}
                  disabled={busy}
                  onChange={(event) => setField('endDate', event.target.value)}
                />
              )}
            </FormField>
          </div>

          {/*
            Where the reference puts a file drop zone. Same visual weight, honest contents: a link
            to a document the candidate already hosts, because nothing here can store a file.
          */}
          <FormField
            label="Link to the document"
            name="credential-document"
            error={errors.documentUrl}
            hint="File upload is not available yet. Paste a link to a copy you already host."
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-slate-50/50 p-4">
                <TextInput
                  {...control}
                  type="url"
                  placeholder="https://…"
                  value={values.documentUrl}
                  disabled={busy}
                  onChange={(event) => setField('documentUrl', event.target.value)}
                />
              </div>
            )}
          </FormField>

          <FormField
            label="Anything worth adding"
            name="credential-description"
            error={errors.description}
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <Textarea
                {...control}
                rows={3}
                value={values.description}
                disabled={busy}
                onChange={(event) => setField('description', event.target.value)}
              />
            )}
          </FormField>

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
              {busy ? 'Saving…' : 'Save credential'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Remove this credential?"
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
