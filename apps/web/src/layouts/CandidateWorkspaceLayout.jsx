import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  WorkspaceSidebar,
  SidebarTrigger,
  useSidebarState,
} from './partials/WorkspaceSidebar';
import { PATHS } from '@/router/paths';

/**
 * Navigation for the candidate's own surface (CAN-01…09, TRD §4.1).
 *
 * No permission filtering: this is the person's own data, and reaching it needs nothing beyond being
 * signed in with a candidate profile — which `RequireCandidate` has already established.
 *
 * CAN-10 (assessments) and CAN-11 (saved companies) are deliberately absent: the tracker records
 * them as Phase 2 and not-built, and a nav item pointing at a screen that does not exist is exactly
 * the dead link this bar was added to remove.
 */
const LABEL = 'Your profile';

const ITEMS = [
  { to: PATHS.CANDIDATE_HOME, label: 'Overview', icon: 'user', end: true },
  { to: PATHS.CANDIDATE_PROFILE_BUILDER, label: 'Profile builder', icon: 'user-pen' },
  { to: PATHS.CANDIDATE_PROFILE_PREVIEW, label: 'Preview', icon: 'eye' },
  { to: PATHS.CANDIDATE_VISIBILITY, label: 'Visibility', icon: 'shield-halved' },
  { to: PATHS.CANDIDATE_COMPANIES, label: 'Companies', icon: 'building' },
  { to: PATHS.CANDIDATE_INTERESTS, label: 'My interests', icon: 'heart' },
  { to: PATHS.CANDIDATE_MESSAGES, label: 'Messages', icon: 'comments' },
];

export function CandidateWorkspaceLayout() {
  const { expanded, toggle } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = ITEMS;

  /*
   * A flex ROW: rail then content. The rail is sticky inside it, so the footer — which
   * MarketingLayout renders after this whole row — is never covered by it.
   *
   * `min-h-screen` keeps the same invariant as the company rail: a sticky box can only take its
   * `top-20` offset while its containing block has room for it, so a short page would otherwise
   * clamp the rail to y=0 and let the fixed navbar swallow its collapse toggle.
   */
  return (
    <div className="flex min-h-screen">
      <WorkspaceSidebar
        label={LABEL}
        items={items}
        expanded={expanded}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-24 md:hidden">
          <SidebarTrigger onOpen={() => setMobileOpen(true)} label={LABEL} />
        </div>
        <Outlet />
      </div>
    </div>
  );
}
