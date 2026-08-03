import { useState } from 'react';
import { Container, Icon, Logo } from '@/components/ui';
import { useScrolled } from '@/hooks/useScrolled';
import { PATHS } from '@/router/paths';
import { MobileNavDrawer } from './MobileNavDrawer';
import { UserMenu } from './UserMenu';
import { cn } from '@/utils/cn';

const NAV_LINKS = [
  { href: '#businesses', label: 'For Businesses' },
  { href: '#educators', label: 'For Educators' },
  { href: '#features', label: 'Features' },
];

const MOBILE_LINKS = [...NAV_LINKS, { to: PATHS.SIGN_IN, label: 'Log in' }];

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
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn('text-sm font-medium transition-colors', linkColor)}
              >
                {link.label}
              </a>
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
        links={MOBILE_LINKS}
        ctaTo={PATHS.SIGN_UP}
        ctaLabel="Post a Job"
      />
    </header>
  );
}
