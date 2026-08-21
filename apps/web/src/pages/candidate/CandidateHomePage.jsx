import { useEffect, useState } from 'react';
import { BackLink, Badge, Button, Container } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { ProfileCompletenessCard } from '@/features/candidate/components/ProfileCompletenessCard';
import { VisibilityCard } from '@/features/candidate/components/VisibilityCard';
import { NextStepsCard } from '@/features/candidate/components/NextStepsCard';
import { OpportunitiesCard } from '@/features/candidate/components/OpportunitiesCard';
import { ActivityCard } from '@/features/candidate/components/ActivityCard';
import { useAuth } from '@/context/AuthContext';
import { fetchCandidateHome } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-01 — Candidate home: "profile and opportunity overview" (PRD Appendix A).
 *
 * PRD §8.2 asks for exactly five things: completeness, visibility, profile views where policy
 * allows, new messages, company recommendations, and pending actions.
 *
 * It is an **overview, not an editor**. Nothing here writes to the profile — CAN-02 owns editing
 * and CAN-04 owns visibility. Reaching this screen at all requires the candidate capability,
 * which exists because a CandidateProfile does (ADR-001); this page neither grants nor creates it.
 */
export function CandidateHomePage() {
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    fetchCandidateHome({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your candidate home…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load your candidate profile.'}
        </StatusRegion>
        <Button to={PATHS.APP_HOME} variant="primary" size="md" className="mt-6">
          Back to home
        </Button>
      </Container>
    );
  }

  const { profile, completeness, nextSteps } = state;

  return (
    <Container className="py-32">
      {/*
        Back to the account home, at the top — the same affordance SET-01 uses.

        The three pills that used to sit at the FOOT of this page (Companies, My interests, Messages)
        were verbatim copies of candidate rail items. Repeating the rail under the page made the app
        look like it had two navigations, and it pushed the only non-rail destination — the account
        home — to the very bottom where nothing else lives. The rail owns navigation; this owns the
        one step up out of the candidate context.
      */}
      <BackLink to={PATHS.APP_HOME} label="Home" className="mb-6" />

      <header className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-brand-dark">
              Your candidate profile
            </h1>
            <Badge tone="neutral" size="sm" radius="full">
              Personal
            </Badge>
          </div>
          <p className="max-w-xl text-gray-600">
            {profile.headline ||
              `${user?.name ? `${user.name}, y` : 'Y'}ou have not written a headline yet — it is the first thing a recruiter reads.`}
          </p>
        </div>

        {/*
          Persistent actions for the candidate context (PRD §5.2).

          "Portfolio" rather than "Preview": from home, the useful second action is seeing — and
          sending — the finished thing. The publish and privacy controls are one step further in,
          on the screen that owns them, because they are decisions rather than daily actions.
        */}
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button to={PATHS.CANDIDATE_PORTFOLIO} variant="outlineDark" size="md" radius="lg" className="!border-gray-300 !text-brand-dark hover:!bg-gray-50">
            Portfolio
          </Button>
          <Button to={PATHS.CANDIDATE_PROFILE_BUILDER} variant="primary" size="md" radius="lg">
            {completeness.percent === 100 ? 'Edit profile' : 'Continue profile'}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <ProfileCompletenessCard completeness={completeness} />
          <VisibilityCard profile={profile} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <NextStepsCard steps={nextSteps} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <OpportunitiesCard />
            <ActivityCard />
          </div>
        </div>
      </div>
    </Container>
  );
}
