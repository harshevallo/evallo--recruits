import { PATHS, buildPath } from '@/router/paths';

/**
 * Everywhere a signed-in account can go from the navbar — including which WORKSPACE it is in.
 *
 * One list, two surfaces. The avatar menu (desktop) and the mobile drawer render the same
 * destinations, because they answer the same question — "where can I go from here?" — and a person
 * who rotates their phone should not gain or lose the ability to sign out. Keeping the list here
 * rather than inside either component is what stops one of them being updated and the other not.
 *
 * ── Switching workspace ───────────────────────────────────────────────────────────────────────
 *
 * A user is not "a candidate" or "a recruiter". Under ADR-001 both are CAPABILITIES derived per
 * request from data — a `CandidateProfile` exists, or an active `CompanyMember` row does — and the
 * same person routinely has both. So there is no role to toggle and nothing to store: switching
 * workspace is **navigation**, exactly as switching company already is (TRD §4.1 keeps company
 * context in the path so links stay shareable and the server can verify it independently).
 *
 * That is why this returns links rather than a setter, and why no active-workspace state exists
 * anywhere in the client. The current workspace is READ from the path, the same way
 * `CompanyContext` reads the active company. Nothing to keep in sync, nothing to get stale, and
 * the browser's back button works across a switch.
 *
 * ── Authorization ─────────────────────────────────────────────────────────────────────────────
 *
 * Items appear only when the capability behind them exists. `capabilities` comes from the server,
 * which recomputes it every request, so a revoked membership disappears from this menu on the next
 * load. This is **presentation only** — it decides what is offered, never what is reachable.
 * `RequireCandidate` / `RequireCompany` guard the routes, and the API re-derives access on every
 * call regardless of either (ADR-006). Typing a company URL you do not belong to still fails.
 *
 * @param {{ hasCandidateProfile?: boolean, companies?: Array<{slug: string, name: string}> }} capabilities
 * @param {string} [pathname]  Current location, used only to mark which workspace is active.
 * @returns {Array<{ group: string, label?: string, items: Array<{ to: string, label: string, icon?: string, current?: boolean }> }>}
 */

/**
 * `/c/` — derived from the route template rather than written out.
 *
 * ADR-002 centralises paths because a mistyped route string is a runtime 404 no tool catches; that
 * applies to a prefix just as much as to a whole path.
 */
const COMPANY_PREFIX = PATHS.COMPANY_HOME.split(':')[0];

/** True when `pathname` is `base` itself or something nested under it — never a prefix match. */
function isUnder(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Which workspace the current URL is in: `'candidate'`, `'company:<slug>'`, or `null`.
 *
 * `null` for `/home` and `/settings`, which belong to the ACCOUNT rather than to either workspace.
 * Marking one of them as current there would be a lie, and a checkmark on a workspace you are not
 * in is worse than no checkmark at all.
 */
export function activeWorkspace(pathname = '') {
  if (isUnder(pathname, PATHS.CANDIDATE_HOME)) return 'candidate';

  if (pathname.startsWith(COMPANY_PREFIX)) {
    const slug = pathname.slice(COMPANY_PREFIX.length).split('/')[0];
    if (slug) return `company:${decodeURIComponent(slug)}`;
  }

  return null;
}

export function accountDestinations(capabilities, pathname = '') {
  const companies = capabilities?.companies ?? [];
  const hasCandidate = Boolean(capabilities?.hasCandidateProfile);
  const current = activeWorkspace(pathname);
  const groups = [];

  groups.push({
    group: 'account',
    items: [{ to: PATHS.APP_HOME, label: 'Home' }],
  });

  /*
   * The workspace switcher.
   *
   * Candidate first, then every company, each pointing at the workspace's existing home. No new
   * routes and no new dashboards — "switch to recruiter" is a link to `/c/<slug>`, which is the
   * same URL the company rail, HOME-01's context switcher and a shared link all use.
   */
  const workspaces = [];

  if (hasCandidate) {
    workspaces.push({
      to: PATHS.CANDIDATE_HOME,
      label: 'Candidate',
      icon: 'user',
      current: current === 'candidate',
    });
  }

  /*
   * Four is the MENU's limit, not the account's — the full list lives on HOME-01, and its context
   * switcher is unbounded. A fifth company here would push sign-out off a short phone screen.
   */
  for (const company of companies.slice(0, 4)) {
    workspaces.push({
      to: buildPath(PATHS.COMPANY_HOME, { companySlug: company.slug }),
      label: company.name,
      icon: 'building',
      current: current === `company:${company.slug}`,
    });
  }

  if (workspaces.length > 0) {
    /*
     * Counted BEFORE the create action below, which is a way to GET a second workspace rather than
     * being one. Labelling a menu "Switch workspace" when its only real entry is the one you are
     * already in would promise something that is not there.
     */
    const switchable = workspaces.length;

    /*
     * A dead end is worse than a missing option. A candidate with no company sees no Recruiter
     * entry — correct, because there is nothing to switch to and a link would bounce off
     * `RequireCompany` — but without this they would also have no idea why, or what to do about
     * it. REC-01 is an existing route, not an invented one.
     */
    if (companies.length === 0) {
      workspaces.push({
        to: PATHS.COMPANY_START,
        label: 'Create or join a company',
        icon: 'plus',
      });
    }

    groups.push({
      group: 'workspace',
      label: switchable > 1 ? 'Switch workspace' : 'Workspace',
      items: workspaces,
    });
  }

  /*
   * Candidate deep links, below the switcher rather than inside it. These are places within a
   * workspace, not workspaces — and on a phone this menu is the only account surface, so the two
   * a candidate reaches for away from their desk belong one tap deep.
   */
  if (hasCandidate) {
    groups.push({
      group: 'candidate',
      items: [
        { to: PATHS.CANDIDATE_PORTFOLIO, label: 'Portfolio & sharing' },
        { to: PATHS.CANDIDATE_MESSAGES, label: 'Messages' },
      ],
    });
  }

  groups.push({
    group: 'settings',
    items: [{ to: PATHS.ACCOUNT_SETTINGS, label: 'Account settings' }],
  });

  return groups;
}
