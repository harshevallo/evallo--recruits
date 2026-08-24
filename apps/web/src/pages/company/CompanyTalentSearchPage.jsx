import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  CANDIDATE_SEARCH_SORT_OPTIONS,
  CANDIDATE_SEARCH_ARRAY_FILTERS,
  CANDIDATE_ROLE_OPTIONS,
  SUBJECT_OPTIONS,
  LEARNER_SEGMENT_OPTIONS,
  AVAILABILITY_OPTIONS,
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  EMPLOYMENT_TYPES,
  DELIVERY_MODES,
  CANDIDATE_ROLE_LABELS,
  SUBJECT_LABELS,
  LEARNER_SEGMENT_LABELS,
  AVAILABILITY_LABELS,
  COUNTRY_LABELS,
  LANGUAGE_LABELS,
} from '@evallo/shared';
import { PIPELINE_STAGE_LABELS } from '@evallo/shared';
import { Button, Container, Modal, Pagination } from '@/components/ui';
import { SelectInput, TextInput, Checkbox, Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  searchCandidates,
  fetchSavedCandidates,
  saveCandidate,
  unsaveCandidate,
  addToPipeline,
  fetchPipeline,
  startCompanyConversation,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';
import { rankOptions, SEARCH_THRESHOLD } from '@/utils/optionSearch';

/**
 * REC-12 — talent search (PRD §7.7, §10, §21.4).
 *
 * A DISCOVERY screen. It helps a recruiter find people worth opening; judging them is REC-13's
 * job, and nothing here shows contact details or evidence.
 *
 * The whole filter set lives in the URL, so a search is a shareable, refresh-safe link and the
 * back button behaves. Nothing is filtered client-side — every narrowing is a new server query,
 * because the privacy rules that decide who may appear can only be enforced there.
 */

/** Facet definitions, rendered generically. Values come from the shared taxonomy, never inline. */
const FACETS = [
  { key: 'role', label: 'Role', options: CANDIDATE_ROLE_OPTIONS, labels: CANDIDATE_ROLE_LABELS },
  { key: 'subject', label: 'Subjects', options: SUBJECT_OPTIONS, labels: SUBJECT_LABELS },
  {
    key: 'learnerSegment',
    label: 'Learner segment',
    options: LEARNER_SEGMENT_OPTIONS,
    labels: LEARNER_SEGMENT_LABELS,
  },
  {
    key: 'employmentType',
    label: 'Employment preference',
    options: Object.values(EMPLOYMENT_TYPES).map((v) => ({ value: v, label: humanise(v) })),
    labels: null,
  },
  {
    key: 'deliveryMode',
    label: 'Delivery mode',
    options: Object.values(DELIVERY_MODES).map((v) => ({ value: v, label: humanise(v) })),
    labels: null,
  },
  {
    key: 'availability',
    label: 'Availability',
    options: AVAILABILITY_OPTIONS,
    labels: AVAILABILITY_LABELS,
  },
  { key: 'country', label: 'Country', options: COUNTRY_OPTIONS, labels: COUNTRY_LABELS },
  { key: 'language', label: 'Languages', options: LANGUAGE_OPTIONS, labels: LANGUAGE_LABELS },
];

/**
 * One facet's checkbox list, with a filter box once the vocabulary is too long to scan.
 *
 * Country went from 18 options to all 249 ISO territories, which turned this panel into a
 * 249-row scroll box with no way to reach Kenya except the mouse wheel. The threshold lives in
 * `utils/optionSearch` so a facet earns its search box by size rather than by someone remembering
 * to add one.
 *
 * SELECTED options are always rendered, even when the query excludes them. A filter that hides a
 * filter you already applied is how a recruiter ends up with results they cannot explain and a
 * checkbox they cannot find to clear.
 */
function FacetOptions({ facet, selected, onToggle }) {
  const [query, setQuery] = useState('');
  const searchable = facet.options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return facet.options;

    const matched = rankOptions(facet.options, query);
    const shown = new Set(matched.map((option) => option.value));
    /* Active choices first, then the matches — so what you have chosen never scrolls out of reach. */
    return [...facet.options.filter((o) => selected.includes(o.value) && !shown.has(o.value)), ...matched];
  }, [facet.options, query, searchable, selected]);

  return (
    <>
      {searchable && (
        <TextInput
          type="search"
          value={query}
          aria-label={`Search ${facet.label.toLowerCase()}`}
          placeholder={`Search ${facet.label.toLowerCase()}\u2026`}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-2 !py-2 !text-xs"
        />
      )}

      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">No matches.</p>
        ) : (
          visible.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label ?? facet.labels?.[option.value] ?? option.value}
              checked={selected.includes(option.value)}
              onChange={() => onToggle(facet.key, option.value)}
            />
          ))
        )}
      </div>
    </>
  );
}

const FACET_LABELS = Object.fromEntries(FACETS.map((f) => [f.key, f.label]));

function humanise(value) {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Renders one match reason in the recruiter's own vocabulary (PRD §21.4). */
function reasonText(reason) {
  if (reason.facet === 'keyword') return `Keyword in ${reason.values.join(', ')}`;
  if (reason.facet === 'experience') return reason.values[0];
  const facet = FACETS.find((f) => f.key === reason.facet);
  const labels = facet?.labels;
  const values = reason.values.map((v) => labels?.[v] ?? humanise(String(v)));
  return `${FACET_LABELS[reason.facet] ?? humanise(reason.facet)}: ${values.join(', ')}`;
}

export function CompanyTalentSearchPage() {
  const { companySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState({ status: 'loading' });
  const [draftQuery, setDraftQuery] = useState(searchParams.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  /*
   * Card action state.
   *
   * `savedIds` and `pipelineStages` are loaded once per company rather than per result, so a
   * result page of twenty candidates costs two extra requests, not forty. They are kept in sync
   * optimistically after each mutation AND the server response is what decides — a failed save
   * rolls the star back rather than leaving the UI claiming something that did not happen.
   */
  const [savedIds, setSavedIds] = useState(new Set());
  const [pipelineStages, setPipelineStages] = useState({});
  const [actionBusy, setActionBusy] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [composing, setComposing] = useState(null);

  /** The request is derived entirely from the URL — the URL is the single source of truth. */
  const query = useMemo(() => {
    const params = { sort: searchParams.get('sort') || 'recent', page: Number(searchParams.get('page') || 1) };
    if (searchParams.get('q')) params.q = searchParams.get('q');
    if (searchParams.get('region')) params.region = searchParams.get('region');
    if (searchParams.get('minYears')) params.minYears = searchParams.get('minYears');
    if (searchParams.get('maxYears')) params.maxYears = searchParams.get('maxYears');
    for (const key of CANDIDATE_SEARCH_ARRAY_FILTERS) {
      const values = searchParams.getAll(key);
      if (values.length) params[key] = values;
    }
    return params;
  }, [searchParams]);

  const load = useCallback(
    async (signal) => {
      const data = await searchCandidates(companySlug, query, { signal });
      setState({ status: 'ready', data });
    },
    [companySlug, query],
  );

  /**
   * Shortlist and pipeline membership, so the cards can show real state.
   *
   * Failures are swallowed on purpose: a recruiter without `candidate:view` or `pipeline:view` can
   * still search, and the cards simply show no saved/pipeline state rather than the page erroring.
   */
  const loadCardState = useCallback(async () => {
    const [saved, pipeline] = await Promise.allSettled([
      fetchSavedCandidates(companySlug),
      fetchPipeline(companySlug, { includeClosed: false }),
    ]);

    if (saved.status === 'fulfilled') {
      setSavedIds(new Set((saved.value.saved ?? []).map((row) => row.candidate.id)));
    }

    if (pipeline.status === 'fulfilled') {
      const stages = {};
      for (const stage of pipeline.value.stages ?? []) {
        for (const entry of stage.entries) stages[entry.candidate.id] = entry.stage;
      }
      setPipelineStages(stages);
    }
  }, [companySlug]);

  useEffect(() => {
    loadCardState();
  }, [loadCardState]);

  /** Saving and unsaving. Optimistic, reverted if the server refuses. */
  async function toggleSaved(card) {
    const wasSaved = savedIds.has(card.id);
    setActionBusy(card.id);
    setSavedIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(card.id);
      else next.add(card.id);
      return next;
    });

    try {
      if (wasSaved) await unsaveCandidate(companySlug, card.id);
      else await saveCandidate(companySlug, card.id);
      setActionFeedback({
        tone: 'success',
        text: wasSaved ? 'Removed from your shortlist.' : 'Saved to your shortlist.',
      });
    } catch (error) {
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(card.id);
        else next.delete(card.id);
        return next;
      });
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setActionBusy(null);
    }
  }

  async function addCandidate(card) {
    setActionBusy(card.id);
    try {
      const { entry } = await addToPipeline(companySlug, { candidateId: card.id, source: 'search' });
      setPipelineStages((current) => ({ ...current, [card.id]: entry.stage }));
      setActionFeedback({
        tone: 'success',
        text: `Added to ${PIPELINE_STAGE_LABELS[entry.stage] ?? 'the pipeline'}.`,
      });
    } catch (error) {
      setActionFeedback({
        tone: 'error',
        text: error.details?.stage ?? error.message ?? 'We could not add them.',
      });
    } finally {
      setActionBusy(null);
    }
  }

  /**
   * Opening a conversation.
   *
   * PRD §11.2 requires a first message to a merely-discoverable candidate to identify the company
   * and the role context, so the composer is pre-filled with that framing rather than an empty box
   * — a recruiter can edit it, but the default is the compliant one.
   */
  async function sendFirstMessage() {
    if (!composing?.body.trim()) return;
    setActionBusy(composing.card.id);
    try {
      await startCompanyConversation(companySlug, {
        candidateId: composing.card.id,
        body: composing.body.trim(),
      });
      setComposing(null);
      setActionFeedback({ tone: 'success', text: 'Message sent. It is now in your Messages.' });
    } catch (error) {
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not send that.' });
    } finally {
      setActionBusy(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => (current.status === 'ready' ? { ...current, refreshing: true } : current));

    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({ status: 'error', message: error.message });
    });

    return () => controller.abort();
  }, [load]);

  /** Every mutation resets paging: page 3 of the previous filter set means nothing here. */
  function commit(mutate) {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    next.delete('page');
    setSearchParams(next);
  }

  const toggleFacet = (key, value) =>
    commit((next) => {
      const current = next.getAll(key);
      next.delete(key);
      const remaining = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      for (const v of remaining) next.append(key, v);
    });

  const setScalar = (key, value) =>
    commit((next) => (value ? next.set(key, value) : next.delete(key)));

  const activeCount = CANDIDATE_SEARCH_ARRAY_FILTERS.reduce(
    (sum, key) => sum + searchParams.getAll(key).length,
    0,
  ) + ['region', 'minYears', 'maxYears'].filter((k) => searchParams.get(k)).length;

  const hasCriteria = activeCount > 0 || Boolean(searchParams.get('q'));

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not run that search.'}</StatusRegion>
      </Container>
    );
  }

  const results = state.data?.candidates ?? [];
  const meta = state.data?.meta;

  return (
    <Container className="py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Find candidates</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Educators who have chosen to be discoverable. Results are shaped by what each person
          shared — not by any ranking of who is better.
        </p>
      </header>

      {/* Outcome of the last card action. Announced, so it is not a silent success or failure. */}
      {actionFeedback && (
        <StatusRegion tone={actionFeedback.tone} className="mb-6">
          {actionFeedback.text}
        </StatusRegion>
      )}

      {/* Keyword. Submitted rather than typed-through, so each keystroke is not a server query. */}
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setScalar('q', draftQuery.trim());
        }}
      >
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="talent-q" className="mb-1 block text-xs font-medium text-gray-600">
            Search by name, headline, summary or subject
          </label>
          <TextInput
            id="talent-q"
            name="q"
            type="search"
            placeholder="e.g. physics, IB, Priya"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
        </div>

        <Button type="submit" variant="primary" size="md">
          Search
        </Button>

        <div className="min-w-[11rem]">
          <label htmlFor="talent-sort" className="mb-1 block text-xs font-medium text-gray-600">
            Sort
          </label>
          <SelectInput
            id="talent-sort"
            name="sort"
            options={CANDIDATE_SEARCH_SORT_OPTIONS}
            value={query.sort}
            onChange={(event) => setScalar('sort', event.target.value)}
          />
        </div>

        <Button
          type="button"
          variant="outlineDark"
          size="md"
          aria-expanded={filtersOpen}
          aria-controls="talent-filters"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_1fr]">
        <aside
          id="talent-filters"
          aria-label="Filters"
          className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}
        >
          <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            {hasCriteria && (
              <Button
                type="button"
                variant="outlineDark"
                size="sm"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                onClick={() => {
                  setDraftQuery('');
                  setSearchParams(new URLSearchParams());
                }}
              >
                Clear all
              </Button>
            )}

            {FACETS.map((facet) => (
              <fieldset key={facet.key}>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {facet.label}
                </legend>
                <FacetOptions
                  facet={facet}
                  selected={searchParams.getAll(facet.key)}
                  onToggle={toggleFacet}
                />
              </fieldset>
            ))}

            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Experience (years)
              </legend>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="talent-min-years">
                  Minimum years of experience
                </label>
                <TextInput
                  id="talent-min-years"
                  name="minYears"
                  type="number"
                  min="0"
                  placeholder="Min"
                  defaultValue={searchParams.get('minYears') ?? ''}
                  onBlur={(event) => setScalar('minYears', event.target.value)}
                />
                <span aria-hidden="true" className="text-gray-400">
                  –
                </span>
                <label className="sr-only" htmlFor="talent-max-years">
                  Maximum years of experience
                </label>
                <TextInput
                  id="talent-max-years"
                  name="maxYears"
                  type="number"
                  min="0"
                  placeholder="Max"
                  defaultValue={searchParams.get('maxYears') ?? ''}
                  onBlur={(event) => setScalar('maxYears', event.target.value)}
                />
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="talent-region"
                className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Region
              </label>
              <TextInput
                id="talent-region"
                name="region"
                placeholder="e.g. Karnataka"
                defaultValue={searchParams.get('region') ?? ''}
                onBlur={(event) => setScalar('region', event.target.value.trim())}
              />
            </div>
          </div>
        </aside>

        <section aria-labelledby="results-heading" aria-busy={state.status === 'loading'}>
          <h2 id="results-heading" className="sr-only">
            Search results
          </h2>

          {state.status === 'loading' ? (
            <div role="status" aria-live="polite" className="space-y-4">
              <span className="sr-only">Searching for candidates…</span>
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <p role="status" aria-live="polite" className="mb-4 text-sm text-gray-600">
                {meta?.total === 0
                  ? 'No candidates match'
                  : `${meta?.total} ${meta?.total === 1 ? 'candidate' : 'candidates'}`}
                {hasCriteria ? ' for your criteria' : ' discoverable to your company'}
              </p>

              {results.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                  <p className="text-sm text-gray-600">
                    {hasCriteria
                      ? 'Nobody matches every criterion. Removing a filter usually widens this quickly — filters combine, so each one narrows the result.'
                      : 'No educators are discoverable yet. People appear here once they publish a profile and choose to be found.'}
                  </p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {results.map((card) => (
                    <li
                      key={card.id}
                      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-brand-dark">
                            {card.header.name || 'Educator'}
                          </h3>
                          {card.header.headline && (
                            <p className="mt-0.5 text-sm text-gray-700">{card.header.headline}</p>
                          )}

                          <p className="mt-1 text-xs text-gray-500">
                            {[
                              card.header.location?.country
                                ? COUNTRY_LABELS[card.header.location.country] ??
                                  card.header.location.country
                                : null,
                              typeof card.header.yearsExperience === 'number'
                                ? `${card.header.yearsExperience} years`
                                : null,
                              card.header.availability
                                ? AVAILABILITY_LABELS[card.header.availability]
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No location shared'}
                          </p>

                          {card.expertise.subjects.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {card.expertise.subjects.slice(0, 6).map((subject) => (
                                <span
                                  key={subject}
                                  className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
                                >
                                  {SUBJECT_LABELS[subject] ?? subject}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* PRD §21.4 — show why each candidate matches. */}
                          {card.matchedOn.length > 0 && (
                            <p className="mt-3 text-xs text-gray-500">
                              <span className="font-medium text-gray-600">Matches:</span>{' '}
                              {card.matchedOn.map(reasonText).join(' · ')}
                            </p>
                          )}
                        </div>

                        {/*
                          Card actions. Every one persists: saving writes a shortlist row, adding
                          writes a pipeline entry, messaging opens a real thread. Saving is silent
                          to the candidate (PRD §21.4) — nothing here notifies them.
                        */}
                        <div className="flex flex-none flex-col gap-2 sm:w-40">
                          <Button
                            /* `source` is recorded in the access log (PRD §21.4). */
                            to={`${buildPath(PATHS.COMPANY_CANDIDATE, {
                              companySlug,
                              candidateId: card.id,
                            })}?source=search`}
                            variant="primary"
                            size="sm"
                          >
                            Open profile
                          </Button>

                          <Button
                            type="button"
                            variant="outlineDark"
                            size="sm"
                            radius="lg"
                            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                            disabled={actionBusy === card.id}
                            onClick={() => toggleSaved(card)}
                          >
                            {savedIds.has(card.id) ? 'Saved ✓' : 'Save'}
                          </Button>

                          {pipelineStages[card.id] ? (
                            <span className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-gray-600">
                              In {PIPELINE_STAGE_LABELS[pipelineStages[card.id]] ?? 'pipeline'}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="outlineDark"
                              size="sm"
                              radius="lg"
                              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                              disabled={actionBusy === card.id}
                              onClick={() => addCandidate(card)}
                            >
                              Add to pipeline
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="outlineDark"
                            size="sm"
                            radius="lg"
                            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                            onClick={() => setComposing({ card, body: '' })}
                          >
                            Message
                          </Button>
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
                    onChange={(page) => {
                      const next = new URLSearchParams(searchParams);
                      next.set('page', String(page));
                      setSearchParams(next);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/*
        First contact. PRD §11.2: a first message to a merely-discoverable candidate must clearly
        identify the company and the role context, so the composer opens with that framing already
        written rather than leaving compliance to whoever is typing.
      */}
      <Modal
        open={Boolean(composing)}
        onClose={() => setComposing(null)}
        title={`Message ${composing?.card.name ?? 'this candidate'}`}
        description="They will see your company name with this message. Keep it about the role."
      >
        <label htmlFor="first-message" className="mb-1.5 block text-sm font-semibold text-gray-700">
          Your message
        </label>
        <Textarea
          id="first-message"
          name="first-message"
          rows={5}
          placeholder="Introduce your company and the role you have in mind…"
          value={composing?.body ?? ''}
          disabled={actionBusy === composing?.card.id}
          onChange={(event) =>
            setComposing((current) => ({ ...current, body: event.target.value }))
          }
        />

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setComposing(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={!composing?.body?.trim() || actionBusy === composing?.card.id}
            onClick={sendFirstMessage}
          >
            {actionBusy === composing?.card.id ? 'Sending…' : 'Send message'}
          </Button>
        </div>
      </Modal>
    </Container>
  );
}
