import { Link } from 'react-router-dom';
import { COMPANY_ROLE_LABELS } from '@evallo/shared';
import { Avatar, Badge } from '@/components/ui';
import { PATHS, buildPath } from '@/router/paths';

/**
 * One company context on HOME-01.
 *
 * The role shown is the role IN THIS COMPANY — the same person may be an owner here and a viewer
 * elsewhere (ADR-001). It comes from the membership the server resolved for this request, never
 * from anything stored on the user.
 */
export function CompanyContextCard({ company }) {
  const roleLabel = COMPANY_ROLE_LABELS[company.role] ?? company.role;

  return (
    <li>
      <Link
        to={buildPath(PATHS.COMPANY_HOME, { companySlug: company.slug })}
        className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2"
      >
        <Avatar
          src={company.logoUrl}
          initials={company.initials}
          size="sm"
          shape="rounded"
          tone="brand"
        />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-brand-dark">{company.name}</span>
          <span className="block text-xs text-gray-500">
            {roleLabel} · {company.permissions.length} permissions
          </span>
        </span>

        <Badge tone="brand" size="sm" radius="full">
          {roleLabel}
        </Badge>
      </Link>
    </li>
  );
}
