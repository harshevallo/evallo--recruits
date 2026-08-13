import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { accountDestinations } from './accountDestinations';

/**
 * Mobile navigation panel.
 *
 * A disclosure, not a modal — it expands below the navbar rather than covering the page, so the
 * correct pattern is aria-expanded/aria-controls on the trigger plus Escape to dismiss, not a
 * focus trap.
 *
 * It carries the account section too, because the avatar menu that holds it is inside the DESKTOP
 * nav (`hidden md:flex`). Below that breakpoint a signed-in person previously had no way to reach
 * their profile, their messages, their companies, their settings — or to sign out at all. This is
 * the only account surface a phone has, so it renders the same destinations the avatar menu does
 * (see accountDestinations) rather than a reduced set.
 *
 * Items with `to` are routes; items with `href` are in-page anchors.
 */
export function MobileNavDrawer({ id, open, onClose, links, ctaTo, ctaLabel }) {
  const { isAuthenticated, user, signOut, capabilities } = useAuth();

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const itemClass =
    'block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-gray-800 hover:text-white';

  const groups = isAuthenticated ? accountDestinations(capabilities) : [];

  return (
    <div
      id={id}
      /*
        Capped and scrollable. A signed-in account can have candidate links, up to four companies
        and settings on top of the marketing links, which on a short phone would otherwise push
        sign-out below the fold with no way to reach it.
      */
      className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-gray-800 bg-brand-dark/95 backdrop-blur-md md:hidden"
    >
      <nav className="space-y-1 px-2 pb-3 pt-2 sm:px-3" aria-label="Mobile">
        {links.map((link) =>
          link.to ? (
            <Link key={link.to} to={link.to} onClick={onClose} className={itemClass}>
              {link.label}
            </Link>
          ) : (
            <a key={link.href} href={link.href} onClick={onClose} className={itemClass}>
              {link.label}
            </a>
          ),
        )}

        {isAuthenticated ? (
          <>
            {groups.map((group) => (
              <div key={group.group} className="mt-1 border-t border-gray-800 pt-1">
                {group.label && (
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <Link key={item.to} to={item.to} onClick={onClose} className={itemClass}>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="mt-1 border-t border-gray-800 pt-1">
              {user?.email && (
                <p className="truncate px-3 py-1 text-xs text-gray-500">{user.email}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  signOut();
                }}
                className={`w-full text-left ${itemClass}`}
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          /* The signup CTA belongs to a visitor. Showing it to someone already signed in is noise. */
          <Link
            to={ctaTo}
            onClick={onClose}
            className="mt-4 block rounded-md bg-brand-blue px-3 py-2 text-center text-base font-medium text-white hover:bg-blue-600"
          >
            {ctaLabel}
          </Link>
        )}
      </nav>
    </div>
  );
}
