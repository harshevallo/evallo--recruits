import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Icon, Logo } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useScrolled } from '@/hooks/useScrolled';
import { PATHS } from '@/router/paths';
import { MobileNavDrawer } from './MobileNavDrawer';
import { UserMenu } from './UserMenu';
import { cn } from '@/utils/cn';

/*
 * Path-qualified fragments, routed rather than followed as raw hrefs.
 *
 * These sections exist only on the marketing page, but this navbar renders on EVERY page that uses
 * MarketingLayout — the company directory, the authenticated app home, the placeholders. A bare
 * `#businesses` there resolves against the current URL and matches nothing, so the link silently
 * did nothing; `/#businesses` sends the reader to the section wherever they click it.
 *
 * They are `to` (React Router), NOT `href`. A raw `<a href="/#businesses">` clicked from any page
 * other than the landing page is a FULL DOCUMENT LOAD: the whole app tears down and reboots, which
 * repaints the page and restarts the session check, so anything gated on auth — the Home link, the
 * avatar — disappears and pops back in a moment later. Routing the click keeps the app alive, and
 * `ScrollToHash` performs the scroll that the browser would otherwise have done.
 */
const NAV_LINKS = [
  /*
   * Discovery first, pitch second.
   *
   * The three entries below are anchors into the landing page — they sell the product. These two
   * are the product: real roles and real companies, browsable without an account. A visitor who
   * arrived to see whether there is any work for them had no link to it, because until Phase 1
   * role search existed only at `/me/roles` behind a sign-in wall.
   */
  { to: PATHS.PUBLIC_ROLES, label: 'Find Roles' },
  { to: PATHS.COMPANY_DIRECTORY, label: 'Companies' },
  { to: `${PATHS.HOME}#businesses`, label: 'For Businesses' },
  { to: `${PATHS.HOME}#educators`, label: 'For Educators' },
  { to: `${PATHS.HOME}#features`, label: 'Features' },
];

const MOBILE_LINKS = [...NAV_LINKS, { to: PATHS.SIGN_IN, label: 'Log in' }];

/**
 * HOME-01, one click from anywhere signed in.
 *
 * `/home` was reachable only through the avatar menu, so returning to it cost two clicks and a
 * menu that gives no hint it contains a Home entry. This navbar renders on every authenticated
 * screen, which makes it the one place a direct link fixes the whole product at once.
 *
 * Signed-in only, because `/home` sits behind RequireAuth: showing it to a visitor would be a link
 * that bounces to sign-in, which is worse than no link.
 */
const HOME_LINK = { to: PATHS.APP_HOME, label: 'Home' };

const MENU_ID = 'mobile-menu';

/**
 * Fixed navbar, transparent over the hero and solid white once scrolled.
 *
 * Every colour derives from one `scrolled` boolean, so the two states are the only states that
 * can exist — see useScrolled for why that matters.
 */
/**
 * @param {boolean} [transparentOnTop]
 *   Only pass this on pages with a DARK hero behind the navbar. Light-background pages must
 *   leave it off — a transparent navbar over a white page renders gray-300 links (~1.5:1) and a
 *   white wordmark (invisible), which is what this prop exists to prevent.
 */
export function MarketingNavbar({ transparentOnTop = false }) {
  const scrolled = useScrolled(10);
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, isLoading } = useAuth();

  /* Signed in, the drawer gains Home and loses "Log in" — which was pointing an authenticated
     visitor at the sign-in screen. */
  const mobileLinks = isAuthenticated ? [HOME_LINK, ...NAV_LINKS] : MOBILE_LINKS;

  // Solid unless the page explicitly opts into a transparent bar AND we are at the top.
  const solid = !transparentOnTop || scrolled;

  const linkColor = solid
    ? 'text-gray-700 hover:text-brand-blue'
    : 'text-gray-200 hover:text-white';

  return (
    <header
      className={cn(
        'fixed z-50 w-full transition-all duration-300',
        solid && 'bg-white shadow-md',
      )}
    >
      <Container>
        <div className="flex h-20 items-center justify-between">
          <Logo tone={solid ? 'dark' : 'light'} />

          {/* Desktop */}
          <nav className="hidden items-center space-x-8 md:flex" aria-label="Main">
            {/*
              While the session is still being checked we do not yet know whether Home belongs
              here, so the slot is HELD rather than left empty: an invisible copy reserves exactly
              the width the link will take. Rendering nothing made the rest of the nav sit further
              left for a moment and then jump sideways when the check returned — the same pop the
              avatar avoids with its own placeholder.
            */}
            {isLoading ? (
              <span aria-hidden="true" className="invisible text-sm font-medium">
                {HOME_LINK.label}
              </span>
            ) : isAuthenticated ? (
              <Link
                to={HOME_LINK.to}
                className={cn('text-sm font-medium transition-colors', linkColor)}
              >
                {HOME_LINK.label}
              </Link>
            ) : null}

            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn('text-sm font-medium transition-colors', linkColor)}
              >
                {link.label}
              </Link>
            ))}

            <UserMenu linkColor={linkColor} />
          </nav>

          {/* Mobile trigger */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls={MENU_ID}
              // The prototype ships this as an icon-only button with no accessible name.
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={cn(
                'rounded p-1 transition-colors',
                solid ? 'text-gray-700' : 'text-gray-200 hover:text-white',
              )}
            >
              <Icon name={menuOpen ? 'xmark' : 'bars'} className="text-2xl" />
            </button>
          </div>
        </div>
      </Container>

      <MobileNavDrawer
        id={MENU_ID}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        links={mobileLinks}
        /* Candidate-first: the single prominent CTA is the educator's, not the recruiter's. */
        ctaTo={PATHS.SIGN_UP}
        ctaLabel="Apply for roles"
      />
    </header>
  );
}
