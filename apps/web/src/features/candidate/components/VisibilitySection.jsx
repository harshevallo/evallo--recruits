import { useEffect, useState } from 'react';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { Button, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchVisibility, updateVisibility } from '@/services';

/**
 * CAN-02 publish and visibility, inside the builder (PRD §4.3, §8.5).
 *
 * Reuses the CAN-04 endpoints exactly — `fetchVisibility` and `updateVisibility`. There is one
 * visibility implementation and this is a second surface onto it, not a second copy: a candidate
 * who sets themselves discoverable here and private on the settings screen must be looking at the
 * same value, or one of the two screens is lying about who can see them.
 */

/** The consequence is the label. "Private" alone does not tell anyone whether they are findable. */
const STATUS_OPTIONS = [
  {
    value: CANDIDATE_VISIBILITY.DISCOVERABLE,
    title: 'Discoverable',
    icon: 'magnifying-glass',
    detail: 'Companies can find you in candidate search.',
  },
  {
    value: CANDIDATE_VISIBILITY.PRIVATE,
    title: 'Private',
    icon: 'lock',
    detail: 'Hidden from search. Only companies you approach can see you.',
  },
  {
    value: CANDIDATE_VISIBILITY.PAUSED,
    title: 'Paused',
    icon: 'circle-pause',
    detail: 'Out of new searches. Companies you already share with keep access.',
  },
];

export function VisibilitySection({ publishBlockers = [], onChanged }) {
  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchVisibility({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, []);

  async function change(changes, message) {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await updateVisibility(changes);
      setState((current) => ({ ...current, ...data }));
      setFeedback({ tone: 'success', text: message });
      await onChanged?.();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.status ?? error.message ?? 'We could not save that.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading your visibility settings…</span>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <StatusRegion tone="error">{state.message ?? 'We could not load this.'}</StatusRegion>;
  }

  const current = state.visibility?.status ?? state.status;
  const contactRule = state.visibility?.contactVisibility ?? state.contactVisibility;
  const isDraft = current === CANDIDATE_VISIBILITY.DRAFT;
  const canPublish = publishBlockers.length === 0;

  /* The toggle maps onto the two contact rules it can express; the others stay on CAN-04. */
  const contactShared = contactRule === CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS;

  return (
    <div>
      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-5">
          {feedback.text}
        </StatusRegion>
      )}

      {/*
        Settings live in the section card; the publish panel deliberately does not. Publishing is
        a different kind of act from changing a setting — it is the end of the builder, not
        another switch — and the reference separates them for the same reason.
      */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h3 className="mb-4 text-base font-bold text-brand-dark">Profile visibility status</h3>
      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <legend className="sr-only">Profile visibility status</legend>
        {STATUS_OPTIONS.map((option) => {
          const isActive = current === option.value;
          return (
            <label
              key={option.value}
              className={`relative block cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                isActive ? 'border-brand-blue bg-brand-blue/[0.03]' : 'border-gray-200 hover:border-gray-300'
              } ${busy ? 'opacity-60' : ''}`}
            >
              <span className="absolute right-3.5 top-3.5">
                <input
                  type="radio"
                  name="builder-visibility"
                  className="h-4 w-4 accent-brand-blue"
                  checked={isActive}
                  disabled={busy}
                  onChange={() =>
                    change({ status: option.value }, `Visibility set to ${option.title.toLowerCase()}.`)
                  }
                />
              </span>
              <Icon
                name={option.icon}
                className={`mb-2 text-xl ${isActive ? 'text-brand-blue' : 'text-gray-400'}`}
              />
              <span className="mb-0.5 block text-sm font-bold text-brand-dark">{option.title}</span>
              <span className="block text-[11px] text-gray-500">{option.detail}</span>
            </label>
          );
        })}
      </fieldset>

      <hr className="my-8 border-gray-100" />

      <h3 className="mb-4 text-base font-bold text-brand-dark">Contact privacy</h3>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-slate-50/50 p-4">
        <div>
          <p className="text-sm font-semibold text-brand-dark">
            Direct contact details (email and phone)
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            When off, companies must reach you through Evallo Recruit messaging first. More precise
            rules live in visibility settings.
          </p>
        </div>
        <label className="relative inline-flex flex-shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={contactShared}
            disabled={busy}
            onChange={(event) =>
              change(
                {
                  contactVisibility: event.target.checked
                    ? CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS
                    : CONTACT_VISIBILITY.HIDDEN,
                },
                event.target.checked ? 'Contact details shared.' : 'Contact details hidden.',
              )
            }
          />
          <span className="sr-only">Share my contact details with companies</span>
          <div className="h-6 w-11 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-blue peer-checked:after:translate-x-full peer-checked:after:border-white" />
        </label>
      </div>
      </div>

      {/*
        Publication. The blockers come from the builder's own `publishBlockers`, which is the same
        list the server enforces — so this cannot invite someone to publish something the API
        would refuse.
      */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-blue/20 bg-blue-50/50 p-6">
        <div>
          <h4 className="text-base font-bold text-brand-dark">
            {isDraft ? 'Ready to go live?' : 'Your profile is live'}
          </h4>
          <p className="mt-0.5 text-xs text-gray-600">
            {canPublish
              ? isDraft
                ? 'Everything required is answered.'
                : `Currently ${current}. Change it above at any time.`
              : `${publishBlockers.length} still needed: ${publishBlockers.join(', ')}.`}
          </p>
        </div>

        {isDraft && (
          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            disabled={busy || !canPublish}
            onClick={() =>
              change({ status: CANDIDATE_VISIBILITY.DISCOVERABLE }, 'Your profile is now live.')
            }
          >
            Publish Profile <Icon name="rocket" className="text-xs" />
          </Button>
        )}
      </div>
    </div>
  );
}
