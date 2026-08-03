import {
  ROLE_CATEGORY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_LABELS,
} from '@evallo/shared';
import { Badge, Button } from '@/components/ui';

function roleTitle(role) {
  if (role.title) return role.title;
  return (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c).join(', ');
}

function roleMeta(role) {
  const employment = (role.employmentTypes ?? []).map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t);
  const delivery = (role.deliveryModes ?? []).map((m) => DELIVERY_MODE_LABELS[m] ?? m);
  const locations = (role.locations ?? [])
    .map((l) => [l.city, l.country].filter(Boolean).join(', '))
    .filter(Boolean);

  return [...employment, ...delivery, ...locations].filter(Boolean);
}

/**
 * One hiring intent — PRD §7.5.
 *
 * A detailed description is optional by design, so the card must read well with role category
 * and work arrangement alone.
 */
export function OpenRoleCard({ role, onExpressInterest }) {
  const meta = roleMeta(role);
  const subjects = role.specializations?.subjects ?? [];

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-brand-dark">{roleTitle(role)}</h3>

          {meta.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">{meta.join(' • ')}</p>
          )}

          {role.description && (
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{role.description}</p>
          )}

          {subjects.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {subjects.map((subject) => (
                <Badge key={subject} tone="neutral" size="sm" radius="md">
                  {subject}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => onExpressInterest(role.id)}
          className="flex-shrink-0"
        >
          I&apos;m interested
        </Button>
      </div>
    </article>
  );
}
