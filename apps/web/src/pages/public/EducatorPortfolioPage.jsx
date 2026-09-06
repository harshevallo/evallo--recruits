import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Container, Logo } from '@/components/ui';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  PortfolioHero,
  PortfolioBody,
  PortfolioNav,
} from '@/features/candidate/portfolio/PortfolioDocument';
import { fetchPublicPortfolio } from '@/services';
import { usePageMeta, clampDescription } from '@/utils/pageMeta';
import { PATHS, buildPath } from '@/router/paths';

/**
 * The public candidate portfolio — `/e/:slug`, the page behind `CANDIDATE_VISIBILITY.PUBLIC`.
 *
 * ── Why this page exists ──────────────────────────────────────────────────────────────────────
 *
 * The API (`GET /api/candidates/:slug`) and the visibility state shipped first; the Visibility
 * screen has been handing candidates this address, with a copy button, and telling them the page
 * "is being built". Anyone who followed the link met the 404 screen. This is the page.
 *
 * ── How it differs from the share link (`/p/:token`) ──────────────────────────────────────────
 *
 * Same document renderer, opposite security model. A share link is a secret sent to one person and
 * revoked by rotating it; this address is stable and printable, readable by anyone, and ended by the
 * candidate changing their visibility — at which point the API answers 404 here. The public
 * projection never carries contact details under any setting (`publicPortfolio.service.js`).
 *
 * The API says whether the page may be indexed (`meta.indexable`); it is `false` until the
 * consent copy for search-engine indexing exists, so this page writes `noindex` whenever the API
 * says so rather than deciding for itself. Because the person CHOSE a public page, their name in
 * the title is theirs to show — unlike the share link, whose preview card stays anonymous.
 */
export function EducatorPortfolioPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetchPublicPortfolio(slug, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'unavailable' });
      });

    return () => controller.abort();
  }, [slug]);

  const profile = state.status === 'ready' ? state.profile : null;
  const name = profile?.header?.name;

  /* Hooks before any early return. `null` while loading keeps the document defaults. */
  usePageMeta(
    profile
      ? {
          title: `${name ?? 'Educator'} — teaching portfolio | Evallo Recruit`,
          description: clampDescription(
            profile.header?.headline ||
              profile.summary ||
              `${name ?? 'An educator'}'s teaching portfolio on Evallo Recruit.`,
          ),
          path: buildPath(PATHS.PUBLIC_EDUCATOR, { slug }),
          ogType: 'profile',
          image: profile.header?.photoUrl || undefined,
          robots: state.meta?.indexable ? undefined : 'noindex, nofollow',
        }
      : null,
  );

  if (state.status === 'loading') {
    return (
      <main id="main-content" className="min-h-screen bg-gray-50/60">
        <Container className="py-16">
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading portfolio…</span>
            <Skeleton className="h-52 w-full rounded-2xl" />
            <Skeleton className="mt-6 h-80 w-full rounded-2xl" />
          </div>
        </Container>
      </main>
    );
  }

  /*
   * One failure screen for every reason an address can fail — never existed, switched back to
   * private, unpublished, deleted. The API already refuses to distinguish them, and so does this.
   */
  if (state.status === 'unavailable') {
    return (
      <main id="main-content" className="flex min-h-screen items-center bg-gray-50/60">
        <Container size="prose" className="py-16 text-center">
          <Logo className="mx-auto mb-8" />
          <h1 className="text-2xl font-bold tracking-tight text-brand-dark">
            No public portfolio at this address
          </h1>
          <p className="mx-auto mt-3 max-w-md text-gray-600">
            The educator may have changed who can see their portfolio, or the link may be out of
            date. If someone sent it to you, ask them for a current one.
          </p>
          <Button to={PATHS.HOME} variant="primary" size="md" radius="lg" className="mt-8">
            Go to Evallo Recruit
          </Button>
        </Container>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-gray-50/60">
      {/* A minimal attribution bar, not a navbar — the reader came for one document. */}
      <div className="border-b border-gray-200 bg-white">
        <Container className="flex items-center justify-between py-4">
          <Logo />
          <span className="text-xs font-medium text-gray-500">Public portfolio</span>
        </Container>
      </div>

      <Container className="py-8 sm:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
          <PortfolioNav profile={profile} />

          <div className="min-w-0 space-y-6">
            <PortfolioHero header={profile.header} />
            <PortfolioBody profile={profile} showEmpty={false} />

            <p className="px-2 pb-4 text-center text-xs text-gray-500">
              Published by the educator through{' '}
              <a href={PATHS.HOME} className="font-semibold text-brand-blue hover:underline">
                Evallo Recruit
              </a>
              . Contact details are never shown on a public portfolio.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}
