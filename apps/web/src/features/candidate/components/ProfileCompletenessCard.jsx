import { Icon } from '@/components/ui';

/**
 * CAN-01 profile completeness (PRD §8.2, §18.3).
 *
 * Reports completeness **by section**, not as an opaque score: §18.3 requires guidance based on
 * missing structured data. The percentage is a summary of the named list below it, never a hidden
 * quality rating — the list is what the candidate can act on.
 *
 * Only sections the profile can hold today are counted; experience, credentials, and media arrive
 * with the profile builder and would otherwise report a permanently incomplete profile.
 */
export function ProfileCompletenessCard({ completeness }) {
  const { percent, completed, total, sections } = completeness;

  return (
    <section
      aria-labelledby="completeness-heading"
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="completeness-heading" className="text-lg font-bold text-brand-dark">
          Profile completeness
        </h2>
        <span className="text-sm font-semibold text-brand-blue">{percent}%</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby="completeness-heading"
        className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
      >
        <div
          className="h-full rounded-full bg-brand-blue transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-gray-600">
        {completed} of {total} sections done.{' '}
        {percent === 100
          ? 'Everything we can collect so far is filled in.'
          : 'Recruiters see richer profiles first.'}
      </p>

      <ul className="mt-5 space-y-2.5">
        {sections.map((section) => (
          <li key={section.key} className="flex items-start gap-3">
            {section.complete ? (
              <Icon
                name="circle-check"
                label="Complete"
                className="mt-0.5 shrink-0 text-sm text-green-600"
              />
            ) : (
              <span
                className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gray-300"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span
                className={`block text-sm ${
                  section.complete ? 'text-gray-500 line-through' : 'font-medium text-brand-dark'
                }`}
              >
                {section.label}
              </span>
              {!section.complete && (
                <span className="block text-xs text-gray-500">{section.hint}</span>
              )}
              {section.complete && <span className="sr-only">Complete</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
