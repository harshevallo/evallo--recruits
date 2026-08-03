import { Button, Icon } from '@/components/ui';
import { PATHS } from '@/router/paths';

const TARGETS = {
  profile: PATHS.CANDIDATE_PROFILE_BUILDER,
  visibility: PATHS.CANDIDATE_VISIBILITY,
};

/**
 * CAN-01 pending actions (PRD §8.2).
 *
 * The list comes from the server, which derives it from missing structured data — PRD §18.3
 * explicitly rules out opaque scoring, so every item names the thing that is missing and links to
 * where it is fixed.
 */
export function NextStepsCard({ steps }) {
  if (steps.length === 0) {
    return (
      <section
        aria-labelledby="next-steps-heading"
        className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="next-steps-heading" className="text-lg font-bold text-brand-dark">
          Pending actions
        </h2>
        <p className="mt-3 flex items-start gap-2 text-sm text-gray-600">
          <Icon name="circle-check" className="mt-0.5 shrink-0 text-green-600" />
          <span>Nothing needs your attention. Your profile is as complete as it can be today.</span>
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-steps-heading"
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <h2 id="next-steps-heading" className="mb-1 text-lg font-bold text-brand-dark">
        Pending actions
      </h2>
      <p className="mb-5 text-sm text-gray-600">
        {steps.length} {steps.length === 1 ? 'thing' : 'things'} to finish, most useful first.
      </p>

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-brand-blue"
              aria-hidden="true"
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand-dark">{step.title}</p>
              <p className="mt-0.5 text-sm text-gray-600">{step.description}</p>
            </div>

            <Button
              to={TARGETS[step.target] ?? PATHS.CANDIDATE_PROFILE_BUILDER}
              variant="link"
              size="none"
              radius="none"
              className="mt-0.5 shrink-0 text-sm font-medium"
            >
              Fix
              <Icon name="arrow-right" className="text-xs" />
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
