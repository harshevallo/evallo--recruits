import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Container, Logo } from '@/components/ui';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  PortfolioHero,
  PortfolioBody,
  PortfolioNav,
} from '@/features/candidate/portfolio/PortfolioDocument';
import { fetchSharedPortfolio } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * A candidate portfolio opened through its share link — ADR-019.
 *
 * The one screen in the product that shows candidate data to someone with no account. Everything
 * about it is shaped by that:
 *
 *   · **The token is the credential.** It comes from the URL and goes nowhere else — not into
 *     analytics, not into a title, not into `document.referrer` for any outbound link.
 *   · **`noindex` unconditionally.** Set before the fetch resolves, so a crawler that renders the
 *     page sees the directive whatever happens next. The API sends `X-Robots-Tag` too; belt and
 *     braces, because only one of the two protects a crawler that reads the rendered DOM.
 *   · **No candidate identity in the failure state.** A revoked, rotated, draft or never-valid
 *     link produce the same screen and the same words. Distinguishing them would confirm that a
 *     particular person is on the platform.
 *   · **No product chrome that assumes a session.** No workspace rail, no account menu, no
 *     "return to your profile" — the reader is a guest, not a lapsed user.
 */

/** Sets a `<meta>` by name or property, creating it if the document has none. Returns a cleanup. */
function setMetaTag(attribute, key, content) {
  let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
  const created = !tag;

  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }

  const previous = tag.getAttribute('content');
  tag.setAttribute('content', content);

  return () => {
    if (created) tag.remove();
    else if (previous !== null) tag.setAttribute('content', previous);
  };
}

export function SharedPortfolioPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  /*
   * `noindex, nofollow` for the whole lifetime of this route, applied before any data arrives.
   *
   * KNOWN LIMITATION, recorded in 12_KNOWN_ISSUES.md and ADR-019: the app is a static SPA served
   * by Vercel, so this tag exists only after JavaScript runs. Googlebot renders and will honour
   * it; a crawler that does not execute JavaScript will not see it. That is acceptable ONLY
   * because the URL contains a 256-bit secret — there is no way for such a crawler to discover
   * the address in the first place, and `robots.txt` disallows the whole `/p/` prefix.
   */
  useEffect(() => {
    const restore = [
      setMetaTag('name', 'robots', 'noindex, nofollow, noarchive'),
      setMetaTag('name', 'googlebot', 'noindex, nofollow'),
      /*
       * Deliberately generic Open Graph text.
       *
       * A share link is often pasted into WhatsApp, Slack or email, all of which fetch a preview
       * WITHOUT executing JavaScript — so whatever the static shell carries is what appears in the
       * card. Putting the candidate's name or headline into these tags would mean their details
       * were rendered in a group chat before anyone chose to open the link, which is a disclosure
       * they did not make. The card says what the link IS, not who it is about.
       */
      setMetaTag('property', 'og:title', 'A teaching portfolio on Evallo Recruit'),
      setMetaTag(
        'property',
        'og:description',
        'A private portfolio link shared by an educator. Open it to view.',
      ),
      setMetaTag('property', 'og:type', 'profile'),
    ];

    const previousTitle = document.title;
    document.title = 'Teaching portfolio · Evallo Recruit';

    return () => {
      restore.forEach((undo) => undo());
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchSharedPortfolio(token, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'unavailable' });
      });

    return () => controller.abort();
  }, [token]);

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
   * One failure screen for every reason a link can fail.
   *
   * Never-existed, rotated, switched off, unpublished and deleted are deliberately identical —
   * in wording, in status code and in what they imply. Telling the reader "this link was
   * withdrawn" would confirm there is a person behind it.
   */
  if (state.status === 'unavailable') {
    return (
      <main id="main-content" className="flex min-h-screen items-center bg-gray-50/60">
        <Container size="prose" className="py-16 text-center">
          <Logo className="mx-auto mb-8" />
          <h1 className="text-2xl font-bold tracking-tight text-brand-dark">
            This portfolio link is not available
          </h1>
          <p className="mx-auto mt-3 max-w-md text-gray-600">
            The link may have been turned off or replaced. If someone sent it to you, ask them for
            a current one.
          </p>
          <Button to={PATHS.HOME} variant="primary" size="md" radius="lg" className="mt-8">
            Go to Evallo Recruit
          </Button>
        </Container>
      </main>
    );
  }

  const { profile } = state;

  return (
    <main id="main-content" className="min-h-screen bg-gray-50/60">
      {/*
        A minimal attribution bar, not a navbar.

        One mark and one link. A full marketing nav would invite the reader to wander off into
        sign-up flows when they came here to read one document, and a second navigation on a page
        that already has an anchor rail is exactly the duplication the app avoids elsewhere.
      */}
      <div className="border-b border-gray-200 bg-white">
        <Container className="flex items-center justify-between py-4">
          <Logo />
          <span className="text-xs font-medium text-gray-500">
            Shared portfolio
          </span>
        </Container>
      </div>

      <Container className="py-8 sm:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
          <PortfolioNav profile={profile} />

          <div className="min-w-0 space-y-6">
            <PortfolioHero header={profile.header} />
            <PortfolioBody profile={profile} showEmpty={false} />

            <p className="px-2 pb-4 text-center text-xs text-gray-500">
              Shared privately through{' '}
              <a href={PATHS.HOME} className="font-semibold text-brand-blue hover:underline">
                Evallo Recruit
              </a>
              . This page is not indexed by search engines.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}
