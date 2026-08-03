import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Icon } from '@/components/ui';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchPublicCompanies } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * CAN-01 opportunity overview (PRD §8.2 — "company recommendations").
 *
 * These are **companies hiring now**, in the directory's own order — deliberately not personalised
 * ranking. PRD §10.3 requires that "matches stated criteria" be separated from "recommended", that
 * explanations be shown, and that ranking never rest on demographic proxies. Real matching needs
 * the profile facets that arrive with CAN-02 and the matching inputs in §10.2, so presenting an
 * unexplained ordering as "recommended for you" now would violate those safeguards.
 *
 * Reuses the public directory endpoint; no candidate data is sent, and none is needed.
 */
export function OpportunitiesCard() {
  const [state, setState] = useState({ status: 'loading', companies: [] });

  useEffect(() => {
    const controller = new AbortController();

    fetchPublicCompanies({ isCurrentlyHiring: true, limit: 3, sort: 'recent' }, {
      signal: controller.signal,
    })
      .then(({ data }) => setState({ status: 'ready', companies: data ?? [] }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', companies: [] });
      });

    return () => controller.abort();
  }, []);

  return (
    <section
      aria-labelledby="opportunities-heading"
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="opportunities-heading" className="text-lg font-bold text-brand-dark">
          Companies hiring now
        </h2>
        <Button to={PATHS.COMPANY_DIRECTORY} variant="link" size="none" radius="none" className="text-sm font-medium">
          See all
          <Icon name="arrow-right" className="text-xs" />
        </Button>
      </div>
      <p className="mb-5 text-sm text-gray-600">
        Recently active education businesses. Not ranked against your profile.
      </p>

      {state.status === 'loading' && (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Loading companies…</span>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-gray-600">
          We could not load companies just now.{' '}
          <Link to={PATHS.COMPANY_DIRECTORY} className="font-medium text-brand-blue hover:underline">
            Browse the directory
          </Link>
          .
        </p>
      )}

      {state.status === 'ready' && state.companies.length === 0 && (
        <p className="text-sm text-gray-600">
          No companies are advertising open roles yet. The directory is worth a look anyway —
          companies can receive interest without a posted role.
        </p>
      )}

      {state.status === 'ready' && state.companies.length > 0 && (
        <ul className="space-y-3">
          {state.companies.map((company) => (
            <li key={company.slug}>
              <Link
                to={buildPath(PATHS.COMPANY_PROFILE, { slug: company.slug })}
                className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
              >
                <Avatar
                  src={company.logoUrl}
                  initials={company.initials}
                  size="sm"
                  shape="rounded"
                  tone="brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-brand-dark">
                    {company.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {company.tagline || company.location?.city || 'Education business'}
                  </span>
                </span>
                <Icon name="arrow-right" className="shrink-0 text-xs text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
