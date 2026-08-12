import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, BackLink, Button, Container } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchVisibility, updateVisibility, unblockCompany } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-04 — visibility settings (PRD §4.3, §8.2).
 *
 * Four states and a contact rule, each spelled out in terms of what a company can actually do.
 * The state names alone ("private", "paused") do not tell a candidate whether they are findable
 * today, and this is a consent decision — so the consequence is the label, not a footnote.
 */
const STATUS_OPTIONS = [
  {
    value: 'draft',
    title: 'Draft',
    detail: 'Only you can see it. Not in search, and it cannot be shared with a company.',
  },
  {
    value: 'private',
    title: 'Private',
    detail:
      'Not in recruiter search. You can still share it with a specific company by expressing interest.',
  },
  {
    value: 'discoverable',
    title: 'Discoverable',
    detail:
      'Authorised recruiters at published companies can find you in search, subject to your contact rule.',
  },
  {
    value: 'paused',
    title: 'Paused',
    detail:
      'Hidden from new searches. Companies you have already shared with keep the access you granted.',
  },
];

const CONTACT_OPTIONS = [
  { value: 'hidden', title: 'Hidden', detail: 'Companies reply through Evallo Recruit only.' },
  {
    value: 'authorized_recruiters',
    title: 'Authorised recruiters',
    detail: 'Recruiters at published companies can see your email.',
  },
  {
    value: 'after_interest',
    title: 'After I express interest',
    detail: 'Only companies you have contacted can see it.',
  },
  {
    value: 'on_request',
    title: 'On request',
    detail: 'Shared only when you approve a request.',
  },
];

export function VisibilitySettingsPage() {
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

  async function change(changes, successMessage) {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await updateVisibility(changes);
      setState((current) => ({ ...current, ...data }));
      setFeedback({ tone: 'success', text: successMessage });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error.details?.status ??
          error.details?.contactVisibility ??
          error.message ??
          'We could not save that.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(companyId, name) {
    setBusy(true);
    try {
      const blockedCompanies = await unblockCompany(companyId);
      setState((current) => ({ ...current, blockedCompanies }));
      setFeedback({ tone: 'success', text: `${name} is no longer blocked.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not unblock that company.' });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your visibility settings…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-80 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load your settings.'}</StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  const { visibility, blockedCompanies, publishBlockers } = state;
  const locked = publishBlockers.length > 0;

  return (
    <Container className="py-32">
      {/* Back to the candidate home, at the top — the same affordance the company pages use. */}
      <BackLink to={PATHS.CANDIDATE_HOME} label="Candidate home" className="mb-6" />

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Visibility</h1>
        <p className="mt-2 max-w-xl text-gray-600">
          You decide who can find you and how they can reach you. These rules apply whatever role a
          recruiter holds at their company.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {locked && (
        <StatusRegion tone="info" className="mb-6">
          Your profile is still a draft. Finish it before you can be found: {publishBlockers.join(', ')}.
        </StatusRegion>
      )}

      <section
        aria-labelledby="discoverability-heading"
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="discoverability-heading" className="mb-1 text-lg font-bold text-brand-dark">
          Who can find you
        </h2>
        <p className="mb-5 text-sm text-gray-600">Choose one.</p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Profile visibility</legend>
          {STATUS_OPTIONS.map((option) => {
            const disabled = busy || (locked && option.value !== 'draft');
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                  visibility.status === option.value
                    ? 'border-brand-blue bg-blue-50/60'
                    : 'border-gray-200 hover:border-gray-300'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="visibility-status"
                  value={option.value}
                  checked={visibility.status === option.value}
                  disabled={disabled}
                  onChange={() => change({ status: option.value }, `Visibility set to ${option.title.toLowerCase()}.`)}
                  className="mt-1 h-4 w-4 text-brand-blue focus:ring-brand-blue"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-brand-dark">{option.title}</span>
                  <span className="block text-sm text-gray-600">{option.detail}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      </section>

      <section
        aria-labelledby="contact-heading"
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="contact-heading" className="mb-1 text-lg font-bold text-brand-dark">
          Contact details
        </h2>
        <p className="mb-5 text-sm text-gray-600">
          A recruiter earns your contact details — holding a role is never enough on its own.
        </p>

        <fieldset className="space-y-3">
          <legend className="sr-only">Contact visibility</legend>
          {CONTACT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                visibility.contactVisibility === option.value
                  ? 'border-brand-blue bg-blue-50/60'
                  : 'border-gray-200 hover:border-gray-300'
              } ${busy ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="contact-visibility"
                value={option.value}
                checked={visibility.contactVisibility === option.value}
                disabled={busy}
                onChange={() =>
                  change({ contactVisibility: option.value }, 'Contact rule updated.')
                }
                className="mt-1 h-4 w-4 text-brand-blue focus:ring-brand-blue"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-brand-dark">{option.title}</span>
                <span className="block text-sm text-gray-600">{option.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section
        aria-labelledby="blocked-heading"
        className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="blocked-heading" className="mb-1 text-lg font-bold text-brand-dark">
          Blocked companies
        </h2>
        <p className="mb-5 text-sm text-gray-600">
          A blocked company cannot see your profile at all, whatever your visibility setting.
        </p>

        {blockedCompanies.length === 0 ? (
          <p className="text-sm text-gray-600">
            You have not blocked anyone. Open a{' '}
            <Link to={PATHS.CANDIDATE_COMPANIES} className="font-medium underline">
              company page
            </Link>{' '}
            and choose Block.
          </p>
        ) : (
          <ul className="space-y-3">
            {blockedCompanies.map((company) => (
              <li
                key={company.companyId}
                className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
              >
                <Avatar
                  src={company.logoUrl}
                  initials={company.name.slice(0, 2).toUpperCase()}
                  size="sm"
                  shape="rounded"
                  tone="brand"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-dark">
                  {company.name}
                </span>
                <Button
                  variant="outlineDark"
                  size="sm"
                  radius="lg"
                  className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                  disabled={busy}
                  onClick={() => removeBlock(company.companyId, company.name)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

    </Container>
  );
}
