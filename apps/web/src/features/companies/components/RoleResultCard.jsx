import { Link } from 'react-router-dom';
import {
  ROLE_CATEGORY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_LABELS,
  SUBJECT_LABELS,
  COUNTRY_LABELS,
} from '@evallo/shared';
import { Avatar, Badge, Icon } from '@/components/ui';
import { PATHS, buildPath } from '@/router/paths';

/**
 * One ROLE, as a search result.
 *
 * Deliberately not `OpenRoleCard`, and deliberately not `CompanyCard`. The three answer different
 * questions and lead with different things:
 *
 *   `OpenRoleCard`      a role ON a company's own page — the company is already established by the
 *                       page around it, so the card never names it, and it carries the interest CTA.
 *   `CompanyCard`       a company in the directory — name first, type and services beneath.
 *   this               a role found across companies — TITLE first, company second as the answer
 *                       to "who is hiring for this".
 *
 * That inversion is the whole point of a separate card. Reusing `OpenRoleCard` would have meant a
 * result with no company on it; reusing `CompanyCard` would have made the organisation primary,
 * which is the thing the meeting explicitly ruled out.
 *
 * ── Where it links ───────────────────────────────────────────────────────────────────────────
 *
 * The company page, anchored at its roles: `/me/companies/<slug>#open-roles`. There is no separate
 * role detail page and no second interest flow — the consent disclosure, the intent selector and
 * the access grant all live on that page already (CAN-06/CAN-07), and a second implementation of a
 * consented disclosure is the last thing this product should have two of.
 */

/**
 * A role's heading.
 *
 * `title` is optional by design — PRD §7.5 lets a company activate hiring with only a role
 * category, and the server does not invent one. So the categories become the heading when there is
 * no title, which reads correctly ("School Teacher") rather than showing a blank line.
 */
function roleHeading(role) {
  if (role.title?.trim()) return role.title;
  const categories = (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
  return categories.length > 0 ? categories.join(' · ') : 'Open role';
}

/** "Remote · Full-time · Bengaluru, India" — the one line under the company name. */
function metaLine(role) {
  const delivery = (role.deliveryModes ?? []).map((m) => DELIVERY_MODE_LABELS[m] ?? m);
  const employment = (role.employmentTypes ?? []).map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t);
  const places = (role.locations ?? [])
    .map((l) => [l.city, l.region, COUNTRY_LABELS[l.country] ?? l.country].filter(Boolean).join(', '))
    .filter(Boolean);

  return [...delivery, ...employment, ...places].filter(Boolean);
}

/** Compensation, only ever when the company published it — the server withholds the rest. */
function payLine(compensation) {
  if (!compensation) return null;

  const { min, max, currency, period } = compensation;
  if (min == null && max == null) return null;

  const money = (value) => `${currency ? `${currency} ` : ''}${Number(value).toLocaleString()}`;
  const range = min != null && max != null ? `${money(min)}–${money(max)}` : money(min ?? max);

  return period ? `${range} / ${period}` : range;
}

export function RoleResultCard({ role }) {
  const heading = roleHeading(role);
  const meta = metaLine(role);
  const pay = payLine(role.compensation);
  const subjects = (role.specializations?.subjects ?? []).slice(0, 4);

  /*
   * A role whose company could not be resolved is not rendered. It would have nowhere to link and
   * nothing to attribute the role to — and it should not occur, since the server only returns
   * intents whose company passed the visibility predicate.
   */
  if (!role.company) return null;

  const companyHref = `${buildPath(PATHS.CANDIDATE_COMPANY_PROFILE, { slug: role.company.slug })}#open-roles`;

  return (
    <article className="group relative h-full rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      {/* PRIMARY: the role. The whole card is its link, via the stretched pseudo-element. */}
      <h3 className="text-lg font-bold leading-snug text-brand-dark">
        <Link
          to={companyHref}
          className="outline-none after:absolute after:inset-0 group-hover:text-brand-blue"
        >
          {heading}
        </Link>
      </h3>

      {/* SECONDARY: who is hiring, with their branding. */}
      <div className="mt-3 flex items-center gap-3">
        <Avatar
          src={role.company.logoUrl}
          initials={role.company.initials}
          size="sm"
          shape="rounded"
          tone="brand"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-gray-700">
            {role.company.name}
          </span>
          {meta.length > 0 && (
            <span className="block truncate text-xs text-gray-500">{meta.join(' · ')}</span>
          )}
        </span>
      </div>

      {subjects.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <li key={subject}>
              <Badge tone="neutral" size="xs" radius="full">
                {SUBJECT_LABELS[subject] ?? subject}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        {pay && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-dark">
            <Icon name="chart-line" className="text-[10px]" />
            {pay}
          </span>
        )}
        {typeof role.minYears === 'number' && (
          <span>
            {role.minYears}+ {role.minYears === 1 ? 'year' : 'years'} experience
          </span>
        )}
        {role.postedAt && <span>Posted {new Date(role.postedAt).toLocaleDateString()}</span>}
      </div>
    </article>
  );
}
