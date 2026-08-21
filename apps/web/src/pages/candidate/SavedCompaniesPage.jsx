import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ORGANIZATION_TYPE_LABELS } from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import { fetchSavedCompanies, unsaveCompany } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * CAN-11 — the companies this candidate saved.
 *
 * Saving has worked since CAN-06; nothing has ever read the collection back, so a candidate could
 * bookmark a company and then had nowhere to find it again. This is the missing half, not a new
 * feature: the same `savedCompanies` collection, the same save/unsave endpoints.
 *
 * A company that has since unpublished simply is not in the list — the server drops it rather
 * than returning a row that leads to a 404. The save record survives, so a company that returns
 * to published reappears on its own.
 */
export function SavedCompaniesPage() {
  const [state, setState] = useState({ status: 'loading' });
  const [busySlug, setBusySlug] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchSavedCompanies({ signal: controller.signal })
      .then((companies) => setState({ status: 'ready', companies }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, []);

  /**
   * Removing is optimistic-after-confirmation, not optimistic-before.
   *
   * The row disappears once the server has agreed. An optimistic removal that later failed would
   * have to put the card back, and a card reappearing after you removed it reads as a bug even
   * when it is correct.
   */
  async function remove(slug, name) {
    setBusySlug(slug);
    setFeedback(null);
    try {
      await unsaveCompany(slug);
      setState((current) => ({
        ...current,
        companies: current.companies.filter((row) => row.company.slug !== slug),
      }));
      setFeedback({ tone: 'success', text: `Removed ${name} from your saved list.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not remove that.' });
    } finally {
      setBusySlug(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-24 sm:py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your saved companies…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-24 sm:py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load your saved companies.'}
        </StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  return (
    <Container className="py-24 sm:py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Saved companies</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Companies you bookmarked while browsing. Saving is private — no company is told you saved
          them.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {state.companies.length === 0 ? (
        <EmptyState
          icon="star"
          title="Nothing saved yet"
          description="Save a company while you are browsing and it will wait for you here."
          action={
            <Button to={PATHS.CANDIDATE_COMPANIES} variant="primary" size="md" radius="lg">
              Discover companies
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {state.companies.map(({ company, savedAt }) => (
            <li key={company.slug}>
              <article className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start gap-4">
                  <Avatar
                    src={company.logoUrl}
                    initials={company.initials}
                    size="md"
                    shape="rounded"
                    tone="brand"
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold text-brand-dark">
                      <Link
                        to={buildPath(PATHS.CANDIDATE_COMPANY_PROFILE, { slug: company.slug })}
                        className="hover:text-brand-blue"
                      >
                        {company.name}
                      </Link>
                    </h2>
                    {company.organizationType && (
                      <p className="truncate text-sm text-gray-500">
                        {ORGANIZATION_TYPE_LABELS[company.organizationType] ??
                          company.organizationType}
                      </p>
                    )}
                  </div>

                  {company.isCurrentlyHiring && (
                    <Badge tone="successLight" size="sm" radius="full">
                      Hiring
                    </Badge>
                  )}
                </div>

                {company.tagline && (
                  <p className="mt-4 line-clamp-2 text-sm text-gray-600">{company.tagline}</p>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  <span className="text-xs text-gray-400">
                    Saved {new Date(savedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    disabled={busySlug === company.slug}
                    onClick={() => remove(company.slug, company.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Icon name="trash" className="text-[10px]" />
                    {busySlug === company.slug ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
