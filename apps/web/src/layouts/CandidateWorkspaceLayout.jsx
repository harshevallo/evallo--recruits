import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';
import {
  WorkspaceSidebar,
  SidebarTrigger,
  useSidebarState,
} from './partials/WorkspaceSidebar';
import { fetchConversations } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * Navigation for the candidate's own surface (CAN-01…11, TRD §4.1).
 *
 * No permission filtering: this is the person's own data, and reaching it needs nothing beyond
 * being signed in with a candidate profile — which `RequireCandidate` has already established.
 *
 * ── Why three groups and not one list ────────────────────────────────────────────────────────
 *
 * The rail used to be seven undifferentiated links under one heading, "Your profile". That is a
 * list of URLs, not an information architecture: "Visibility" and "Messages" sat at the same
 * weight, so a candidate scanning the rail had to read every label to find the one thing that
 * needed them today. It also mislabelled itself — five of the seven items were not the profile.
 *
 * The groups answer three different questions, and each item belongs to exactly one of them:
 *
 *   DAILY       "What needs me today?"      — changes without the candidate doing anything, so
 *                                              this is the group that carries badges.
 *   MY PROFILE  "How do I present myself?"  — changes only when they decide to change it.
 *   ACCOUNT     "How is my account set up?" — visited rarely, so it sits last and stays small.
 *
 * ── Profile vs Portfolio ─────────────────────────────────────────────────────────────────────
 *
 * Two entries under MY PROFILE, because they are two different jobs over one set of data:
 *
 *   Edit profile   the builder. Structured input, section by section (CAN-02).
 *   Portfolio      the artefact. How it reads to a reader, and where sharing lives.
 *   Publish & privacy   the preview plus the publish and visibility controls (CAN-03/04).
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────────────────────
 *
 * CAN-10 (assessments) is Phase 2 per PRD §20.3 and has no screen. Notifications, privacy and
 * security are real routes but live under `/settings`, which has its own sub-navigation — listing
 * all five here would duplicate that nav in the rail and give the ACCOUNT group more weight than
 * a rarely-visited area deserves. One entry points at the settings dashboard, which is where
 * those four already are.
 */
const LABEL = 'Candidate';

/**
 * The one count worth badging.
 *
 * `/me/conversations` is the only candidate endpoint that reports something the candidate has not
 * yet acted on: unread messages, and threads a company opened that they have neither accepted nor
 * declined (PRD §11.2). Both are answered on the Messages screen, so both feed one badge — the
 * number means "conversations wanting you", which is the unit a person acts in.
 *
 * There is deliberately no badge on Shortlisted companies. An interest moves through
 * recruiter-set states
 * (`viewed`, `contacted`, `progressed`) and none of them asks the candidate for anything, so a
 * count there would be activity theatre rather than a pending action. When a real candidate-side
 * interest action exists, it gets a badge; inventing one now would train people to ignore them.
 *
 * Failure is silent on purpose: a badge is an enhancement, and a rail that rendered no navigation
 * because a count did not load would be a far worse outcome than a missing number.
 */
function useMessagesBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    fetchConversations({ signal: controller.signal })
      .then((threads) => {
        if (cancelled) return;
        setCount(
          (threads ?? []).filter(
            (thread) => thread.unread > 0 || thread.state === 'pending',
          ).length,
        );
      })
      .catch(() => {
        /* No badge. The rail still works, which is the part that matters. */
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return count;
}

export function CandidateWorkspaceLayout() {
  const { expanded, toggle } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const messagesBadge = useMessagesBadge();

  const groups = [
    {
      group: 'daily',
      label: 'Daily',
      items: [
        { to: PATHS.CANDIDATE_HOME, label: 'Home', icon: 'user', end: true },
        { to: PATHS.CANDIDATE_COMPANIES, label: 'Discover companies', icon: 'compass' },
        { to: PATHS.CANDIDATE_INTERESTS, label: 'Shortlisted companies', icon: 'bookmark' },
        {
          to: PATHS.CANDIDATE_MESSAGES,
          label: 'Messages',
          icon: 'comments',
          badge: messagesBadge,
          badgeLabel: 'conversations need you',
        },
        { to: PATHS.CANDIDATE_SAVED, label: 'Saved companies', icon: 'star' },
      ],
    },
    {
      group: 'profile',
      label: 'My profile',
      items: [
        { to: PATHS.CANDIDATE_PORTFOLIO, label: 'Portfolio', icon: 'id-card' },
        { to: PATHS.CANDIDATE_PROFILE_BUILDER, label: 'Edit profile', icon: 'user-pen' },
        { to: PATHS.CANDIDATE_PROFILE_PREVIEW, label: 'Publish & privacy', icon: 'eye' },
        { to: PATHS.CANDIDATE_VISIBILITY, label: 'Visibility', icon: 'shield-halved' },
      ],
    },
    {
      group: 'account',
      label: 'Account',
      items: [{ to: PATHS.ACCOUNT_SETTINGS, label: 'Settings', icon: 'gear' }],
    },
  ];

  /*
   * A flex ROW: rail then content, with the rail sticky inside it.
   *
   * Sticky rather than fixed keeps the rail in normal flow as a real column beside the content, so
   * it cannot overlap whatever follows the row. (It originally had a footer to avoid; the
   * authenticated shell no longer renders one, but a rail in flow is still the correct shape — a
   * fixed rail would need the content to carry a matching offset.)
   *
   * `min-h-screen` keeps the same invariant as the company rail: a sticky box can only take its
   * `top-20` offset while its containing block has room for it, so a short page would otherwise
   * clamp the rail to y=0 and let the fixed navbar swallow its collapse toggle.
   */
  return (
    <div className="flex min-h-screen">
      <WorkspaceSidebar
        label={LABEL}
        items={groups}
        expanded={expanded}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-24 md:hidden">
          <SidebarTrigger
            onOpen={() => setMobileOpen(true)}
            label={LABEL}
            badge={messagesBadge}
          />
        </div>
        <Suspense fallback={<RouteFallback className="py-24" />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
