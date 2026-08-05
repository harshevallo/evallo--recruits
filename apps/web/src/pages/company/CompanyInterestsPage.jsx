import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  INTEREST_STATUS,
  INTEREST_INBOX_SORTS,
  RECRUITER_INTEREST_STATUS_VALUES,
} from '@evallo/shared';
import { Badge, Button, Container, Pagination } from '@/components/ui';
import { SelectInput, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  fetchCompanyInterests,
  updateInterestStatus,
  markInterestViewed,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-11 — interest inbox (PRD §9.2, §11.1).
 *
 * The company's end of the same `expressionsOfInterest` record CAN-08 shows the candidate. What a
 * recruiter may see of each person is decided entirely by the server: a row can arrive with no
 * profile and no contact address because the candidate blocked this company or hid their details,
 * and this screen renders that state rather than testing for it.
 */

const STATUS_LABELS = {
  [INTEREST_STATUS.SUBMITTED]: 'New',
  [INTEREST_STATUS.VIEWED]: 'Seen',
  [INTEREST_STATUS.CONTACTED]: 'Contacted',
  [INTEREST_STATUS.PROGRESSED]: 'Progressed',
  [INTEREST_STATUS.CLOSED]: 'Closed',
  [INTEREST_STATUS.WITHDRAWN]: 'Withdrawn',
  [INTEREST_STATUS.EXPIRED]: 'Expired',
};

const STATUS_TONES = {
  [INTEREST_STATUS.SUBMITTED]: 'successLight',
  [INTEREST_STATUS.WITHDRAWN]: 'neutral',
  [INTEREST_STATUS.EXPIRED]: 'neutral',
};

/** Why a candidate cannot be opened. Phrased as the candidate's choice, never as an error. */
const WITHHELD_REASONS = {
  blocked_by_candidate: 'This person has since blocked your company.',
  not_published: 'Their profile is not published.',
  archived: 'Their profile has been archived.',
  private_without_grant: 'Their profile is private and no longer shared with you.',
  paused_without_prior_access: 'They paused their profile and withdrew access.',
};

const SORT_OPTIONS = [
  { value: INTEREST_INBOX_SORTS.NEWEST, label: 'Newest first' },
  { value: INTEREST_INBOX_SORTS.OLDEST, label: 'Oldest first' },
  { value: INTEREST_INBOX_SORTS.STATUS, label: 'By status' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function formatWhen(value) {
  if (!value) return null;
  const then = new Date(value);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CompanyInterestsPage() {
  const { companySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState({ status: 'loading' });
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  /* The filter set lives in the URL, so a filtered inbox is a shareable, refresh-safe link. */
  const query = useMemo(
    () => ({
      status: searchParams.get('status') || undefined,
      q: searchParams.get('q') || undefined,
      sort: searchParams.get('sort') || INTEREST_INBOX_SORTS.NEWEST,
      page: Number(searchParams.get('page') || 1),
    }),
    [searchParams],
  );

  const load = useCallback(
    async (signal) => {
      const data = await fetchCompanyInterests(companySlug, query, { signal });
      setState({ status: 'ready', data });
    },
    [companySlug, query],
  );

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({ status: 'error', message: error.message });
    });

    return () => controller.abort();
  }, [load]);

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page number.
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  async function changeStatus(row, status) {
    setBusyId(row.id);
    setFeedback(null);
    try {
      const result = await updateInterestStatus(companySlug, row.id, status);
      setState((current) => ({
        ...current,
        data: {
          ...current.data,
          interests: current.data.interests.map((item) =>
            item.id === row.id
              ? { ...item, status: result.status, actionable: result.actionable }
              : item,
          ),
        },
      }));
      setFeedback({
        tone: 'success',
        text: `${row.contact.name || 'This person'} marked ${STATUS_LABELS[result.status]}.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not update that.' });
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Opening a profile also records that the company looked. Failure is swallowed on purpose —
   * the bookkeeping must never stop a recruiter reaching the candidate they clicked.
   */
  async function openCandidate(row) {
    if (row.status === INTEREST_STATUS.SUBMITTED) {
      markInterestViewed(companySlug, row.id).catch(() => {});
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Loading your interest inbox…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load your inbox.'}</StatusRegion>
      </Container>
    );
  }

  const { interests, counts, meta } = state.data;
  const isFiltered = Boolean(query.status || query.q);

  return (
    <Container className="py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Interest inbox</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          People who approached your company. What you can see of each one is set by them, not by
          your role.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {counts.total} total · {counts.byStatus[INTEREST_STATUS.SUBMITTED] ?? 0} new
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      <section aria-labelledby="filters-heading" className="mb-6">
        <h2 id="filters-heading" className="sr-only">
          Filter and sort
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="inbox-q" className="mb-1 block text-xs font-medium text-gray-600">
              Search by name or email
            </label>
            <TextInput
              id="inbox-q"
              name="q"
              type="search"
              placeholder="e.g. Meera"
              defaultValue={query.q ?? ''}
              onBlur={(event) => setParam('q', event.target.value.trim())}
            />
          </div>

          <div className="min-w-[10rem]">
            <label htmlFor="inbox-status" className="mb-1 block text-xs font-medium text-gray-600">
              Status
            </label>
            <SelectInput
              id="inbox-status"
              name="status"
              options={STATUS_FILTERS}
              value={query.status ?? ''}
              onChange={(event) => setParam('status', event.target.value)}
            />
          </div>

          <div className="min-w-[10rem]">
            <label htmlFor="inbox-sort" className="mb-1 block text-xs font-medium text-gray-600">
              Sort
            </label>
            <SelectInput
              id="inbox-sort"
              name="sort"
              options={SORT_OPTIONS}
              value={query.sort}
              onChange={(event) => setParam('sort', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="results-heading">
        <h2 id="results-heading" className="sr-only">
          Interests
        </h2>

        {interests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-600">
              {isFiltered
                ? 'No interest matches those filters.'
                : 'No one has expressed interest yet. Publishing your page and adding a role is what makes this fill up.'}
            </p>
            {isFiltered && (
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                className="mt-4 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
                onClick={() => setSearchParams(new URLSearchParams())}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-4">
            {interests.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-brand-dark">
                        {row.candidate.summary?.name || row.contact.name || 'Someone'}
                      </span>
                      <Badge
                        tone={STATUS_TONES[row.status] ?? 'neutral'}
                        size="sm"
                        radius="full"
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                      {row.candidate.summary?.isPaused && (
                        <Badge tone="neutral" size="sm" radius="full">
                          Paused
                        </Badge>
                      )}
                    </div>

                    {row.candidate.summary?.headline && (
                      <p className="mt-1 text-sm text-gray-700">
                        {row.candidate.summary.headline}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-gray-500">
                      {row.role ? `Interested in ${row.role.title || 'a role'}` : 'General interest'}
                      {' · '}
                      {formatWhen(row.submittedAt)}
                      {row.contact.email ? ` · ${row.contact.email}` : ' · contact not shared'}
                    </p>

                    {row.candidate.summary && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {row.candidate.summary.subjects.map((subject) => (
                          <span
                            key={subject}
                            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    )}

                    {row.message && (
                      <blockquote className="mt-3 border-l-2 border-gray-200 pl-3 text-sm italic text-gray-600">
                        {row.message}
                      </blockquote>
                    )}

                    {!row.candidate.viewable && row.candidate.reason && (
                      <p className="mt-3 text-xs text-gray-500">
                        {WITHHELD_REASONS[row.candidate.reason] ??
                          'This profile is no longer available to you.'}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {row.candidate.viewable && (
                      <Button
                        to={buildPath(PATHS.COMPANY_CANDIDATE, {
                          companySlug,
                          candidateId: row.candidate.profileId,
                        })}
                        variant="primary"
                        size="sm"
                        onClick={() => openCandidate(row)}
                      >
                        Open profile
                      </Button>
                    )}

                    {row.actionable ? (
                      <>
                        <label className="sr-only" htmlFor={`status-${row.id}`}>
                          Status for {row.contact.name || 'this person'}
                        </label>
                        <SelectInput
                          id={`status-${row.id}`}
                          name={`status-${row.id}`}
                          options={RECRUITER_INTEREST_STATUS_VALUES.map((value) => ({
                            value,
                            label: STATUS_LABELS[value],
                          }))}
                          value={
                            RECRUITER_INTEREST_STATUS_VALUES.includes(row.status)
                              ? row.status
                              : INTEREST_STATUS.VIEWED
                          }
                          disabled={busyId === row.id}
                          onChange={(event) => changeStatus(row, event.target.value)}
                        />
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {row.status === INTEREST_STATUS.WITHDRAWN
                          ? 'Withdrawn — no further outreach'
                          : 'Closed'}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-8">
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              onChange={(page) => setParam('page', String(page))}
            />
          </div>
        )}
      </section>
    </Container>
  );
}
