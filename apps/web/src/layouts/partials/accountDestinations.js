import { PATHS, buildPath } from '@/router/paths';

/**
 * Everywhere a signed-in account can go from the navbar.
 *
 * One list, two surfaces. The avatar menu (desktop) and the mobile drawer render the same
 * destinations, because they answer the same question — "where can I go from here?" — and a person
 * who rotates their phone should not gain or lose the ability to sign out. Keeping the list here
 * rather than inside either component is what stops one of them being updated and the other not.
 *
 * Items appear only when the capability behind them exists (ADR-001): an account with no candidate
 * profile has no profile to open, and one in no company has no workspace. A link to either would be
 * a guaranteed bounce off a route guard.
 *
 * @param {{ hasCandidateProfile?: boolean, companies?: Array<{slug: string, name: string}> }} capabilities
 * @returns {Array<{ group: string, items: Array<{ to: string, label: string }> }>}
 */
export function accountDestinations(capabilities) {
  const companies = capabilities?.companies ?? [];
  const groups = [];

  groups.push({
    group: 'account',
    items: [{ to: PATHS.APP_HOME, label: 'Home' }],
  });

  if (capabilities?.hasCandidateProfile) {
    groups.push({
      group: 'candidate',
      items: [
        { to: PATHS.CANDIDATE_HOME, label: 'Your candidate profile' },
        { to: PATHS.CANDIDATE_MESSAGES, label: 'Messages' },
      ],
    });
  }

  if (companies.length > 0) {
    groups.push({
      group: 'companies',
      label: 'Your companies',
      // Four is the menu's limit, not the account's — the full list lives on HOME-01.
      items: companies.slice(0, 4).map((company) => ({
        to: buildPath(PATHS.COMPANY_HOME, { companySlug: company.slug }),
        label: company.name,
      })),
    });
  }

  groups.push({
    group: 'settings',
    items: [{ to: PATHS.ACCOUNT_SETTINGS, label: 'Account settings' }],
  });

  return groups;
}
