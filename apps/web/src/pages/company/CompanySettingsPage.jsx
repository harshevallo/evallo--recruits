import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, Container, Icon, Modal, Pagination } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useCompany } from '@/context/CompanyContext';
import {
  fetchCompanyEditor,
  publishCompany,
  unpublishCompany,
  fetchCompanyAudit,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * SET-02 — company settings (PRD Appendix A, §9.3, §14.3, §16.1).
 *
 * Deliberately narrow. The PRD names this screen but specifies only two things a company actually
 * decides here, and both already have endpoints behind them:
 *
 *   · whether the public page is live — §9.3's draft / published states
 *   · who did what — the audit trail §14.3 and §16.1 require
 *
 * Everything else people expect under "settings" — data export, retention windows, workflow
 * customisation — is either Phase 2 or absent from the PRD, so it is absent here too rather than
 * present as a control that does nothing.
 */

/** Audit actions in the company's own words. An unknown action falls back to its raw key. */
const ACTION_LABELS = {
  'candidate_profile.viewed': 'Viewed a candidate profile',
  'candidate_contact.revealed': 'Revealed candidate contact details',
  'hiring_intent.created': 'Created a hiring intent',
  'hiring_intent.updated': 'Updated a hiring intent',
  'hiring_intent.status_changed': 'Changed a hiring intent status',
  'pipeline_entry.created': 'Added a candidate to the pipeline',
  'pipeline_entry.stage_changed': 'Moved a candidate to another stage',
  'pipeline_entry.assigned': 'Assigned a pipeline entry',
  'candidate.saved': 'Saved a candidate to the shortlist',
  'candidate.unsaved': 'Removed a candidate from the shortlist',
  'note.created': 'Wrote an internal note',
  'note.deleted': 'Deleted an internal note',
};

export function CompanySettingsPage() {
  const { companySlug } = useParams();
  const { can, refresh } = useCompany();
  const maySettings = can('company:settings');
  const mayEdit = can('company:edit');

  const [state, setState] = useState({ status: 'loading' });
  const [audit, setAudit] = useState({ status: 'loading', events: [], meta: null });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const load = useCallback(
    async (signal) => {
      try {
        const data = await fetchCompanyEditor(companySlug, { signal });
        setState({ status: 'ready', company: data.company, checklist: data.checklist });
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

  /* The trail needs `company:settings`. Without it the rest of the page still works. */
  useEffect(() => {
    if (!maySettings) {
      setAudit({ status: 'forbidden', events: [], meta: null });
      return undefined;
    }

    const controller = new AbortController();
    fetchCompanyAudit(companySlug, { page }, { signal: controller.signal })
      .then((data) => setAudit({ status: 'ready', events: data.events, meta: data.meta }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setAudit({ status: 'error', events: [], meta: null, message: error.message });
      });

    return () => controller.abort();
  }, [companySlug, page, maySettings]);

  async function changeVisibility(publish) {
    setBusy(true);
    setFeedback(null);
    try {
      if (publish) await publishCompany(companySlug);
      else await unpublishCompany(companySlug);

      await refresh().catch(() => {});
      await load();
      setFeedback({
        tone: 'success',
        text: publish
          ? 'Your company page is live.'
          : 'Your company page is offline. Nothing was deleted.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.publish ?? error.message ?? 'We could not change that.',
      });
    } finally {
      setBusy(false);
      setConfirmUnpublish(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading settings…</span>
          <Skeleton className="h-10 w-56 rounded-lg" />
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

  const isPublished = state.company.status === 'published';
  const blockers = state.checklist?.blockers ?? [];

  return (
    <Container className="py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Company settings</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          {state.company.name} — who can find you, and a record of what your team has done.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {/* Page visibility — PRD §9.3's two states, over the endpoints that already exist. */}
      <section
        aria-labelledby="visibility-heading"
        className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 id="visibility-heading" className="text-lg font-bold text-brand-dark">
          Public page
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          A published page is visible to anyone. A draft is visible only to your team.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 flex-none rounded-full ${
                isPublished ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-brand-dark">
                {isPublished ? 'Live' : 'Draft — not public'}
              </p>
              <p className="text-xs text-gray-500">
                {isPublished
                  ? `/companies/${state.company.slug}`
                  : 'Publish to make it findable.'}
              </p>
            </div>
          </div>

          {mayEdit && (
            <div className="flex flex-wrap gap-2">
              <Button
                to={buildPath(PATHS.COMPANY_EDIT, { companySlug })}
                variant="outlineDark"
                size="sm"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Edit page
              </Button>

              {isPublished ? (
                <Button
                  type="button"
                  variant="outlineDark"
                  size="sm"
                  radius="lg"
                  className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                  disabled={busy}
                  onClick={() => setConfirmUnpublish(true)}
                >
                  Take offline
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  radius="lg"
                  disabled={busy || blockers.length > 0}
                  onClick={() => changeVisibility(true)}
                >
                  {busy ? 'Publishing…' : 'Publish'}
                </Button>
              )}
            </div>
          )}
        </div>

        {!isPublished && blockers.length > 0 && (
          <p className="mt-3 text-xs text-gray-600">
            {blockers.length} item{blockers.length === 1 ? '' : 's'} still needed before publishing:{' '}
            {blockers.join(', ')}.
          </p>
        )}
      </section>

      {/* Audit trail. §16.1 requires the record; a company must be able to read its own. */}
      <section
        aria-labelledby="audit-heading"
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 id="audit-heading" className="text-lg font-bold text-brand-dark">
          Activity log
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Every candidate profile your team opened, and every change to hiring and pipeline records.
          Append-only.
        </p>

        {audit.status === 'forbidden' && (
          <p className="mt-5 text-sm text-gray-500">
            Your role cannot read the activity log. An owner or admin can.
          </p>
        )}

        {audit.status === 'loading' && <Skeleton className="mt-5 h-40 w-full rounded-xl" />}

        {audit.status === 'error' && (
          <StatusRegion tone="error" className="mt-5">
            {audit.message ?? 'We could not load the log.'}
          </StatusRegion>
        )}

        {audit.status === 'ready' && audit.events.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
            <p className="text-sm font-semibold text-brand-dark">Nothing recorded yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-gray-600">
              Entries appear as your team views candidates and moves them through the pipeline.
            </p>
          </div>
        )}

        {audit.status === 'ready' && audit.events.length > 0 && (
          <>
            <ul className="mt-5 divide-y divide-gray-100">
              {audit.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <Icon name="circle-check" className="text-xs text-gray-300" />
                  <p className="text-sm text-brand-dark">
                    {ACTION_LABELS[event.action] ?? event.action}
                  </p>
                  <p className="text-xs text-gray-500">
                    {event.actor?.name || event.actor?.email || 'A former member'} ·{' '}
                    {new Date(event.at).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {event.metadata?.reasonCode && (
                    <Badge tone="neutral" size="sm" radius="full">
                      {String(event.metadata.reasonCode).replace(/_/g, ' ')}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>

            {audit.meta && audit.meta.totalPages > 1 && (
              <div className="mt-6">
                <Pagination
                  page={audit.meta.page}
                  totalPages={audit.meta.totalPages}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </section>

      <Modal
        open={confirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
        title="Take your page offline?"
        description="It stops being public and drops out of the directory. Your content, team, candidates and pipeline are all kept, and you can publish again at any time."
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirmUnpublish(false)}
          >
            Keep it live
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy}
            onClick={() => changeVisibility(false)}
          >
            {busy ? 'Working…' : 'Take offline'}
          </Button>
        </div>
      </Modal>
    </Container>
  );
}
