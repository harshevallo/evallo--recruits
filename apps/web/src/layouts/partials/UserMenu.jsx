import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';
import { accountDestinations } from './accountDestinations';
import { cn } from '@/utils/cn';

function initialsFor(user) {
  const source = user?.name || user?.email || '?';
  return source
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/**
 * Navbar account control.
 *
 * Signed out: sign-in link plus the primary CTA.
 * Signed in: avatar menu with the workspace link and sign out.
 */
export function UserMenu({ linkColor }) {
  const { isAuthenticated, isLoading, user, signOut, capabilities } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (isLoading) {
    return <div className="h-10 w-24 animate-pulse rounded-full bg-gray-200/40" aria-hidden="true" />;
  }

  if (!isAuthenticated) {
    return (
      <div className="ml-4 flex items-center space-x-4">
        <Link to={PATHS.SIGN_IN} className={cn('text-sm font-medium transition-colors', linkColor)}>
          Log in
        </Link>
        {/*
          Candidate-first: the navbar's single prominent CTA belongs to the educator, not the
          recruiter. Hiring is reachable from the hero's secondary action and from HOME-01 after
          sign-in, so nothing is lost by not putting it here.
        */}
        <Button to={PATHS.SIGN_UP} variant="primary" size="sm">
          Apply for roles
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative ml-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-gray-100/20"
      >
        <Avatar src={user?.profilePicture} initials={initialsFor(user)} size="sm" tone="brand" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-100 bg-white py-2 shadow-lg"
        >
          <div className="border-b border-gray-100 px-4 pb-2">
            <p className="truncate text-sm font-medium text-brand-dark">
              {user?.name ?? 'Your account'}
            </p>
            <p className="truncate text-xs text-gray-500">{user?.email}</p>
          </div>

          {/*
            Destinations come from `accountDestinations`, shared with the mobile drawer — the same
            question deserves the same answer on both surfaces, and one list means neither can be
            updated without the other. Capability filtering lives there (ADR-001).
          */}
          {accountDestinations(capabilities).map((group) => (
            <div
              key={group.group}
              className={group.group === 'account' ? '' : 'mt-1 border-t border-gray-100 pt-1'}
            >
              {group.label && (
                <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block truncate px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
