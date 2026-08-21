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
import { SharePanel } from '@/features/candidate/portfolio/SharePanel';
import { fetchProfilePreview } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * The candidate's own portfolio — the polished, shareable presentation of the profile they built.
 *
 * This is the "would I send this to someone" screen. It differs from the preview (CAN-03) on
 * purpose, and the split is what keeps each of them honest:
 *
 *   PREVIEW    an inspection. Publish controls, "what is withheld", empty sections drawn so the
 *              gaps are visible and actionable.
 *   PORTFOLIO  the artefact. Empty sections hidden, share controls foregrounded, nothing on the
 *              page that a reader would not also see except the share panel itself.
 *
 * Both read `GET /me/candidate-profile/preview`, which returns the server's one recruiter
 * projection. There is no second endpoint and no second renderer — the difference between the two
 * screens is entirely in what surrounds the document.
 */

/** How each visibility state reads to its owner, and whether it needs acting on. */
const STATE_BADGE = {
  [CANDIDATE_VISIBILITY.DRAFT]: { label: 'Draft', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.PRIVATE]: { label: 'Private', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.DISCOVERABLE]: { label: 'Discoverable', tone: 'successLight' },
  [CANDIDATE_VISIBILITY.PAUSED]: { label: 'Paused', tone: 'neutral' },
  [CANDIDATE_VISIBILITY.ARCHIVED]: { label: 'Archived', tone: 'neutral' },
};

export function PortfolioPage() {
  const [state, setState] = useState({ status: 'loading' });

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

  if (state.status === 'loading') {
    return (
      <Container className="py-24 sm:py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your portfolio…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="mt-8 h-52 w-full rounded-2xl" />
          <Skeleton className="mt-6 h-80 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-24 sm:py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load your portfolio.'}
        </StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  const { profile, publish } = state;
  const badge = STATE_BADGE[profile.header.status] ?? STATE_BADGE[CANDIDATE_VISIBILITY.DRAFT];
  const isDraft = profile.header.status === CANDIDATE_VISIBILITY.DRAFT;

  return (
    <Container className="py-24 sm:py-32">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Your portfolio</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            How your profile reads to a recruiter or anyone you send the link to. To change what is
            here, edit your profile.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Button
            to={PATHS.CANDIDATE_PROFILE_PREVIEW}
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            Publish &amp; privacy
          </Button>
          <Button to={PATHS.CANDIDATE_PROFILE_BUILDER} variant="primary" size="md" radius="lg">
            Edit profile
          </Button>
        </div>
      </header>

      {/*
        A draft portfolio can be looked at but not sent. Saying so at the top — with the one
        action that fixes it — beats letting someone polish a document nobody can open.
      */}
      {isDraft && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2.5 text-sm text-amber-900">
            <Icon name="shield-halved" className="mt-0.5 flex-none text-xs" />
            <span>
              This portfolio is a draft. You can read it and edit it, but no one else can open it —
              including anyone with a share link.
            </span>
          </p>
          <Button
            to={PATHS.CANDIDATE_PROFILE_PREVIEW}
            variant="primary"
            size="sm"
            radius="lg"
            className="shrink-0"
          >
            {publish?.canPublish ? 'Publish it' : 'See what is missing'}
          </Button>
        </div>
      )}

      <SharePanel className="mb-8" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        <PortfolioNav profile={profile} />

        <div className="min-w-0 space-y-6">
          <PortfolioHero
            header={profile.header}
            statusSlot={
              <Badge tone={badge.tone} size="sm" radius="full">
                {badge.label}
              </Badge>
            }
          />
          {/*
            `showEmpty` is false here on purpose. This screen answers "is this worth sending", and
            twelve headings over four filled sections reads as an unfinished form. The preview is
            where the gaps are drawn, because that is the screen about finishing.
          */}
          <PortfolioBody profile={profile} showEmpty={false} />
        </div>
      </div>
    </Container>
  );
}
