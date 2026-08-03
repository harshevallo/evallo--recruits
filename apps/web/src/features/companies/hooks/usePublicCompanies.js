import { useCallback, useEffect, useState } from 'react';
import { fetchPublicCompanies, fetchDirectoryFacets } from '@/services';

/**
 * Loads the public company directory for the current filter state.
 *
 * Requests are aborted when filters change so a slow earlier response cannot overwrite a
 * newer one — the classic out-of-order race in filtered lists.
 *
 * @param {URLSearchParams} searchParams
 */
export function usePublicCompanies(searchParams) {
  const [companies, setCompanies] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [error, setError] = useState(null);

  const key = searchParams.toString();

  const load = useCallback(
    (signal) => {
      setStatus('loading');
      setError(null);

      return fetchPublicCompanies(Object.fromEntries(new URLSearchParams(key)), { signal })
        .then(({ data, meta: responseMeta }) => {
          if (signal?.aborted) return;
          setCompanies(data ?? []);
          setMeta(responseMeta ?? null);
          setStatus('success');
        })
        .catch((apiError) => {
          if (signal?.aborted || apiError?.code === 'ERR_CANCELED') return;
          setError(apiError);
          setStatus('error');
        });
    },
    [key],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const retry = useCallback(() => {
    const controller = new AbortController();
    load(controller.signal);
  }, [load]);

  return {
    companies,
    meta,
    isLoading: status === 'loading',
    isError: status === 'error',
    isEmpty: status === 'success' && companies.length === 0,
    error,
    retry,
  };
}

/** Facet counts for the filter panel. Loaded once — counts are filter-independent. */
export function useDirectoryFacets() {
  const [facets, setFacets] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchDirectoryFacets({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setFacets(data);
      })
      // Facet counts are decoration; the filters still work without them.
      .catch(() => {});

    return () => controller.abort();
  }, []);

  return facets;
}
