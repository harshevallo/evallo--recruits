import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COMPANY_DIRECTORY_ARRAY_FILTERS, COMPANY_DIRECTORY_SORTS } from '@evallo/shared';

/**
 * Directory filter state, held in the URL.
 *
 * The URL is the single source of truth so a filtered directory is shareable, bookmarkable, and
 * survives back/forward — which also matches PRD §9.1's requirement for stable public URLs.
 */
export function useDirectoryFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = {
      q: searchParams.get('q') ?? '',
      country: searchParams.get('country'),
      hiringOnly: searchParams.get('hiringOnly'),
      sort: searchParams.get('sort') ?? COMPANY_DIRECTORY_SORTS.RELEVANCE,
      page: Number(searchParams.get('page') ?? 1),
    };

    for (const key of COMPANY_DIRECTORY_ARRAY_FILTERS) {
      result[key] = searchParams.getAll(key);
    }

    return result;
  }, [searchParams]);

  /** Any change other than sort resets to page 1 — staying on page 4 of a smaller result set is a dead end. */
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

  const toggleValue = useCallback(
    (key, value) => {
      update((params) => {
        const existing = params.getAll(key);
        params.delete(key);
        const next = existing.includes(value)
          ? existing.filter((v) => v !== value)
          : [...existing, value];
        for (const v of next) params.append(key, v);
      });
    },
    [update],
  );

  const setValue = useCallback(
    (key, value) => {
      update((params) => {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      });
    },
    [update],
  );

  const setPage = useCallback(
    (page) => {
      update(
        (params) => {
          if (page <= 1) params.delete('page');
          else params.set('page', String(page));
        },
        { resetPage: false },
      );
    },
    [update],
  );

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const activeCount =
    COMPANY_DIRECTORY_ARRAY_FILTERS.reduce((sum, key) => sum + filters[key].length, 0) +
    (filters.country ? 1 : 0) +
    (filters.hiringOnly === 'true' ? 1 : 0) +
    (filters.q ? 1 : 0);

  return {
    searchParams,
    filters,
    toggleValue,
    setValue,
    setPage,
    clearAll,
    activeCount,
    hasFilters: activeCount > 0,
  };
}
