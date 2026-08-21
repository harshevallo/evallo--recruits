import { useEffect, useState } from 'react';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  PortfolioHero,
  PortfolioBody,
  PortfolioNav,
} from '@/features/candidate/portfolio/PortfolioDocument';
import { fetchProfilePreview, publishProfile } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-03 — profile preview, publish, and what stays private (PRD §8.2, §8.8).
 *
 * Shows the **exact** recruiter rendering, produced by the same server-side projection a recruiter
 * reads (`toRecruiterView` + `loadPortfolio`) and drawn by the same component tree the share link
 * uses. PRD §8.8 requires the preview to match the real thing including its privacy state, so
 * anything withheld is drawn as a labelled indicator rather than silently omitted — otherwise a
 * candidate could not tell what a company actually sees.
 *
 * The split with `/me/portfolio` is deliberate and is the whole reason both exist:
 *
 *   PREVIEW (here)  an INSPECTION. Publish controls, withheld-field indicators, and empty sections
 *                   drawn rather than hidden, because a gap here is the thing to act on.
 *   PORTFOLIO       the ARTEFACT. Empty sections hidden, share controls foregrounded.
 *
 * One endpoint, one renderer, two framings. Nothing is duplicated.
 */

const STATE_BADGE = {
  [CANDIDATE_VISIBILITY.DRAFT]: { label: 'Draft', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.PRIVATE]: { label: 'Private', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.DISCOVERABLE]: { label: 'Discoverable', tone: 'successLight' },
  [CANDIDATE_VISIBILITY.PAUSED]: { label: 'Paused', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.ARCHIVED]: { label: 'Archived', tone: 'neutral' },
};

export function ProfilePreviewPage() {
  const [state, setState] = useState({ status: 'loading' });
  const [publishState, setPublishState] = useState({ busy: false, message: null, tone: 'success' });

  useEffect(() => {
    const controller = new AbortController();

    fetchProfilePreview({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, []);

  async function handlePublish(status) {
    setPublishState({ busy: true, message: null, tone: 'success' });
    try {
      const data = await publishProfile(status);
      setState({ status: 'ready', ...data });
      setPublishState({
        busy: false,
        tone: 'success',
        message:
          status === 'private'
            ? 'Published privately. You can share it with a company by expressing interest, or with anyone through a share link.'
            : 'Published. Recruiters can now find you in search.',
      });
    } catch (error) {
      setPublishState({
        busy: false,
        tone: 'error',
        message: error.details?.publish ?? error.message ?? 'We could not publish your profile.',
      });
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-24 sm:py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your preview…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-24 sm:py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load your preview.'}</StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  const { profile, privateFields, publish } = state;
  const badge = STATE_BADGE[profile.header.status] ?? STATE_BADGE[CANDIDATE_VISIBILITY.DRAFT];

  return (
    <Container className="py-24 sm:py-32">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Publish &amp; privacy</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            Exactly what a recruiter sees, including what stays private. Empty sections are shown
            here so you can tell a gap from a choice.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button
            to={PATHS.CANDIDATE_PORTFOLIO}
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            Portfolio &amp; sharing
          </Button>
          <Button to={PATHS.CANDIDATE_PROFILE_BUILDER} variant="primary" size="md" radius="lg">
            Edit profile
          </Button>
        </div>
      </header>

      {publishState.message && (
        <StatusRegion tone={publishState.tone} className="mb-6">
          {publishState.message}
        </StatusRegion>
      )}

      {/* Publish controls — PRD §8.2 CAN-03. */}
      <section
        aria-labelledby="publish-heading"
        className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="publish-heading" className="text-lg font-bold text-brand-dark">
          {publish.isPublished ? 'Your profile is published' : 'Publish your profile'}
        </h2>

        {publish.canPublish ? (
          <p className="mt-2 text-sm text-gray-600">
            {publish.isPublished
              ? 'You can change who can find you at any time in visibility settings.'
              : 'Choose how you want to be found. You can change this later.'}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Still needed before you can publish: {publish.blockers.join(', ')}.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="md"
            radius="lg"
            disabled={!publish.canPublish || publishState.busy}
            onClick={() => handlePublish('discoverable')}
          >
            {publish.isPublished ? 'Make discoverable' : 'Publish and be discoverable'}
          </Button>
          <Button
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            disabled={!publish.canPublish || publishState.busy}
            onClick={() => handlePublish('private')}
          >
            Publish privately
          </Button>
          {!publish.canPublish && (
            <Button
              to={PATHS.CANDIDATE_PROFILE_BUILDER}
              variant="link"
              size="none"
              radius="none"
              className="self-center text-sm font-medium"
            >
              Finish your profile
              <Icon name="arrow-right" className="text-xs" />
            </Button>
          )}
        </div>
      </section>

      {privateFields.length > 0 && (
        <section
          aria-labelledby="private-heading"
          className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="private-heading" className="mb-3 text-lg font-bold text-brand-dark">
            Not shown to anyone else
          </h2>
          <ul className="space-y-3">
            {privateFields.map((field) => (
              <li key={field.field} className="flex items-start gap-3">
                <Icon name="shield-halved" className="mt-0.5 shrink-0 text-sm text-gray-400" />
                <span>
                  <span className="block text-sm font-medium text-brand-dark">{field.label}</span>
                  <span className="block text-sm text-gray-600">{field.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Recruiter view
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        {/*
          `showEmpty` on both the rail and the document, and they must agree — a rail entry that
          scrolls to a heading the document chose not to render is a broken link that looks like a
          bug in the browser.
        */}
        <PortfolioNav profile={profile} showEmpty />

        <div className="min-w-0 space-y-6">
          <PortfolioHero
            header={profile.header}
            statusSlot={
              <Badge tone={badge.tone} size="sm" radius="full">
                {badge.label}
              </Badge>
            }
          />
          <PortfolioBody profile={profile} showEmpty />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          to={PATHS.CANDIDATE_VISIBILITY}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          Manage visibility
        </Button>
      </div>
    </Container>
  );
}
