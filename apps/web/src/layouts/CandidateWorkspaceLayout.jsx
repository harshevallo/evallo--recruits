import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';
import {
  WorkspaceSidebar,
  SidebarTrigger,
  useSidebarState,
} from './partials/WorkspaceSidebar';
import { useConversationsBadge } from '@/features/messaging/useConversationsBadge';
import { PATHS } from '@/router/paths';

/**
 * Navigation for the candidate's own surface (CAN-01…11, TRD §4.1).
 *
 * No permission filtering: this is the person's own data, and reaching it needs nothing beyond
 * being signed in with a candidate profile — which `RequireCandidate` has already established.
 *
 * ── The rail is DAILY work only ──────────────────────────────────────────────────────────────
 *
 * It has been through three shapes. It started as seven undifferentiated links under one heading,
 * "Your profile" — a list of URLs, not an information architecture, and mislabelled besides, since
 * five of the seven were not the profile. Grouping it into DAILY / MY PROFILE / ACCOUNT fixed the
 * weighting but left profile management occupying half the rail.
 *
 * It is now the four things a job-seeker does on a normal day, and nothing else:
 *
 *   Search for Roles      find work — the reason to open the product
 *   Search for Companies  find who to work for
 *   Your Activity         what has happened since last time (CAN-01)
 *   Messages              the one item that changes without the candidate doing anything, so the
 *                         only one that carries a badge
 *
 * Shortlisted and Saved companies sit under those as the record of what the two searches produced.
 *
 * ── Where profile management went ────────────────────────────────────────────────────────────
 *
 * Into the account menu (`accountDestinations`), which the avatar and the mobile drawer already
 * share and which already carried Portfolio & sharing. Maintaining a profile is occasional work;
 * giving it equal billing with the job search made the rail read as though editing your CV were
 * the daily task. **No route was removed** — `/me/portfolio`, `/me/profile`, `/me/profile/preview`
 * and `/me/visibility` all still exist and are all still reachable, one click from any screen.
 *
 * CAN-10 (assessments) remains absent: Phase 2 per PRD §20.3, with no screen to point at.
 */
const LABEL = 'Candidate';

/*
 * The one count worth badging is unread messages — `useConversationsBadge`, shared with the company
 * rail because the inbox is the same one (ADR-025).
 *
 * There is deliberately no badge on Shortlisted companies. An interest moves through recruiter-set
 * states (`viewed`, `contacted`, `progressed`) and none of them asks the candidate for anything, so
 * a count there would be activity theatre rather than a pending action. When a real candidate-side
 * interest action exists, it gets a badge; inventing one now would train people to ignore them.
 */
export function CandidateWorkspaceLayout() {
  const { expanded, toggle } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const messagesBadge = useConversationsBadge();

  const groups = [
    {
      /*
       * The candidate's OWN profile, first.
       *
       * It had no presence in this rail at all — the only routes into it were the account dropdown
       * and two buttons on Your Activity. That put the one surface a candidate is here to build
       * behind a menu, while "Saved companies" sat in permanent view. These are the same four
       * destinations the dropdown already offers; nothing new is introduced, and the dropdown keeps
       * them so existing muscle memory still works.
       */
      group: 'profile',
      label: 'Your profile',
      items: [
        { to: PATHS.CANDIDATE_PORTFOLIO, label: 'Portfolio', icon: 'id-card' },
        { to: PATHS.CANDIDATE_PROFILE_BUILDER, label: 'Edit profile', icon: 'user-pen' },
        { to: PATHS.CANDIDATE_VISIBILITY, label: 'Who can see it', icon: 'shield-halved' },
      ],
    },
    {
      group: 'daily',
      label: 'Daily',
      items: [
        { to: PATHS.CANDIDATE_ROLES, label: 'Search for Roles', icon: 'briefcase' },
        { to: PATHS.CANDIDATE_COMPANIES, label: 'Search for Companies', icon: 'building' },
        /* CAN-01. "Your Activity" says what the screen is; "Home" only said where it sat. */
        { to: PATHS.CANDIDATE_HOME, label: 'Your Activity', icon: 'chart-line', end: true },
        {
          to: PATHS.CANDIDATE_MESSAGES,
          label: 'Messages',
          icon: 'comments',
          badge: messagesBadge,
          badgeLabel: 'unread messages',
        },
      ],
    },
    {
      /* What the two searches above produced — shortlisted is where you applied, saved is a bookmark. */
      group: 'lists',
      label: 'Your lists',
      items: [
        { to: PATHS.CANDIDATE_INTERESTS, label: 'Shortlisted companies', icon: 'rocket' },
        { to: PATHS.CANDIDATE_SAVED, label: 'Saved companies', icon: 'star' },
      ],
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
