import { useCallback, useEffect, useState } from 'react';
import { fetchCompanyBySlug } from '@/services';

/**
 * Loads a public company profile — PUB-02.
 *
 * Distinguishes "not found" (404) from a transient failure so the page can show the right
 * message rather than a generic error for both.
 */
export function useCompanyProfile(slug) {
  const [company, setCompany] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | success | notFound | error
  const [error, setError] = useState(null);

  const load = useCallback(
    (signal) => {
      setStatus('loading');
      setError(null);

      return fetchCompanyBySlug(slug, { signal })
        .then((data) => {
          if (signal?.aborted) return;
          setCompany(data);
          setStatus('success');
        })
        .catch((apiError) => {
          if (signal?.aborted || apiError?.code === 'ERR_CANCELED') return;
          setError(apiError);
          setStatus(apiError?.status === 404 ? 'notFound' : 'error');
        });
    },
    [slug],
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
    company,
    isLoading: status === 'loading',
    isNotFound: status === 'notFound',
    isError: status === 'error',
    error,
    retry,
  };
}
