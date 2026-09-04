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
/*
 * ── Three groups, not ten flat links ──────────────────────────────────────────────────────────
 *
 * `WorkspaceSidebar` has supported `{ group, label, items }` all along — the candidate rail uses
 * it — but this one passed a flat array of ten, so every destination carried identical weight and
 * the eye had to read all ten to find any one. The groups say what kind of work each is:
 *
 *   (unlabelled)  the two entry points — the job you came to do, and the state of things
 *   Candidates    people: who is interested, who you are talking to, who is in flight
 *   Company       your organisation's presence and its admin
 *
 * Find candidates stays FIRST, ahead of Overview, for the reason it always has: it is the job a
 * recruiter opens this workspace to do, and it is the one that works on day one with an empty
 * account. Overview is a dashboard about work already in flight.
 */
const LABEL = 'Company';

const ITEMS = [
  {
    group: 'work',
    label: null,
    items: [
      {
        key: 'search',
        label: 'Find candidates',
        icon: 'magnifying-glass',
        path: PATHS.COMPANY_SEARCH,
        permission: PERMISSIONS.CANDIDATE_SEARCH,
      },
      {
        key: 'home',
        label: 'Overview',
        /*
         * Was `building`. That is the organisation symbol everywhere else in this product — the
         * company profile's meta row, the candidate rail's "Search for Companies" — so spending it
         * on a dashboard both mislabelled this and left the actual company items without it.
         * `chart-line` is what the candidate rail already uses for its equivalent screen.
         */
        icon: 'chart-line',
        path: PATHS.COMPANY_HOME,
        permission: null,
        end: true,
      },
    ],
  },
  {
    group: 'candidates',
    label: 'Candidates',
    items: [
      {
        /*
         * REC-20, first in the group: it is the output of "Find candidates" directly above it in
         * the rail, and the shallowest commitment — so the group now reads in ascending order,
         * saved → interested → talking → in process → hired.
         *
         * `star`, not `rocket`. Icon.jsx sets the rule: star is a private bookmark that tells the
         * other party nothing, rocket is a reach-out. Saving a candidate is silent (PRD §21.4),
         * so it is a star — the same mark the candidate side uses for "Saved companies".
         */
        key: 'saved',
        label: 'Saved candidates',
        icon: 'star',
        path: PATHS.COMPANY_SAVED,
        permission: PERMISSIONS.CANDIDATE_VIEW,
      },
      {
        key: 'interests',
        label: 'Interest inbox',
        /* The same rocket the candidate sees on "Shortlisted companies" — one act, one symbol. */
        icon: 'rocket',
        path: PATHS.COMPANY_INTERESTS,
        permission: PERMISSIONS.INTEREST_VIEW,
      },
      {
        key: 'messages',
        label: 'Messages',
        icon: 'comments',
        path: PATHS.COMPANY_MESSAGES,
        permission: PERMISSIONS.CANDIDATE_VIEW,
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
         * Immediately after Pipeline, because that is where the workflow ends. The board answers
         * "what needs work?" and correctly drops a hired candidate the moment they stop being
         * work, which left the hire itself reachable only through a "Show closed" checkbox.
         */
        key: 'hires',
        label: 'Hires',
        icon: 'circle-check',
        path: PATHS.COMPANY_HIRES,
        permission: PERMISSIONS.PIPELINE_VIEW,
      },
    ],
  },
  {
    group: 'company',
    label: 'Company',
    items: [
      {
        key: 'hiring',
        /*
         * Was "Hiring" — three rows from "Hires", one letter apart, meaning something entirely
         * different: this is where you declare what you are hiring FOR, that is who you took on.
         * "Open roles" is the product's own word for these objects on the public company profile,
         * where the same records render under exactly that heading, so nothing new is implied —
         * in particular not job postings, which PRD §7.5 and ADR-016 keep out of scope.
         */
        label: 'Open roles',
        icon: 'briefcase',
        path: PATHS.COMPANY_HIRING,
        permission: null,
      },
      {
        key: 'page',
        /*
         * "Company page" behind an EYE icon read as "look at our public page", and went to the
         * editor. The label now names the destination and the icon agrees with it; the public
         * rendering is still one click away, inside, as the preview.
         */
        label: 'Edit company page',
        icon: 'pen',
        path: PATHS.COMPANY_EDIT,
        permission: PERMISSIONS.COMPANY_EDIT,
      },
      {
        key: 'team',
        label: 'Team',
        icon: 'user',
        path: PATHS.COMPANY_TEAM,
        permission: PERMISSIONS.MEMBER_MANAGE,
      },
      {
        key: 'settings',
        label: 'Settings',
        icon: 'gear',
        path: PATHS.COMPANY_SETTINGS,
        permission: PERMISSIONS.COMPANY_SETTINGS,
      },
    ],
  },
];

export function CompanyWorkspaceLayout() {
  const { expanded, toggle } = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { companySlug } = useParams();
  const { can, activeCompany } = useCompany();

  const items = ITEMS.map((group) => ({
    group: group.group,
    label: group.label,
    items: group.items
      .filter((item) => !item.permission || can(item.permission))
      .map((item) => ({
        to: buildPath(item.path, { companySlug }),
        label: item.label,
        icon: item.icon,
        end: item.end,
      })),
  })).filter((group) => group.items.length > 0);

  /*
   * Which company am I acting for?
   *
   * The rail header said the literal word "Company". Someone who belongs to three of them saw the
   * same rail in all three, and the only place the name appeared was the Overview <h1> — so on
   * every other screen there was nothing on the page identifying whose workspace it was. The name
   * is small and grey in the rail header: present on every screen, dominant on none. It falls back
   * to the generic word while capabilities are still loading.
   */
  const railLabel = activeCompany?.name ?? LABEL;

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
        label={railLabel}
        items={items}
        expanded={expanded}
        onToggle={toggle}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-24 md:hidden">
          <SidebarTrigger onOpen={() => setMobileOpen(true)} label={railLabel} />
        </div>
        <Suspense fallback={<RouteFallback className="py-24" />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
