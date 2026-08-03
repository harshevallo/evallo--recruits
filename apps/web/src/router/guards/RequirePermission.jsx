import { Navigate, Outlet } from 'react-router-dom';
import { useCompany } from '@/context/CompanyContext';
import { buildPath, PATHS } from '@/router/paths';

/**
 * Requires a permission AT THE ACTIVE COMPANY.
 *
 * The same user may pass this at one company and fail at another — which is the point of
 * resolving permissions from membership rather than from a global role.
 *
 * @param {{ permission: string }} props
 */
export function RequirePermission({ permission }) {
  const { activeCompany, can } = useCompany();

  if (!activeCompany) return <Navigate to={PATHS.APP_HOME} replace />;

  if (!can(permission)) {
    return (
      <Navigate to={buildPath(PATHS.COMPANY_HOME, { companySlug: activeCompany.slug })} replace />
    );
  }

  return <Outlet />;
}
