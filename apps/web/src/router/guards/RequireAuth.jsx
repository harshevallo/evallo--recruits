import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';

/**
 * Route guard for authenticated screens.
 *
 * UX only — it stops a visitor landing on a screen that will fail. The server re-verifies every
 * request independently (03_TRD.md §4.2), so removing this guard would change nothing about
 * what data is reachable.
 *
 * The attempted path travels in router state so sign-in can return the visitor to it.
 */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-blue"
          aria-hidden="true"
        />
        <span className="sr-only" role="status">
          Checking your session…
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={PATHS.SIGN_IN} state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
