import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';

/**
 * Requires an active membership in the company named by the URL.
 *
 * UX only — the server resolves membership independently on every request, so this changes what
 * the user sees, never what they can reach.
 */
export function RequireCompany() {
  const { capabilities, isAuthenticated, isLoading } = useAuth();
  const { companySlug } = useParams();

  /*
   * Capabilities arrive just after the session does, so `capabilities === null` on an
   * authenticated user means "still loading", not "not a member". Without this, a hard reload of
   * a company URL redirects a genuine member away.
   */
  if (isLoading || (isAuthenticated && capabilities === null)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-blue"
          aria-hidden="true"
        />
        <span className="sr-only" role="status">
          Loading company…
        </span>
      </div>
    );
  }

  const isMember = (capabilities?.companies ?? []).some((c) => c.slug === companySlug);
  if (!isMember) return <Navigate to={PATHS.APP_HOME} replace />;

  return <Outlet />;
}
