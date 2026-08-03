import { Link } from 'react-router-dom';
import {
  ORGANIZATION_TYPE_LABELS,
  EDUCATION_SERVICE_LABELS,
  ROLE_CATEGORY_LABELS,
} from '@evallo/shared';
import { Avatar, Badge, Icon } from '@/components/ui';
import { PATHS, buildPath } from '@/router/paths';

function formatLocation(location) {
  if (!location) return null;
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

/** Distinct role categories across a company's active hiring intents. */
function roleLabels(activeRoles = []) {
  const unique = new Set();
  for (const role of activeRoles) {
    for (const category of role.roleCategories ?? []) unique.add(category);
  }
  return [...unique].map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
}

/**
 * Directory result card — PRD §9.1, §7.4.
 *
 * The whole card is a link to the public company page (PUB-02).
 */
export function CompanyCard({ company }) {
  const location = formatLocation(company.location);
  const roles = roleLabels(company.activeRoles);
  const services = (company.educationServices ?? []).slice(0, 3);

  return (
    <article className="group h-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-start gap-4">
        <Avatar
          src={company.logoUrl}
          initials={company.initials}
          size="md"
          shape="rounded"
          tone="brand"
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-brand-dark">
            <Link
              to={buildPath(PATHS.COMPANY_PROFILE, { slug: company.slug })}
              className="outline-none after:absolute after:inset-0 group-hover:text-brand-blue"
            >
              {company.name}
            </Link>
          </h3>

          <p className="truncate text-sm text-gray-500">
            {ORGANIZATION_TYPE_LABELS[company.organizationType] ?? company.organizationType}
            {location && ` • ${location}`}
          </p>
        </div>

        {company.isCurrentlyHiring && (
          <Badge tone="successLight" size="sm" radius="full" weight="bold">
            Hiring
          </Badge>
        )}
      </div>

      {(company.tagline || company.description?.short) && (
        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-gray-600">
          {company.description?.short || company.tagline}
        </p>
      )}

      {services.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {services.map((service) => (
            <Badge key={service} tone="neutral" size="sm" radius="md">
              {EDUCATION_SERVICE_LABELS[service] ?? service}
            </Badge>
          ))}
        </div>
      )}

      {roles.length > 0 ? (
        <div className="flex items-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
          <Icon name="circle-check" className="mt-0.5 flex-shrink-0 text-brand-blue" />
          <span>
            <span className="font-medium text-brand-dark">
              {company.activeRoleCount} open {company.activeRoleCount === 1 ? 'role' : 'roles'}
            </span>
            {' — '}
            {roles.slice(0, 3).join(', ')}
            {roles.length > 3 && ` +${roles.length - 3} more`}
          </span>
        </div>
      ) : (
        <div className="border-t border-gray-100 pt-4 text-sm text-gray-400">
          No open roles right now
        </div>
      )}
    </article>
  );
}
