import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CANDIDATE_VISIBILITY, CONTACT_VISIBILITY } from '@evallo/shared';
import { Badge, Button, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { fetchVisibility, unblockCompany } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * SET-01 → Privacy.
 *
 * This page REPORTS candidate privacy and links to where it is changed; it does not re-implement it.
 *
 * PRD §16.1 requires one authority for who may see a candidate. That authority is CAN-04 and
 * `candidateAccess.service` behind it. A second set of controls here would be a second source of
 * truth for the same question, and the two would eventually disagree — which on a privacy surface
 * means showing someone as private while the search still returns them. So: read the same endpoint,
 * show the current state, and send the person to the screen that owns it.
 *
 * Blocked companies ARE actioned here, because unblocking is a single reversible act on a list this
 * page already has to display, and it goes through the same CAN-04 endpoint.
 */

const STATUS_COPY = {
  [CANDIDATE_VISIBILITY.DISCOVERABLE]: {
    label: 'Discoverable',
    detail: 'Companies can find you in candidate search.',
    tone: 'successLight',
  },
  [CANDIDATE_VISIBILITY.PRIVATE]: {
    label: 'Private',
    detail: 'Hidden from search. Only companies you approach can see you.',
    tone: 'neutral',
  },
  [CANDIDATE_VISIBILITY.PAUSED]: {
    label: 'Paused',
    detail: 'Out of new searches. Companies you already share with keep access.',
    tone: 'neutral',
  },
  [CANDIDATE_VISIBILITY.DRAFT]: {
    label: 'Draft',
    detail: 'Not published. No company can see your profile.',
    tone: 'neutral',
  },
};

const CONTACT_COPY = {
  [CONTACT_VISIBILITY.HIDDEN]: 'Hidden — companies must message you through the platform first.',
  [CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS]:
    'Shared with companies you have given access to.',
};

export function SettingsPrivacyPage() {
  const { capabilities } = useAuth();
  const hasProfile = Boolean(capabilities?.hasCandidateProfile);

  const [state, setState] = useState({ status: hasProfile ? 'loading' : 'no-profile' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!hasProfile) return undefined;

    const controller = new AbortController();
    fetchVisibility({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });
    return () => controller.abort();
  }, [hasProfile]);

  async function unblock(company) {
    setBusy(true);
    try {
      const data = await unblockCompany(company.id);
      setState((current) => ({ ...current, ...data }));
      setFeedback({ tone: 'success', text: `${company.name} can contact you again.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not unblock that company.' });
    } finally {
      setBusy(false);
    }
  }

  const visibility = state.visibility ?? {};
  const status = visibility.status ?? state.status;
  const statusCopy = STATUS_COPY[status];
  const blocked = visibility.blockedCompanies ?? state.blockedCompanies ?? [];

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Privacy</h1>
        <p className="mt-2 text-gray-600">
          Who can discover you, what they can contact you with, and which companies you have blocked.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {state.status === 'no-profile' && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-sm font-semibold text-brand-dark">No candidate profile yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-600">
            Discoverability and contact rules belong to a candidate profile. Create one and these
            controls become available.
          </p>
          <Button
            to={PATHS.APP_HOME}
            variant="primary"
            size="sm"
            radius="lg"
            className="mt-4"
          >
            Go to your home
          </Button>
        </div>
      )}

      {state.status === 'loading' && <Skeleton className="h-56 w-full rounded-2xl" />}

      {state.status === 'error' && (
        <StatusRegion tone="error">{state.message ?? 'We could not load this.'}</StatusRegion>
      )}

      {state.status === 'ready' && (
        <>
          <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand-dark">Profile discoverability</h2>
            <p className="mt-1 text-sm text-gray-600">
              Set in one place, so this page and candidate search can never disagree.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-slate-50/60 p-4">
              <div>
                <Badge tone={statusCopy?.tone ?? 'neutral'} size="sm" radius="full">
                  {statusCopy?.label ?? status}
                </Badge>
                <p className="mt-2 text-sm text-gray-700">{statusCopy?.detail}</p>
              </div>
              <Button
                to={PATHS.CANDIDATE_VISIBILITY}
                variant="outlineDark"
                size="sm"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Change
              </Button>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand-dark">Contact information</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-slate-50/60 p-4">
              <p className="text-sm text-gray-700">
                {CONTACT_COPY[visibility.contactVisibility ?? state.contactVisibility] ??
                  'Managed in your visibility settings.'}
              </p>
              <Button
                to={PATHS.CANDIDATE_VISIBILITY}
                variant="outlineDark"
                size="sm"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Change
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-brand-dark">Blocked companies</h2>
            <p className="mt-1 text-sm text-gray-600">
              A blocked company cannot find you, message you, or see your profile.
            </p>

            {blocked.length === 0 ? (
              <p className="mt-5 text-sm text-gray-500">You have not blocked any companies.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {blocked.map((company) => (
                  <li
                    key={company.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon name="lock" className="flex-none text-gray-400" />
                      <p className="truncate text-sm font-semibold text-brand-dark">
                        {company.name}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outlineDark"
                      size="sm"
                      radius="lg"
                      className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                      disabled={busy}
                      onClick={() => unblock(company)}
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-6 text-xs text-gray-500">
            <Link to={PATHS.PRIVACY} className="font-semibold text-brand-blue hover:underline">
              How we handle your data
            </Link>{' '}
            explains what we store and why.
          </p>
        </>
      )}
    </>
  );
}
