import { Icon } from '@/components/ui';

/**
 * CAN-01 activity summary (PRD §8.2 — "profile views where policy allows, new messages").
 *
 * Both are empty states on purpose, and neither is a stub for missing work:
 *
 * - **Profile views** are conditional in the PRD itself. §18.3 permits them "only if privacy
 *   policy permits and avoids revealing sensitive recruiter behavior", and §16 requires profile
 *   views to be auditable. There is no audit-event collection yet, so there is nothing to count —
 *   and inventing a number would be worse than showing none.
 * - **Messages** belong to CAN-09 (M5). Nothing can arrive before conversations exist.
 *
 * Each states plainly why it is empty rather than showing a zero that looks like a measurement.
 */
export function ActivityCard() {
  return (
    <section
      aria-labelledby="activity-heading"
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <h2 id="activity-heading" className="mb-5 text-lg font-bold text-brand-dark">
        Activity
      </h2>

      <ul className="space-y-5">
        <li className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400"
            aria-hidden="true"
          >
            <Icon name="filter" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-dark">Profile views</p>
            <p className="mt-0.5 text-sm text-gray-600">
              Not available yet. When it is, we will only ever show aggregate counts — never which
              recruiter looked at your profile.
            </p>
          </div>
        </li>

        <li className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400"
            aria-hidden="true"
          >
            <Icon name="comments" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand-dark">Messages</p>
            <p className="mt-0.5 text-sm text-gray-600">
              No conversations yet. Companies can message you once you are discoverable or have
              shared your profile with them.
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}
