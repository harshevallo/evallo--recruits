import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  HIRING_INTENT_STATUS,
  ROLE_CATEGORY_OPTIONS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_OPTIONS,
} from '@evallo/shared';
import { Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useCompany } from '@/context/CompanyContext';
import {
  fetchHiringIntents,
  createHiringIntent,
  updateHiringIntent,
  changeHiringIntentStatus,
} from '@/services';

/**
 * REC-16 hiring intents (PRD §7.5, §7.6).
 *
 * A hiring intent is NOT a job posting. PRD §7.5 is explicit that no description is required, so
 * this form asks for role categories, engagement and delivery — and stops. The description field
 * exists and is optional; making it required here would quietly turn the MVP into the job-postings
 * feature ADR-016 lists as unscheduled.
 *
 * "Currently hiring" is not a separate switch. It is whether any intent is active, which is why
 * activating one here is what makes the public page and the candidate CTA say the company is
 * hiring — one source of truth rather than a flag that can disagree with the intents it summarises.
 */

const STATUS_TONES = {
  [HIRING_INTENT_STATUS.ACTIVE]: 'successLight',
  [HIRING_INTENT_STATUS.DRAFT]: 'neutral',
  [HIRING_INTENT_STATUS.PAUSED]: 'neutral',
  [HIRING_INTENT_STATUS.CLOSED]: 'neutral',
  [HIRING_INTENT_STATUS.ARCHIVED]: 'neutral',
};

const STATUS_LABELS = {
  [HIRING_INTENT_STATUS.ACTIVE]: 'Active',
  [HIRING_INTENT_STATUS.DRAFT]: 'Draft',
  [HIRING_INTENT_STATUS.PAUSED]: 'Paused',
  [HIRING_INTENT_STATUS.CLOSED]: 'Closed',
  [HIRING_INTENT_STATUS.ARCHIVED]: 'Archived',
};

/** The transitions the server allows, mirrored so the UI offers only real actions. */
const NEXT_STATUSES = {
  [HIRING_INTENT_STATUS.DRAFT]: [HIRING_INTENT_STATUS.ACTIVE, HIRING_INTENT_STATUS.ARCHIVED],
  [HIRING_INTENT_STATUS.ACTIVE]: [HIRING_INTENT_STATUS.PAUSED, HIRING_INTENT_STATUS.CLOSED],
  [HIRING_INTENT_STATUS.PAUSED]: [HIRING_INTENT_STATUS.ACTIVE, HIRING_INTENT_STATUS.CLOSED],
  [HIRING_INTENT_STATUS.CLOSED]: [HIRING_INTENT_STATUS.ACTIVE, HIRING_INTENT_STATUS.ARCHIVED],
  [HIRING_INTENT_STATUS.ARCHIVED]: [],
};

const ACTION_LABELS = {
  [HIRING_INTENT_STATUS.ACTIVE]: 'Activate',
  [HIRING_INTENT_STATUS.PAUSED]: 'Pause',
  [HIRING_INTENT_STATUS.CLOSED]: 'Close',
  [HIRING_INTENT_STATUS.ARCHIVED]: 'Archive',
};

const EMPLOYMENT_OPTIONS = Object.values(EMPLOYMENT_TYPES).map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABELS[value] ?? value,
}));

const EMPTY_FORM = {
  title: '',
  roleCategories: [],
  employmentTypes: [],
  deliveryModes: [],
  subjects: '',
  tests: '',
  description: '',
  interestQuestions: [],
};

/** `"SAT, ACT"` ⇄ `['SAT','ACT']`. The API stores arrays; the form is easier as text. */
const toList = (text) =>
  String(text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

function formFromIntent(intent) {
  return {
    title: intent.title ?? '',
    roleCategories: intent.roleCategories ?? [],
    employmentTypes: intent.employmentTypes ?? [],
    deliveryModes: intent.deliveryModes ?? [],
    subjects: (intent.specializations?.subjects ?? []).join(', '),
    tests: (intent.specializations?.tests ?? []).join(', '),
    description: intent.description ?? '',
    interestQuestions: intent.interestQuestions ?? [],
  };
}

export function CompanyHiringPage() {
  const { companySlug } = useParams();
  const { can } = useCompany();
  const mayManage = can('hiring:manage');

  const [state, setState] = useState({ status: 'loading' });
  const [editing, setEditing] = useState(null); // null | {} for new | intent for edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmStatus, setConfirmStatus] = useState(null); // { intent, status }

  const load = useCallback(
    async (signal) => {
      try {
        const data = await fetchHiringIntents(companySlug, { signal });
        setState({ status: 'ready', intents: data.intents });
      } catch (error) {
        if (signal?.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      }
    },
    [companySlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function toggleIn(field, value) {
    setForm((current) => {
      const list = current[field];
      return {
        ...current,
        [field]: list.includes(value)
          ? list.filter((item) => item !== value)
          : [...list, value],
      };
    });
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});

    const payload = {
      title: form.title,
      roleCategories: form.roleCategories,
      employmentTypes: form.employmentTypes,
      deliveryModes: form.deliveryModes,
      specializations: { subjects: toList(form.subjects), tests: toList(form.tests) },
      description: form.description,
      interestQuestions: form.interestQuestions.filter((question) => question.prompt?.trim()),
    };

    try {
      if (editing?.id) await updateHiringIntent(companySlug, editing.id, payload);
      else await createHiringIntent(companySlug, payload);

      setEditing(null);
      setFeedback({
        tone: 'success',
        text: editing?.id ? 'Hiring intent updated.' : 'Hiring intent saved as a draft.',
      });
      await load();
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyStatus(intent, status, reason = null) {
    setBusy(true);
    try {
      await changeHiringIntentStatus(companySlug, intent.id, status, reason);
      setFeedback({
        tone: 'success',
        text:
          status === HIRING_INTENT_STATUS.ACTIVE
            ? 'This intent is live. Candidates can now express interest in it.'
            : `Intent ${STATUS_LABELS[status].toLowerCase()}.`,
      });
      await load();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.status ?? error.message ?? 'We could not change that.',
      });
    } finally {
      setBusy(false);
      setConfirmStatus(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading hiring intents…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load this.'}</StatusRegion>
      </Container>
    );
  }

  const live = state.intents.filter((intent) => intent.status === HIRING_INTENT_STATUS.ACTIVE);

  return (
    <Container className="py-32">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Hiring</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Say what you are hiring for. No job description is required — role, engagement and
            delivery are enough for candidates to find you.
          </p>
        </div>

        {mayManage && (
          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            onClick={() => {
              setForm(EMPTY_FORM);
              setErrors({});
              setEditing({});
            }}
          >
            <Icon name="plus" /> New hiring intent
          </Button>
        )}
      </div>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {/*
        The company-level answer to "are you hiring?". Derived, not stored — see the service.
      */}
      <div className="mb-8 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span
          className={`h-2.5 w-2.5 flex-none rounded-full ${live.length > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`}
          aria-hidden="true"
        />
        <p className="text-sm text-gray-700">
          {live.length > 0 ? (
            <>
              <strong className="font-semibold text-brand-dark">Currently hiring</strong> —{' '}
              {live.length} active {live.length === 1 ? 'intent' : 'intents'}. Your public page shows
              this.
            </>
          ) : (
            <>
              <strong className="font-semibold text-brand-dark">Not currently hiring.</strong>{' '}
              Activate an intent to appear in candidate searches for it.
            </>
          )}
        </p>
      </div>

      {state.intents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
          <p className="text-base font-semibold text-brand-dark">No hiring intents yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            An intent is a lightweight declaration: the roles you want, how you engage people, and
            where they work. Candidates express interest against it.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {state.intents.map((intent) => (
            <li
              key={intent.id}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2.5">
                    <h2 className="text-lg font-bold text-brand-dark">
                      {intent.title || 'Untitled intent'}
                    </h2>
                    <Badge tone={STATUS_TONES[intent.status] ?? 'neutral'} size="sm" radius="full">
                      {STATUS_LABELS[intent.status] ?? intent.status}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-600">
                    {(intent.roleCategories ?? [])
                      .map(
                        (value) =>
                          ROLE_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ??
                          value,
                      )
                      .join(' · ') || 'No role categories yet'}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {[
                      (intent.employmentTypes ?? [])
                        .map((value) => EMPLOYMENT_TYPE_LABELS[value] ?? value)
                        .join(', '),
                      (intent.deliveryModes ?? [])
                        .map(
                          (value) =>
                            DELIVERY_MODE_OPTIONS.find((option) => option.value === value)?.label ??
                            value,
                        )
                        .join(', '),
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Engagement and delivery not set'}
                  </p>

                  {(intent.specializations?.subjects?.length > 0 ||
                    intent.specializations?.tests?.length > 0) && (
                    <p className="mt-2 text-xs text-gray-600">
                      {[...intent.specializations.subjects, ...intent.specializations.tests].join(
                        ' · ',
                      )}
                    </p>
                  )}

                  {intent.interestQuestions.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      {intent.interestQuestions.length} interest{' '}
                      {intent.interestQuestions.length === 1 ? 'question' : 'questions'} asked at
                      submission
                    </p>
                  )}

                  {intent.closedReason && (
                    <p className="mt-2 text-xs text-gray-500">Reason: {intent.closedReason}</p>
                  )}
                </div>

                {mayManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outlineDark"
                      size="sm"
                      radius="lg"
                      className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                      onClick={() => {
                        setForm(formFromIntent(intent));
                        setErrors({});
                        setEditing(intent);
                      }}
                    >
                      Edit
                    </Button>

                    {(NEXT_STATUSES[intent.status] ?? []).map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={status === HIRING_INTENT_STATUS.ACTIVE ? 'primary' : 'outlineDark'}
                        size="sm"
                        radius="lg"
                        disabled={busy}
                        className={
                          status === HIRING_INTENT_STATUS.ACTIVE
                            ? undefined
                            : '!border-gray-300 !text-brand-dark hover:!bg-gray-50'
                        }
                        onClick={() => {
                          // Closing and archiving take a reason, so they confirm first.
                          if (
                            status === HIRING_INTENT_STATUS.CLOSED ||
                            status === HIRING_INTENT_STATUS.ARCHIVED
                          ) {
                            setConfirmStatus({ intent, status, reason: '' });
                          } else {
                            applyStatus(intent, status);
                          }
                        }}
                      >
                        {ACTION_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create / edit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit hiring intent' : 'New hiring intent'}
        description="Saved as a draft. Activate it when you want candidates to see it."
      >
        <form noValidate onSubmit={submit}>
          <FormField
            label="Title"
            name="intent-title"
            error={errors.title}
            hint="For your team's reference, e.g. “SAT maths tutor, evenings”."
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={form.title}
                disabled={busy}
                onChange={(event) => setForm((c) => ({ ...c, title: event.target.value }))}
              />
            )}
          </FormField>

          <fieldset className="mb-4">
            <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
              Role categories
              <span className="text-red-600" aria-hidden="true">
                {' '}
                *
              </span>
            </legend>
            {errors.roleCategories && (
              <p className="mb-1.5 text-sm text-red-600">{errors.roleCategories}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {ROLE_CATEGORY_OPTIONS.map((option) => {
                const selected = form.roleCategories.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                        : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-blue"
                      checked={selected}
                      disabled={busy}
                      onChange={() => toggleIn('roleCategories', option.value)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mb-4">
            <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
              Engagement type
              <span className="text-red-600" aria-hidden="true">
                {' '}
                *
              </span>
            </legend>
            {errors.employmentTypes && (
              <p className="mb-1.5 text-sm text-red-600">{errors.employmentTypes}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {EMPLOYMENT_OPTIONS.map((option) => {
                const selected = form.employmentTypes.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                        : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-blue"
                      checked={selected}
                      disabled={busy}
                      onChange={() => toggleIn('employmentTypes', option.value)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mb-4">
            <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
              Delivery mode
              <span className="text-red-600" aria-hidden="true">
                {' '}
                *
              </span>
            </legend>
            {errors.deliveryModes && (
              <p className="mb-1.5 text-sm text-red-600">{errors.deliveryModes}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {DELIVERY_MODE_OPTIONS.map((option) => {
                const selected = form.deliveryModes.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selected
                        ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                        : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-blue"
                      checked={selected}
                      disabled={busy}
                      onChange={() => toggleIn('deliveryModes', option.value)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Subjects"
              name="intent-subjects"
              error={errors.specializations}
              hint="Comma separated."
              className="mb-4"
            >
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="text"
                  placeholder="Mathematics, Physics"
                  value={form.subjects}
                  disabled={busy}
                  onChange={(event) => setForm((c) => ({ ...c, subjects: event.target.value }))}
                />
              )}
            </FormField>

            <FormField label="Tests" name="intent-tests" hint="Comma separated." className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="text"
                  placeholder="SAT, ACT"
                  value={form.tests}
                  disabled={busy}
                  onChange={(event) => setForm((c) => ({ ...c, tests: event.target.value }))}
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Anything else worth saying"
            name="intent-description"
            error={errors.description}
            hint="Optional. A description is never required to hire on Evallo Recruit."
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <Textarea
                {...control}
                rows={3}
                value={form.description}
                disabled={busy}
                onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
              />
            )}
          </FormField>

          {/*
            Interest questions. Capped at three by the PRD (§7.5, §8.7) — the cap is the product
            rule that keeps expressing interest lightweight, so the UI stops offering a fourth
            rather than letting the server refuse it.
          */}
          <fieldset className="mb-4">
            <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
              Questions to ask candidates
            </legend>
            <p className="mb-2 text-xs text-gray-500">
              Up to three short questions, asked when someone expresses interest.
            </p>
            {errors.interestQuestions && (
              <p className="mb-1.5 text-sm text-red-600">{errors.interestQuestions}</p>
            )}

            <div className="space-y-3">
              {form.interestQuestions.map((question, index) => (
                <div key={index} className="rounded-xl border border-gray-200 bg-slate-50/50 p-3">
                  <TextInput
                    type="text"
                    aria-label={`Question ${index + 1}`}
                    placeholder="e.g. Which SAT sections do you coach?"
                    value={question.prompt ?? ''}
                    disabled={busy}
                    onChange={(event) =>
                      setForm((c) => ({
                        ...c,
                        interestQuestions: c.interestQuestions.map((item, i) =>
                          i === index ? { ...item, prompt: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Checkbox
                      label="Answer required"
                      name={`question-required-${index}`}
                      checked={Boolean(question.required)}
                      disabled={busy}
                      onChange={(event) =>
                        setForm((c) => ({
                          ...c,
                          interestQuestions: c.interestQuestions.map((item, i) =>
                            i === index ? { ...item, required: event.target.checked } : item,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="text-xs font-semibold text-gray-500 transition-colors hover:text-red-600"
                      onClick={() =>
                        setForm((c) => ({
                          ...c,
                          interestQuestions: c.interestQuestions.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {form.interestQuestions.length < 3 && (
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                radius="lg"
                className="mt-3 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
                onClick={() =>
                  setForm((c) => ({
                    ...c,
                    interestQuestions: [...c.interestQuestions, { prompt: '', required: false }],
                  }))
                }
              >
                <Icon name="plus" /> Add question
              </Button>
            )}
          </fieldset>

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
              {busy ? 'Saving…' : 'Save intent'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Closing or archiving. The reason is kept on the audit record (PRD §11.4). */}
      <Modal
        open={Boolean(confirmStatus)}
        onClose={() => setConfirmStatus(null)}
        title={
          confirmStatus?.status === HIRING_INTENT_STATUS.ARCHIVED
            ? 'Archive this intent?'
            : 'Close this intent?'
        }
        description={
          confirmStatus?.status === HIRING_INTENT_STATUS.ARCHIVED
            ? 'Archiving is final. Pipeline entries and history are kept.'
            : 'Candidates can no longer express interest in it. Pipeline entries and history are kept, and you can reopen it later.'
        }
      >
        <FormField label="Reason" name="close-reason" hint="Optional. Kept for your records.">
          {({ hasError: _hasError, ...control }) => (
            <TextInput
              {...control}
              type="text"
              value={confirmStatus?.reason ?? ''}
              disabled={busy}
              onChange={(event) =>
                setConfirmStatus((current) => ({ ...current, reason: event.target.value }))
              }
            />
          )}
        </FormField>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirmStatus(null)}
          >
            Keep it open
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy}
            onClick={() =>
              applyStatus(
                confirmStatus.intent,
                confirmStatus.status,
                confirmStatus.reason?.trim() || null,
              )
            }
          >
            {busy
              ? 'Working…'
              : confirmStatus?.status === HIRING_INTENT_STATUS.ARCHIVED
                ? 'Archive'
                : 'Close intent'}
          </Button>
        </div>
      </Modal>
    </Container>
  );
}
