import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PIPELINE_STAGE_LABELS, SUBJECT_LABELS } from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { addToPipeline, fetchSavedCandidates, unsaveCandidate } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-20 — the shortlist.
 *
 * ── Why this screen exists ────────────────────────────────────────────────────────────────────
 *
 * The save action has been on the search results and the candidate profile since M5, the API has
 * been built and documented since then, and `listSavedCandidates` even returns a `pipelineStage`
 * whose own comment describes this screen — "lets the shortlist show 'already in Reviewing'
 * instead of offering a duplicate add". What never existed was somewhere to read it. A recruiter
 * could save a candidate and then had no way back to them.
 *
 * ── Nothing here is new ───────────────────────────────────────────────────────────────────────
 *
 * No model, endpoint or permission changed. `PIPELINE_SOURCES.SHORTLIST` was already a valid,
 * validated enum value that nothing used; adding from here is what it was defined for.
 *
 * ── Not a search result ───────────────────────────────────────────────────────────────────────
 *
 * `CandidateResultCard` is deliberately NOT reused. The shortlist serialiser returns the thin
 * `candidateCard` shape — flat `name`/`headline`/`subjects`, and a `location` without `city` —
 * while that card reads `header.*`, `expertise.subjects`, `introduction` and `matchedOn`. Feeding
 * one the other would render a card with three empty sections. This follows `CompanyHiresPage`
 * instead, which consumes exactly this shape.
 */

/** Timestamp → "1 Sep 2026". Returns null so the caller can decide what a missing date reads as. */
function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One shortlisted candidate.
 *
 * Three actions, ranked. "Add to pipeline" is the one that moves work forward, so it is the only
 * filled control; the profile is a quiet link, and removing a bookmark is the quietest thing on
 * the row. Once they are in the pipeline the add is replaced by the stage they are in rather than
 * offering to add them twice — the server is idempotent about it either way, but a button that
 * silently does nothing is worse than no button.
 */
function SavedRow({ row, companySlug, busy, onAddToPipeline, onUnsave }) {
  const { candidate, pipelineStage } = row;
  const savedAt = formatDate(row.savedAt);
  const subjects = candidate?.subjects ?? [];

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar
          src={candidate?.photoUrl ?? undefined}
          initials={(candidate?.name ?? '?').slice(0, 1).toUpperCase()}
          size="md"
          alt=""
        />

        <div className="min-w-0">
          <Link
            to={buildPath(PATHS.COMPANY_CANDIDATE, {
              companySlug,
              candidateId: candidate?.id,
            })}
            className="text-base font-semibold text-brand-dark hover:text-brand-blue hover:underline"
          >
            {candidate?.name ?? 'Candidate'}
          </Link>

          {candidate?.headline && (
            <p className="mt-0.5 break-words text-sm text-gray-700">{candidate.headline}</p>
          )}

          {/* Flat `subjects` on this shape — not `expertise.subjects`. */}
          {subjects.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {subjects.slice(0, 6).map((subject) => (
                <span
                  key={subject}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                >
                  {SUBJECT_LABELS[subject] ?? subject}
                </span>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-gray-600">
            {savedAt ? `Saved ${savedAt}` : 'Saved'}
            {typeof candidate?.yearsExperience === 'number' &&
              ` · ${candidate.yearsExperience} years exp.`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {pipelineStage ? (
          <Badge tone="neutral" size="sm" radius="full">
            In {PIPELINE_STAGE_LABELS[pipelineStage] ?? 'pipeline'}
          </Badge>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="none"
            radius="lg"
            className="justify-center px-3.5 py-2 text-sm font-semibold"
            disabled={busy}
            onClick={onAddToPipeline}
          >
            Add to pipeline
            {/* Several of these sit in one list; the visible label alone names none of them. */}
            <span className="sr-only"> — {candidate?.name ?? 'this candidate'}</span>
          </Button>
        )}

        <Button
          type="button"
          variant="link"
          size="none"
          radius="lg"
          className="px-2 py-1 text-sm font-medium text-gray-500 hover:text-brand-dark"
          disabled={busy}
          onClick={onUnsave}
        >
          <Icon name="star" className="text-xs" />
          Unsave
          <span className="sr-only"> {candidate?.name ?? 'this candidate'}</span>
        </Button>
      </div>
    </li>
  );
}

export function CompanySavedCandidatesPage() {
  const { companySlug } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [actionBusy, setActionBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = useCallback(
    async (signal) => {
      try {
        const data = await fetchSavedCandidates(companySlug, { signal });
        setState({ status: 'ready', saved: data.saved ?? [] });
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

  /*
   * The same call the search results and the candidate profile already make, with the source this
   * screen actually is. `source` decides only the opening stage — `shortlist` lands in Sourced,
   * exactly as `search` does — so this records how they were found and changes nothing else.
   */
  async function addCandidate(row) {
    setActionBusy(row.id);
    setFeedback(null);
    try {
      const { entry } = await addToPipeline(companySlug, {
        candidateId: row.candidate.id,
        source: 'shortlist',
      });
      setState((current) => ({
        ...current,
        saved: current.saved.map((item) =>
          item.id === row.id ? { ...item, pipelineStage: entry.stage } : item,
        ),
      }));
      setFeedback({
        tone: 'success',
        text: `Added to ${PIPELINE_STAGE_LABELS[entry.stage] ?? 'the pipeline'}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.stage ?? error.message ?? 'We could not add them.',
      });
    } finally {
      setActionBusy(null);
    }
  }

  /*
   * Optimistic, and reverted if the server refuses — the pattern the search page established.
   * Removing a bookmark is silent to the candidate, as saving was (PRD §21.4): nothing here
   * notifies anyone.
   */
  async function removeSaved(row) {
    setActionBusy(row.id);
    setFeedback(null);
    const previous = state.saved;
    setState((current) => ({ ...current, saved: current.saved.filter((i) => i.id !== row.id) }));

    try {
      await unsaveCandidate(companySlug, row.candidate.id);
      setFeedback({ tone: 'success', text: 'Removed from your saved candidates.' });
    } catch (error) {
      setState((current) => ({ ...current, saved: previous }));
      setFeedback({ tone: 'error', text: error.message ?? 'We could not remove that.' });
    } finally {
      setActionBusy(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your saved candidates…</span>
          <Skeleton className="h-10 w-56 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load your saved candidates.'}
        </StatusRegion>
      </Container>
    );
  }

  const { saved } = state;
  const total = saved.length;

  return (
    <Container className="py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Saved candidates</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          {total === 0
            ? 'Candidates you bookmark while searching are kept here.'
            : `${total} ${total === 1 ? 'candidate' : 'candidates'} your company has bookmarked.`}
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
          <p className="text-base font-semibold text-brand-dark">No saved candidates yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Saving is private — the candidate is never told. Use the star on a search result to keep
            someone here for later.
          </p>
          <Button
            to={buildPath(PATHS.COMPANY_SEARCH, { companySlug })}
            variant="primary"
            size="md"
            radius="lg"
            className="mt-6"
          >
            Find candidates <Icon name="arrow-right" className="text-sm" />
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {saved.map((row) => (
            <SavedRow
              key={row.id}
              row={row}
              companySlug={companySlug}
              busy={actionBusy === row.id}
              onAddToPipeline={() => addCandidate(row)}
              onUnsave={() => removeSaved(row)}
            />
          ))}
        </ul>
      )}
    </Container>
  );
}
