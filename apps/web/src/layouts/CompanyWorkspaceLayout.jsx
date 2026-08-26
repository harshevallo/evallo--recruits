import { Suspense, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';
import { PERMISSIONS } from '@evallo/shared';
import {
  WorkspaceSidebar,
  SidebarTrigger,
  useSidebarState,
} from './partials/WorkspaceSidebar';
import { useCompany } from '@/context/CompanyContext';
import { PATHS, buildPath } from '@/router/paths';

/**
 * Navigation for the company workspace (REC-10…19, TRD §4.1).
 *
 * A collapsible left rail, so every REC screen carries the same navigation and nothing is reachable
 * only from the dashboard.
 *
 * `permission: null` means every active member may open it. Otherwise the item appears only when the
 * caller holds the permission the API enforces on that route — mirroring the server rather than
 * guessing, so the nav can never offer a link that returns 403.
 */
const LABEL = 'Company';

const ITEMS = [
  { key: 'home', label: 'Overview', icon: 'building', path: PATHS.COMPANY_HOME, permission: null, end: true },
  {
    key: 'interests',
    label: 'Interest inbox',
    icon: 'heart',
    path: PATHS.COMPANY_INTERESTS,
    permission: PERMISSIONS.INTEREST_VIEW,
  },
  {
    key: 'search',
    label: 'Find candidates',
    icon: 'magnifying-glass',
    path: PATHS.COMPANY_SEARCH,
    permission: PERMISSIONS.CANDIDATE_SEARCH,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: 'layer-group',
    path: PATHS.COMPANY_PIPELINE,
    permission: PERMISSIONS.PIPELINE_VIEW,
  },
  {
    /*
     * Immediately after Pipeline, because that is where the workflow ends. The board answers "what
     * needs work?" and correctly drops a hired candidate the moment they stop being work — which
     * left the hire itself reachable only through a "Show closed" checkbox. This is the record.
     */
    key: 'hires',
    label: 'Hires',
    icon: 'circle-check',
    path: PATHS.COMPANY_HIRES,
    permission: PERMISSIONS.PIPELINE_VIEW,
  },
  {
    key: 'messages',
    label: 'Messages',
    icon: 'comments',
    path: PATHS.COMPANY_MESSAGES,
    permission: PERMISSIONS.CANDIDATE_VIEW,
  },
  {
    key: 'hiring',
    label: 'Hiring',
    icon: 'briefcase',
    path: PATHS.COMPANY_HIRING,
    permission: null,
  },
  {
    key: 'team',
    label: 'Team',
    icon: 'user',
    path: PATHS.COMPANY_TEAM,
    permission: PERMISSIONS.MEMBER_MANAGE,
  },
  {
    key: 'page',
    label: 'Company page',
    icon: 'eye',
    /* The editor, not the preview — preview is one click from inside it. */
    path: PATHS.COMPANY_EDIT,
    permission: PERMISSIONS.COMPANY_EDIT,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'gear',
    path: PATHS.COMPANY_SETTINGS,
    permission: PERMISSIONS.COMPANY_SETTINGS,
  },
];

export function CompanyWorkspaceLayout() {
  const { expanded, toggle } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { companySlug } = useParams();
  const { can } = useCompany();

  const items = ITEMS.filter((item) => !item.permission || can(item.permission)).map((item) => ({
    to: buildPath(item.path, { companySlug }),
    label: item.label,
    icon: item.icon,
    end: item.end,
  }));

  /*
   * A flex ROW: rail then content, with the rail sticky inside it — in normal flow as a real
   * column, so it cannot overlap whatever follows the row.
   *
   * `min-h-screen` is load-bearing, not cosmetic. The rail clears the fixed navbar via
   * `sticky top-20`, and a sticky box can only be pushed down while its containing block still has
   * room: on a short page (Messages sizes itself to the viewport) the row was not tall enough to
   * absorb the 80px offset, so the rail clamped back to y=0 and the navbar covered its collapse
   * toggle — the control became genuinely unclickable. One viewport of height guarantees
   * `80px + rail height` always fits.
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
        <Suspense fallback={<RouteFallback className="py-24" />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
