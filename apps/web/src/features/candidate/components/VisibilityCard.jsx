import { Badge, Button, Icon } from '@/components/ui';
import { PATHS } from '@/router/paths';

/**
 * Candidate visibility state on CAN-01 (PRD §4.3, §8.2).
 *
 * Read-only. CAN-04 owns changing it — this screen reports the current state and what it means,
 * because "am I discoverable right now?" is the question the candidate actually has, and the
 * state names alone do not answer it.
 */
const STATES = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    meaning: 'Only you can see this profile. It is not in search and cannot be shared with a company.',
  },
  private: {
    label: 'Private',
    tone: 'neutral',
    meaning:
      'Excluded from recruiter search. You can still share it with a specific company by expressing interest.',
  },
  discoverable: {
    label: 'Discoverable',
    tone: 'successLight',
    meaning:
      'Authorised recruiters at published companies can find you in search, subject to your contact rules.',
  },
  paused: {
    label: 'Paused',
    tone: 'neutral',
    meaning:
      'Hidden from new searches. Companies you have already shared with keep the access you granted.',
  },
  archived: {
    label: 'Archived',
    tone: 'neutral',
    meaning: 'Not in active use. Retained according to policy.',
  },
};

const CONTACT_RULES = {
  hidden: 'Hidden — recruiters cannot see your contact details.',
  authorized_recruiters: 'Visible to authorised recruiters at published companies.',
  after_interest: 'Visible only after you express interest in a company.',
  on_request: 'Shared only when you approve a request.',
};

export function VisibilityCard({ profile }) {
  const state = STATES[profile.status] ?? STATES.draft;

  return (
    <section
      aria-labelledby="visibility-heading"
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="visibility-heading" className="text-lg font-bold text-brand-dark">
          Visibility
        </h2>
        <Badge tone={state.tone} size="sm" radius="full">
          {state.label}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-gray-600">{state.meaning}</p>

      <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
        <Icon name="shield-halved" className="mt-0.5 shrink-0" />
        <span>{CONTACT_RULES[profile.contactVisibility] ?? CONTACT_RULES.hidden}</span>
      </p>

      <Button
        to={PATHS.CANDIDATE_VISIBILITY}
        variant="outlineDark"
        size="sm"
        radius="lg"
        className="mt-5 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
      >
        Manage visibility
      </Button>
    </section>
  );
}
