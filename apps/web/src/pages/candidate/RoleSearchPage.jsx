import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ROLE_SEARCH_ARRAY_FILTERS,
  ROLE_SEARCH_SORTS,
  ROLE_SEARCH_SORT_OPTIONS,
  ROLE_CATEGORY_OPTIONS,
  ROLE_CATEGORY_LABELS,
  SUBJECT_OPTIONS,
  SUBJECT_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_OPTIONS,
  DELIVERY_MODE_LABELS,
  COUNTRY_OPTIONS,
  COUNTRY_LABELS,
} from '@evallo/shared';
import { Button, Container, Icon, Pagination } from '@/components/ui';
import { SelectInput, TextInput, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { RoleResultCard } from '@/features/companies/components/RoleResultCard';
import { fetchPublicRoles, fetchRoleFacets } from '@/services';
import { PATHS } from '@/router/paths';
import { usePageMeta } from '@/utils/pageMeta';
import { rankOptions, SEARCH_THRESHOLD } from '@/utils/optionSearch';

/**
 * "Search for Roles" — the candidate's role search.
 *
 * A separate experience from `/me/companies`, because the result type is different in kind: this
 * returns ROLES with a company attached, that returns COMPANIES with roles as tags. Sharing one
 * screen would have meant one card that leads with whichever thing the mode flag said.
 *
 * Everything it renders comes from `GET /api/public/roles`, which resolves visible companies
 * through the same predicate PUB-01 and PUB-02 use and then queries active intents within them. A
 * role from an unpublished, archived or moderation-restricted company cannot reach this page,
 * because it never reaches the response.
 *
 * Filter state lives in the URL, matching the directory: a filtered search is shareable and
 * survives back/forward. Pagination rather than infinite scroll, also matching the directory —
 * one paging model across both searches.
 */

/** Facets, in the order a candidate narrows: what the job is, then what it involves, then where. */
const FACETS = [
  { key: 'roleCategory', label: 'Role type', options: ROLE_CATEGORY_OPTIONS, labels: ROLE_CATEGORY_LABELS },
  { key: 'subject', label: 'Subjects', options: SUBJECT_OPTIONS, labels: SUBJECT_LABELS },
  {
    key: 'employmentType',
    label: 'Engagement',
    options: Object.values(EMPLOYMENT_TYPES).map((value) => ({
      value,
      label: EMPLOYMENT_TYPE_LABELS[value] ?? value,
    })),
    labels: EMPLOYMENT_TYPE_LABELS,
  },
  { key: 'deliveryMode', label: 'Delivery', options: DELIVERY_MODE_OPTIONS, labels: DELIVERY_MODE_LABELS },
  { key: 'country', label: 'Country', options: COUNTRY_OPTIONS, labels: COUNTRY_LABELS },
];

/**
 * One facet's options, with a filter box once the vocabulary is long enough to need one.
 *
 * Same rule as the recruiter's search panel: Country carries 250 entries, so scrolling is the work
 * and a search box removes it. A SELECTED value stays visible even when the query excludes it —
 * otherwise you can apply a filter you then cannot find to clear.
 */
function FacetOptions({ facet, selected, onToggle, counts }) {
  const [query, setQuery] = useState('');
  const searchable = facet.options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return facet.options;

    const matched = rankOptions(facet.options, query);
    const shown = new Set(matched.map((option) => option.value));
    return [
      ...facet.options.filter((o) => selected.includes(o.value) && !shown.has(o.value)),
      ...matched,
    ];
  }, [facet.options, query, searchable, selected]);

  return (
    <>
      {searchable && (
        <TextInput
          type="search"
          value={query}
          aria-label={`Search ${facet.label.toLowerCase()}`}
          placeholder={`Search ${facet.label.toLowerCase()}…`}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-2 !py-2 !text-xs"
        />
      )}

      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="px-1 py-2 text-xs text-gray-500">No matches.</p>
        ) : (
          visible.map((option) => {
            const count = counts?.[option.value];
            return (
              <Checkbox
                key={option.value}
                label={
                  count
                    ? `${option.label ?? facet.labels?.[option.value] ?? option.value} (${count})`
                    : (option.label ?? facet.labels?.[option.value] ?? option.value)
                }
                checked={selected.includes(option.value)}
                onChange={() => onToggle(facet.key, option.value)}
              />
            );
          })
        )}
      </div>
    </>
  );
}

/** Filter state in the URL — the same contract `useDirectoryFilters` gives the company directory. */
function useRoleFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = {
      q: searchParams.get('q') ?? '',
      region: searchParams.get('region') ?? '',
      maxYears: searchParams.get('maxYears') ?? '',
      sort: searchParams.get('sort') ?? ROLE_SEARCH_SORTS.RELEVANCE,
      page: Number(searchParams.get('page') ?? 1),
    };
    for (const key of ROLE_SEARCH_ARRAY_FILTERS) result[key] = searchParams.getAll(key);
    return result;
  }, [searchParams]);

  /* Any change but sort resets to page 1 — page 4 of a smaller result set is a dead end. */
  const update = useCallback(
    (mutate, { resetPage = true } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setValue = useCallback(
    (key, value) =>
      update((params) => {
        if (value) params.set(key, value);
        else params.delete(key);
      }),
    [update],
  );

  const toggleValue = useCallback(
    (key, value) =>
      update((params) => {
        const existing = params.getAll(key);
        params.delete(key);
        for (const item of existing) if (item !== value) params.append(key, item);
        if (!existing.includes(value)) params.append(key, value);
      }),
    [update],
  );

  /*
   * Counts the KEYWORD too, because "Clear all" clears it.
   *
   * Leaving `q` out made the two disagree: the button wipes every param, but only appeared once a
   * facet was ticked — so a search with just a keyword had no way to reset itself, and the mobile
   * "Filters (n)" badge read 0 while results were plainly narrowed.
   */
  const activeCount =
    ROLE_SEARCH_ARRAY_FILTERS.reduce((total, key) => total + filters[key].length, 0) +
    (filters.q ? 1 : 0) +
    (filters.region ? 1 : 0) +
    (filters.maxYears ? 1 : 0);

  return { searchParams, filters, setValue, toggleValue, update, activeCount, setSearchParams };
}

/**
 * @param {object} props
 * @param {string} [props.roleDetailPath]      where a result card's title links
 * @param {string} [props.companyProfilePath]  where a result card's company name links
 * @param {string} [props.companyDirectoryPath] where the empty state sends the reader
 *
 * One page, two mount points — `/roles` for anyone and `/me/roles` for a signed-in candidate.
 * The data already came from the PUBLIC endpoint (`fetchPublicRoles`), so nothing about the search
 * itself changes between them; only where the links point. Defaults are the public routes.
 */
export function RoleSearchPage({
  roleDetailPath = PATHS.PUBLIC_ROLE_DETAIL,
  companyProfilePath = PATHS.COMPANY_PROFILE,
  companyDirectoryPath = PATHS.COMPANY_DIRECTORY,
} = {}) {
  const { searchParams, filters, setValue, toggleValue, update, activeCount, setSearchParams } =
    useRoleFilters();

  const [state, setState] = useState({ status: 'loading', roles: [], meta: null });
  const [facets, setFacets] = useState(null);
  /*
   * Static metadata, and the canonical deliberately drops the query string.
   *
   * Filter state lives in the URL, so `?subject=physics&page=3` is a distinct address for every
   * combination a visitor can click. Generating a title from those parameters would mint an
   * unbounded set of near-identical pages competing with each other, and pointing each one's
   * canonical at itself would tell a crawler they are all originals. One canonical, `/roles`.
   *
   * Set on the `/me/roles` mount too. It is the same content, `robots.txt` disallows `/me`, and
   * naming `/roles` as canonical is exactly right for a duplicate behind a login.
   */
  usePageMeta({
    title: 'Teaching jobs and tutoring roles | Evallo Recruit',
    description:
      'Browse open teaching, tutoring and education roles from verified schools, tutoring centres and edtech companies. Search by subject, location and delivery mode.',
    path: PATHS.PUBLIC_ROLES,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [keyword, setKeyword] = useState(filters.q);

  /* The query string IS the request — one source of truth, so a shared URL reproduces the search. */
  const queryKey = searchParams.toString();

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, status: 'loading' }));

    fetchPublicRoles(searchParams, { signal: controller.signal })
      .then(({ data, meta }) => setState({ status: 'ready', roles: data ?? [], meta }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', roles: [], meta: null, message: error.message });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRoleFacets({ signal: controller.signal })
      .then(setFacets)
      .catch(() => {
        /* Counts are an enhancement; the filters still work without them. */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => setKeyword(filters.q), [filters.q]);

  function submitKeyword(event) {
    event.preventDefault();
    setValue('q', keyword.trim());
  }

  const { roles, meta } = state;

  return (
    <Container className="py-24 sm:py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Search for roles</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Open roles at education organisations on Evallo Recruit. Browsing is private — no company
          is told you looked.
        </p>
      </header>

      <form onSubmit={submitKeyword} className="mb-6 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="role-keyword" className="sr-only">
          Search roles by title or description
        </label>
        <TextInput
          id="role-keyword"
          type="search"
          className="flex-1"
          placeholder="Role title, subject, or keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button type="submit" variant="primary" size="md" radius="lg" className="shrink-0">
          Search
        </Button>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="shrink-0 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-brand-dark hover:bg-gray-50 lg:hidden"
        >
          <Icon name="filter" className="mr-2 text-xs" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        <aside
          aria-label="Role filters"
          className={`${filtersOpen ? 'block' : 'hidden'} space-y-6 lg:block`}
        >
          {activeCount > 0 && (
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              onClick={() => setSearchParams({}, { replace: true })}
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
                selected={filters[facet.key]}
                onToggle={toggleValue}
                counts={facets?.[facet.key]}
              />
            </fieldset>
          ))}

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              City or region
            </legend>
            <TextInput
              type="search"
              aria-label="City or region"
              placeholder="e.g. Bengaluru"
              value={filters.region}
              onChange={(event) => setValue('region', event.target.value)}
              className="!py-2 !text-xs"
            />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Experience asked for
            </legend>
            {/*
              A CEILING, not a floor: "roles wanting at most N years". A role that states no
              requirement is never excluded by it — saying nothing is not the same as asking for
              more than you have.
            */}
            <label htmlFor="role-max-years" className="sr-only">
              Maximum years of experience required
            </label>
            <TextInput
              id="role-max-years"
              type="number"
              min="0"
              max="60"
              placeholder="Up to N years"
              value={filters.maxYears}
              onChange={(event) => setValue('maxYears', event.target.value)}
              className="!py-2 !text-xs"
            />
          </fieldset>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600" role="status">
              {state.status === 'loading'
                ? 'Searching…'
                : meta
                  ? `${meta.total} ${meta.total === 1 ? 'role' : 'roles'}`
                  : ''}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="role-sort" className="text-sm text-gray-500">
                Sort
              </label>
              <SelectInput
                id="role-sort"
                options={ROLE_SEARCH_SORT_OPTIONS}
                value={filters.sort}
                className="!py-2 !text-sm"
                onChange={(event) =>
                  update((params) => params.set('sort', event.target.value), { resetPage: false })
                }
              />
            </div>
          </div>

          {state.status === 'error' && (
            <StatusRegion tone="error">
              {state.message ?? 'We could not load roles just now.'}
            </StatusRegion>
          )}

          {state.status === 'loading' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-hidden="true">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-44 w-full rounded-2xl" />
              ))}
            </div>
          )}

          {state.status === 'ready' && roles.length === 0 && (
            <EmptyState
              icon="briefcase"
              title="No roles match that search"
              description="Try fewer filters, or browse the companies instead — many accept interest even when they are not actively hiring."
              action={
                <Button to={companyDirectoryPath} variant="primary" size="md" radius="lg">
                  Search for companies
                </Button>
              }
            />
          )}

          {state.status === 'ready' && roles.length > 0 && (
            <>
              <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {roles.map((role) => (
                  <li key={role.id}>
                    <RoleResultCard
                      role={role}
                      roleDetailPath={roleDetailPath}
                      companyProfilePath={companyProfilePath}
                    />
                  </li>
                ))}
              </ul>

              {meta && meta.totalPages > 1 && (
                <div className="mt-10">
                  <Pagination
                    page={meta.page}
                    totalPages={meta.totalPages}
                    onChange={(page) =>
                      update((params) => params.set('page', String(page)), { resetPage: false })
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
