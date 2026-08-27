import {
  ROLE_CATEGORY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_LABELS,
  COUNTRY_LABELS,
} from '@evallo/shared';
import { Button, Icon } from '@/components/ui';

/**
 * A role's heading.
 *
 * `title` is optional by design — PRD §7.5 lets a company activate hiring with only a role
 * category, and the server does not invent one. The categories become the heading in that case,
 * which reads correctly rather than leaving a blank line.
 */
function roleTitle(role) {
  if (role.title?.trim()) return role.title;
  const categories = (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
  return categories.length > 0 ? categories.join(' · ') : 'Open role';
}

/**
 * The category chip above the title.
 *
 * Only when it is not already the heading — otherwise a role with no title renders the same words
 * twice, once as a chip and once as an <h3> directly under it.
 */
function categoryChip(role) {
  if (!role.title?.trim()) return null;
  const [first] = role.roleCategories ?? [];
  return first ? (ROLE_CATEGORY_LABELS[first] ?? first) : null;
}

/** "Remote", "Part-time", "Bengaluru, India", "3+ years" — the icon row under the title. */
function roleFacts(role) {
  const places = (role.locations ?? [])
    .map((l) => [l.city, l.region, COUNTRY_LABELS[l.country] ?? l.country].filter(Boolean).join(', '))
    .filter(Boolean);
  const delivery = (role.deliveryModes ?? []).map((m) => DELIVERY_MODE_LABELS[m] ?? m);
  const employment = (role.employmentTypes ?? []).map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t);

  const where = [...places, ...delivery];

  /* Free text on the model (`experienceLevels: [String]`), so it is shown as the company wrote it. */
  const seniority = [...(role.experienceLevels ?? [])];
  if (typeof role.minYears === 'number' && role.minYears > 0) {
    seniority.push(`${role.minYears}+ ${role.minYears === 1 ? 'year' : 'years'}`);
  }

  return [
    where.length > 0 && { icon: 'location-dot', text: where.join(' · ') },
    employment.length > 0 && { icon: 'briefcase', text: employment.join(' · ') },
    seniority.length > 0 && { icon: 'chart-line', text: seniority.join(' · ') },
  ].filter(Boolean);
}

/**
 * "Posted 2 days ago", from `createdAt`.
 *
 * Relative rather than a date, because the question a candidate is asking is whether the role is
 * still warm, not which Tuesday it opened. Anything past a month falls back to the absolute date:
 * "posted 7 months ago" reads as stale in a way that is usually unfair to a long-running vacancy.
 */
function postedLabel(createdAt) {
  if (!createdAt) return null;

  const posted = new Date(createdAt);
  if (Number.isNaN(posted.getTime())) return null;

  const days = Math.floor((Date.now() - posted.getTime()) / 86_400_000);

  if (days < 0) return null;
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 31) return `Posted ${days} days ago`;

  return `Posted ${posted.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
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

/**
 * One hiring intent on the company's own page — PRD §7.5.
 *
 * The company is established by the page around it, so the card never names it. A detailed
 * description is optional by design, so the card has to read well with a role category and a work
 * arrangement alone — which is why every block below is conditional and none of them is a
 * placeholder.
 *
 * `onExpressInterest` is optional: REC-06 renders this card as a preview, where the action exists
 * but must not be operable. It is dropped there rather than wired to a no-op button, so a
 * recruiter is never shown an Apply control that silently does nothing.
 */
export function OpenRoleCard({ role, onExpressInterest }) {
  const facts = roleFacts(role);
  const chip = categoryChip(role);
  const posted = postedLabel(role.createdAt);
  const pay = payLine(role.compensation);
  const subjects = role.specializations?.subjects ?? [];

  return (
    <article className="group flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-blue/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {(chip || posted) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {chip && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                {chip}
              </span>
            )}
            {posted && <span className="text-xs text-gray-500">{posted}</span>}
          </div>
        )}

        <h3 className="text-base font-bold text-brand-dark transition-colors group-hover:text-brand-blue">
          {roleTitle(role)}
        </h3>

        {facts.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
            {facts.map((fact) => (
              <span key={fact.icon} className="flex items-center gap-1">
                <Icon name={fact.icon} className="text-[10px] text-gray-400" />
                {fact.text}
              </span>
            ))}
            {pay && (
              <span className="flex items-center gap-1 font-semibold text-brand-dark">{pay}</span>
            )}
          </div>
        )}

        {role.description && (
          <p className="mt-3 text-sm leading-relaxed text-gray-600">{role.description}</p>
        )}

        {subjects.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {subjects.map((subject) => (
              <li
                key={subject}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {subject}
              </li>
            ))}
          </ul>
        )}
      </div>

      {onExpressInterest && (
        <Button
          variant="outlineDark"
          size="none"
          radius="lg"
          className="w-full shrink-0 justify-center !border-gray-200 px-5 py-2 text-sm font-semibold !text-brand-dark hover:!bg-gray-50 sm:w-auto"
          onClick={() => onExpressInterest(role.id)}
        >
          Apply
        </Button>
      )}
    </article>
  );
}
