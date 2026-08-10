import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  TERMINAL_PIPELINE_STAGES,
} from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, SelectInput, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useCompany } from '@/context/CompanyContext';
import {
  fetchPipeline,
  changePipelineStage,
  assignPipelineEntry,
  updatePipelineEntry,
  fetchCompanyMembers,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-14 pipeline (PRD §7.9, §21.4).
 *
 * A lightweight board, not an ATS. The stages are fixed (PRD Appendix D defers customisation), so
 * this screen renders the server's stage list rather than defining one — a stage added to the
 * shared constant appears here without a frontend change.
 *
 * Two rules from §21.4 are visible in the UI rather than hidden in the API:
 *   · rejecting REQUIRES a reason code — the confirm button stays disabled until one is chosen
 *   · recording a hire requires the role — same
 * Both are enforced server-side too; the UI just refuses to send a request it knows is invalid.
 */

/** Human-readable reason codes. The values come from the server so the list cannot drift. */
const REASON_LABELS = {
  experience_mismatch: 'Experience did not match',
  subject_mismatch: 'Subject or specialism did not match',
  location_mismatch: 'Location did not work',
  availability_mismatch: 'Availability did not work',
  compensation_mismatch: 'Compensation expectations',
  credentials_missing: 'Missing credentials',
  role_filled: 'Role was filled',
  no_response: 'No response',
  candidate_withdrew: 'Candidate withdrew',
  other: 'Other',
};

const STAGE_ACCENTS = {
  [PIPELINE_STAGES.NEW_INTEREST]: 'border-t-brand-blue',
  [PIPELINE_STAGES.HIRED]: 'border-t-emerald-500',
  [PIPELINE_STAGES.REJECTED]: 'border-t-gray-400',
};

export function CompanyPipelinePage() {
  const { companySlug } = useParams();
  const { can } = useCompany();
  const mayEdit = can('pipeline:edit');

  const [state, setState] = useState({ status: 'loading' });
  const [includeClosed, setIncludeClosed] = useState(false);
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  /** { entry, stage } while a move needs extra information before it can be sent. */
  const [move, setMove] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(
    async (signal) => {
      try {
        const data = await fetchPipeline(companySlug, { includeClosed }, { signal });
        setState({ status: 'ready', ...data });
      } catch (error) {
        if (signal?.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      }
    },
    [companySlug, includeClosed],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /*
   * The team list, for assignment. Requires `member:manage`, which a recruiter may not hold — so a
   * failure here disables assignment rather than breaking the board.
   */
  useEffect(() => {
    const controller = new AbortController();
    fetchCompanyMembers(companySlug, { signal: controller.signal })
      .then((data) =>
        /*
         * A member row is `{ id, role, user: { id, name, email } }` — the assignable identity is
         * `user.id`, NOT the membership id, because the pipeline stores an owner USER. A removed
         * member's row is retained with no user attached, so those are dropped here.
         */
        setMembers(
          (data.members ?? [])
            .filter((member) => member.user?.id)
            .map((member) => ({
              userId: member.user.id,
              label: member.user.name || member.user.email,
            })),
        ),
      )
      .catch(() => setMembers([]));
    return () => controller.abort();
  }, [companySlug]);

  async function commitMove() {
    if (!move) return;
    setBusy(true);
    try {
      await changePipelineStage(companySlug, move.entry.id, {
        stage: move.stage,
        reasonCode: move.reasonCode ?? null,
        note: move.note?.trim() || null,
        outcome: {
          ...(move.roleTitle ? { roleTitle: move.roleTitle.trim() } : {}),
          ...(move.startDate ? { startDate: move.startDate } : {}),
        },
      });
      setFeedback({
        tone: 'success',
        text: `Moved to ${PIPELINE_STAGE_LABELS[move.stage]}.`,
      });
      setMove(null);
      await load();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error.details?.reasonCode ??
          error.details?.roleTitle ??
          error.details?.stage ??
          error.message ??
          'We could not move that.',
      });
    } finally {
      setBusy(false);
    }
  }

  /** Moving to a stage that needs more information opens a dialog; everything else goes straight. */
  async function requestMove(entry, stage) {
    if (stage === PIPELINE_STAGES.REJECTED) {
      setMove({ entry, stage, reasonCode: '', note: '' });
      return;
    }
    if (stage === PIPELINE_STAGES.HIRED) {
      setMove({ entry, stage, roleTitle: '', startDate: '' });
      return;
    }

    setBusy(true);
    try {
      await changePipelineStage(companySlug, entry.id, { stage, outcome: {} });
      setFeedback({ tone: 'success', text: `Moved to ${PIPELINE_STAGE_LABELS[stage]}.` });
      await load();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.stage ?? error.message ?? 'We could not move that.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function assign(entry, ownerId) {
    setBusy(true);
    try {
      await assignPipelineEntry(companySlug, entry.id, ownerId || null);
      setFeedback({ tone: 'success', text: ownerId ? 'Assigned.' : 'Unassigned.' });
      await load();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.ownerId ?? error.message ?? 'We could not assign that.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveDetail() {
    if (!detail) return;
    setBusy(true);
    try {
      await updatePipelineEntry(companySlug, detail.entry.id, {
        nextAction: detail.nextAction?.trim() || null,
        interview: {
          scheduledFor: detail.scheduledFor || null,
          feedback: detail.feedback?.trim() || null,
        },
      });
      setFeedback({ tone: 'success', text: 'Saved.' });
      setDetail(null);
      await load();
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading the pipeline…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="mt-8 h-72 w-full rounded-2xl" />
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

  const canConfirmMove =
    move &&
    (move.stage === PIPELINE_STAGES.REJECTED
      ? Boolean(move.reasonCode)
      : move.stage === PIPELINE_STAGES.HIRED
        ? Boolean(move.roleTitle?.trim())
        : true);

  return (
    <Container className="py-32">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Pipeline</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            {state.total} {state.total === 1 ? 'candidate' : 'candidates'} in your workflow. Stage
            changes are recorded with who made them.
          </p>
        </div>

        <Checkbox
          label="Show closed"
          name="include-closed"
          checked={includeClosed}
          onChange={(event) => setIncludeClosed(event.target.checked)}
        />
      </div>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {state.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
          <p className="text-base font-semibold text-brand-dark">Nobody in the pipeline yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Add candidates from talent search or your interest inbox. Saving someone to your
            shortlist does not add them here — and never notifies them.
          </p>
          <Button
            to={buildPath(PATHS.COMPANY_SEARCH, { companySlug })}
            variant="primary"
            size="md"
            radius="lg"
            className="mt-5"
          >
            Find candidates
          </Button>
        </div>
      ) : (
        /*
          A horizontally scrolling board. The columns keep a fixed width so a stage with ten
          candidates does not squeeze the others to nothing — the scroll is inside this container,
          so the page itself never scrolls sideways.
        */
        <div className="-mx-4 overflow-x-auto px-4 pb-4">
          <div className="flex min-w-max gap-4">
            {state.stages
              .filter((stage) => includeClosed || !TERMINAL_PIPELINE_STAGES.includes(stage.key))
              .map((stage) => (
                <section
                  key={stage.key}
                  aria-label={stage.label}
                  className={`w-72 flex-none rounded-2xl border border-t-4 border-gray-200 bg-gray-50/60 p-3 ${
                    STAGE_ACCENTS[stage.key] ?? 'border-t-gray-300'
                  }`}
                >
                  <header className="mb-3 flex items-center justify-between px-1">
                    <h2 className="text-sm font-bold text-brand-dark">{stage.label}</h2>
                    <span className="text-xs font-semibold text-gray-500">
                      {stage.entries.length}
                    </span>
                  </header>

                  <ul className="space-y-3">
                    {stage.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            src={entry.candidate.photoUrl ?? undefined}
                            initials={(entry.candidate.name ?? '?').slice(0, 1).toUpperCase()}
                            size="sm"
                            alt=""
                          />
                          <div className="min-w-0 flex-1">
                            <a
                              href={buildPath(PATHS.COMPANY_CANDIDATE, {
                                companySlug,
                                candidateId: entry.candidate.id,
                              })}
                              className="block truncate text-sm font-bold text-brand-dark hover:text-brand-blue"
                            >
                              {entry.candidate.name ?? 'Candidate'}
                            </a>
                            {entry.candidate.headline && (
                              <p className="truncate text-xs text-gray-600">
                                {entry.candidate.headline}
                              </p>
                            )}
                          </div>
                        </div>

                        {entry.nextAction && (
                          <p className="mt-2.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-gray-700">
                            <span className="font-semibold">Next:</span> {entry.nextAction}
                          </p>
                        )}

                        {entry.outcome.rejectionReason && (
                          <p className="mt-2 text-[11px] text-gray-500">
                            {REASON_LABELS[entry.outcome.rejectionReason] ??
                              entry.outcome.rejectionReason}
                          </p>
                        )}

                        {entry.outcome.roleTitle && (
                          <p className="mt-2 text-[11px] text-gray-600">
                            Hired as {entry.outcome.roleTitle}
                            {entry.outcome.startDate ? ` · starts ${entry.outcome.startDate}` : ''}
                          </p>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Badge tone="neutral" size="sm" radius="full">
                            {entry.source === 'interest' ? 'Applied' : 'Sourced'}
                          </Badge>
                          {entry.owner?.name && (
                            <span className="truncate text-[11px] text-gray-500">
                              {entry.owner.name}
                            </span>
                          )}
                        </div>

                        {mayEdit && (
                          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                            <SelectInput
                              aria-label={`Move ${entry.candidate.name ?? 'candidate'} to another stage`}
                              options={[
                                { value: '', label: 'Move to…' },
                                ...state.stages
                                  .filter((option) => option.key !== entry.stage)
                                  .map((option) => ({ value: option.key, label: option.label })),
                              ]}
                              value=""
                              disabled={busy}
                              onChange={(event) => {
                                if (event.target.value) requestMove(entry, event.target.value);
                              }}
                            />

                            <div className="flex gap-2">
                              <SelectInput
                                aria-label={`Assign ${entry.candidate.name ?? 'candidate'}`}
                                options={[
                                  { value: '', label: 'Unassigned' },
                                  ...members.map((member) => ({
                                    value: member.userId,
                                    label: member.label,
                                  })),
                                ]}
                                value={entry.ownerId ?? ''}
                                disabled={busy || members.length === 0}
                                onChange={(event) => assign(entry, event.target.value)}
                              />
                              <button
                                type="button"
                                aria-label={`Edit details for ${entry.candidate.name ?? 'candidate'}`}
                                onClick={() =>
                                  setDetail({
                                    entry,
                                    nextAction: entry.nextAction ?? '',
                                    scheduledFor: entry.interview.scheduledFor
                                      ? String(entry.interview.scheduledFor).slice(0, 10)
                                      : '',
                                    feedback: entry.interview.feedback ?? '',
                                  })
                                }
                                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:text-brand-blue"
                              >
                                <Icon name="pen" className="text-xs" />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}

                    {stage.entries.length === 0 && (
                      <li className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-400">
                        Empty
                      </li>
                    )}
                  </ul>
                </section>
              ))}
          </div>
        </div>
      )}

      {/* Stage move that needs a reason or an outcome. */}
      <Modal
        open={Boolean(move)}
        onClose={() => setMove(null)}
        title={
          move?.stage === PIPELINE_STAGES.REJECTED
            ? `Reject ${move?.entry.candidate.name ?? 'this candidate'}?`
            : `Record a hire`
        }
        description={
          move?.stage === PIPELINE_STAGES.REJECTED
            ? 'A reason is required. It is kept internally — the candidate never sees your notes.'
            : 'The role they were hired into, so your team and your analytics agree.'
        }
      >
        {move?.stage === PIPELINE_STAGES.REJECTED ? (
          <>
            <FormField label="Reason" name="reject-reason" required className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <SelectInput
                  {...control}
                  options={[
                    { value: '', label: 'Choose a reason…' },
                    ...(state.reasonCodes ?? []).map((code) => ({
                      value: code,
                      label: REASON_LABELS[code] ?? code,
                    })),
                  ]}
                  value={move.reasonCode ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setMove((current) => ({ ...current, reasonCode: event.target.value }))
                  }
                />
              )}
            </FormField>

            <FormField
              label="Internal note"
              name="reject-note"
              hint="Optional, and never shown to the candidate."
              className="mb-4"
            >
              {({ hasError: _hasError, ...control }) => (
                <Textarea
                  {...control}
                  rows={3}
                  value={move.note ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setMove((current) => ({ ...current, note: event.target.value }))
                  }
                />
              )}
            </FormField>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Role" name="hire-role" required className="mb-4 sm:col-span-2">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="text"
                  placeholder="e.g. Senior SAT maths tutor"
                  value={move?.roleTitle ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setMove((current) => ({ ...current, roleTitle: event.target.value }))
                  }
                />
              )}
            </FormField>

            <FormField label="Start month" name="hire-start" className="mb-4">
              {({ hasError: _hasError, ...control }) => (
                <TextInput
                  {...control}
                  type="month"
                  value={move?.startDate ?? ''}
                  disabled={busy}
                  onChange={(event) =>
                    setMove((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              )}
            </FormField>
          </div>
        )}

        <div className="mt-2 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setMove(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy || !canConfirmMove}
            onClick={commitMove}
          >
            {busy
              ? 'Saving…'
              : move?.stage === PIPELINE_STAGES.REJECTED
                ? 'Reject candidate'
                : 'Record hire'}
          </Button>
        </div>
      </Modal>

      {/* Next action and interview facts. */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Details — ${detail?.entry.candidate.name ?? 'candidate'}`}
        description="Visible to your team only."
      >
        <FormField
          label="Next action"
          name="next-action"
          hint="e.g. “Call Thursday about availability”."
          className="mb-4"
        >
          {({ hasError: _hasError, ...control }) => (
            <TextInput
              {...control}
              type="text"
              value={detail?.nextAction ?? ''}
              disabled={busy}
              onChange={(event) =>
                setDetail((current) => ({ ...current, nextAction: event.target.value }))
              }
            />
          )}
        </FormField>

        <FormField label="Interview date" name="interview-date" className="mb-4">
          {({ hasError: _hasError, ...control }) => (
            <TextInput
              {...control}
              type="date"
              value={detail?.scheduledFor ?? ''}
              disabled={busy}
              onChange={(event) =>
                setDetail((current) => ({ ...current, scheduledFor: event.target.value }))
              }
            />
          )}
        </FormField>

        <FormField label="Interview feedback" name="interview-feedback" className="mb-4">
          {({ hasError: _hasError, ...control }) => (
            <Textarea
              {...control}
              rows={4}
              value={detail?.feedback ?? ''}
              disabled={busy}
              onChange={(event) =>
                setDetail((current) => ({ ...current, feedback: event.target.value }))
              }
            />
          )}
        </FormField>

        <div className="mt-2 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setDetail(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy}
            onClick={saveDetail}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Modal>
    </Container>
  );
}
