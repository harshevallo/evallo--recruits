import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';

/**
 * Requires the candidate capability — i.e. a CandidateProfile exists (ADR-001).
 *
 * UX only. It sends a user without a profile back to HOME-01, where creating one is an explicit
 * action; it never creates one, and it is not the security boundary. The server re-derives the
 * capability on every request (ADR-006).
 */
export function RequireCandidate() {
  const { capabilities, isAuthenticated, isLoading } = useAuth();

  /*
   * `status` flips to authenticated as soon as the session is established, but capabilities are
   * fetched immediately afterwards — so there is a window where the user is signed in and
   * `capabilities` is still null. Treating that as "no candidate profile" would bounce a real
   * candidate off this page on every hard reload.
   */
  if (isLoading || (isAuthenticated && capabilities === null)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-blue"
          aria-hidden="true"
        />
        <span className="sr-only" role="status">
          Loading your profile…
        </span>
      </div>
    );
  }

  if (!capabilities?.hasCandidateProfile) return <Navigate to={PATHS.APP_HOME} replace />;

  return <Outlet />;
}
