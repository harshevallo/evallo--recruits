import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { COMPANY_ROLE_LABELS, COMPANY_STATUS } from '@evallo/shared';
import { BackLink, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchCompanyDashboard } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-10 — company home (PRD §5.2, §7.2).
 *
 * Where a recruiter lands after switching company context. It answers one question — "what needs
 * me here?" — and routes into the screens that do the work; it owns no data and edits nothing.
 *
 * The server decides which sections this member may see, so this file renders what it is given
 * rather than testing roles itself. A section that is absent was withheld, and a count of `null`
 * means "not shown to you", which is not the same as zero.
 */

/** Where each pending action sends you. Kept beside the keys the server emits. */
const ACTION_ROUTES = {
  setup: PATHS.COMPANY_SETUP,
  preview: PATHS.COMPANY_PREVIEW,
  interests: PATHS.COMPANY_INTERESTS,
  hiring: PATHS.COMPANY_HIRING,
  team: PATHS.COMPANY_TEAM,
};

const TONE_STYLES = {
  primary: 'border-brand-500/30 bg-brand-50/60',
  warning: 'border-amber-200 bg-amber-50/60',
  default: 'border-gray-200 bg-white',
};

/** A single headline number. `null` renders as "—" because withheld is not zero. */
function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-brand-dark">
        {value === null || value === undefined ? '—' : value}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function CompanyHomePage() {
  const { companySlug } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(
    async (signal) => {
      const data = await fetchCompanyDashboard(companySlug, { signal });
      setState({ status: 'ready', data });
    },
    [companySlug],
  );

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({ status: 'error', message: error.message });
    });

    return () => controller.abort();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Loading your company home…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load this company.'}
        </StatusRegion>
      </Container>
    );
  }

  const { company, overview, setup, interests, hiring, pendingActions, permissions, yourRole } =
    state.data;
  const path = (name) => buildPath(name, { companySlug });

  return (
    <Container className="py-32">
      {/*
        One step up out of the company context, at the top — the affordance SET-01 established.

        The four pills that used to sit at the FOOT of this page (Interest inbox, Find candidates,
        Edit company page, Team) were all rail destinations; "Edit company page" pointed at
        COMPANY_SETUP, which renders the same screen the rail's "Company page" already opens. Nothing
        became unreachable by deleting them — the rail carries every one.
      */}
      <BackLink to={PATHS.APP_HOME} label="Your companies" className="mb-6" />

      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-brand-dark">{company.name}</h1>
            <Badge
              tone={company.status === COMPANY_STATUS.PUBLISHED ? 'successLight' : 'neutral'}
              size="sm"
              radius="full"
            >
              {company.status === COMPANY_STATUS.PUBLISHED ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-gray-600">
            {company.tagline || 'Your recruiting activity for this company.'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            You are {COMPANY_ROLE_LABELS[yourRole] ?? yourRole} here.
          </p>
        </div>

        {overview.isPublished && (
          <Button
            to={company.publicUrl}
            variant="outlineDark"
            size="md"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            View public page
          </Button>
        )}
      </header>

      {/* Recruiting overview — the four numbers that describe this company right now. */}
      <section aria-labelledby="overview-heading" className="mb-10">
        <h2 id="overview-heading" className="sr-only">
          Recruiting overview
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Page"
            value={overview.isPublished ? 'Live' : 'Draft'}
            hint={overview.isPublished ? 'Findable in the directory' : 'Not publicly visible'}
          />
          <StatCard
            label="Active roles"
            value={overview.activeRoles}
            hint={company.isCurrentlyHiring ? 'Marked as hiring' : 'Not marked as hiring'}
          />
          <StatCard
            label="Open interest"
            value={overview.activeInterest}
            hint={
              permissions.canViewInterest ? 'People awaiting a response' : 'Not shown for your role'
            }
          />
          <StatCard label="Team" value={overview.memberCount} hint="Active members" />
        </div>
      </section>

      {/* Pending actions — the only part of this page that asks for something. */}
      <section aria-labelledby="actions-heading" className="mb-10">
        <h2 id="actions-heading" className="mb-1 text-lg font-bold text-brand-dark">
          Needs you
        </h2>
        <p className="mb-5 text-sm text-gray-600">
          The next things worth doing, most important first.
        </p>

        {pendingActions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-600">
              Nothing needs your attention right now. New interest will appear here as it arrives.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pendingActions.map((action) => (
              <li
                key={action.key}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${
                  TONE_STYLES[action.tone] ?? TONE_STYLES.default
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-brand-dark">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-600">{action.detail}</span>
                </span>
                {ACTION_ROUTES[action.to] && (
                  <Button to={path(ACTION_ROUTES[action.to])} variant="primary" size="sm">
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inbound interest summary — REC-11 owns the detail. */}
        {interests && (
          <section
            aria-labelledby="interest-heading"
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="interest-heading" className="text-lg font-bold text-brand-dark">
                Inbound interest
              </h2>
              <Button to={path(PATHS.COMPANY_INTERESTS)} variant="primary" size="sm">
                Open inbox
              </Button>
            </div>

            {interests.total === 0 ? (
              <p className="text-sm text-gray-600">
                No one has expressed interest yet. Publishing your page and adding a role is what
                makes this fill up.
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-gray-100 p-3">
                  <dt className="text-xs text-gray-500">New</dt>
                  <dd className="text-xl font-semibold text-brand-dark">{interests.new}</dd>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <dt className="text-xs text-gray-500">Open</dt>
                  <dd className="text-xl font-semibold text-brand-dark">{interests.active}</dd>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <dt className="text-xs text-gray-500">Withdrawn</dt>
                  <dd className="text-xl font-semibold text-brand-dark">{interests.withdrawn}</dd>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <dt className="text-xs text-gray-500">All time</dt>
                  <dd className="text-xl font-semibold text-brand-dark">{interests.total}</dd>
                </div>
              </dl>
            )}
          </section>
        )}

        {/* Hiring summary — lightweight intent, no job descriptions (PRD §7.5). */}
        <section
          aria-labelledby="hiring-heading"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="hiring-heading" className="mb-4 text-lg font-bold text-brand-dark">
            Hiring
          </h2>

          {hiring.activeCount === 0 ? (
            <p className="text-sm text-gray-600">
              No active roles. You can still receive general interest — a role is not required to
              be contacted.
            </p>
          ) : (
            <ul className="space-y-2">
              {hiring.active.map((intent) => (
                <li key={intent.id} className="rounded-xl border border-gray-100 p-3">
                  <span className="block text-sm font-medium text-brand-dark">
                    {intent.title || intent.roleCategories[0] || 'Untitled role'}
                  </span>
                  {intent.employmentTypes.length > 0 && (
                    <span className="block text-xs text-gray-500">
                      {intent.employmentTypes.join(' · ')}
                    </span>
                  )}
                </li>
              ))}
              {hiring.activeCount > hiring.active.length && (
                <li className="text-xs text-gray-500">
                  and {hiring.activeCount - hiring.active.length} more
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Setup checklist — only for someone who could act on it. REC-06 owns the same list. */}
      {setup && !setup.canPublish && (
        <section
          aria-labelledby="setup-heading"
          className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="setup-heading" className="mb-4 text-lg font-bold text-brand-dark">
            Before you can publish
          </h2>
          <ul className="space-y-2">
            {setup.items.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <Icon
                  name={item.done ? 'circle-check' : 'xmark'}
                  className={item.done ? 'text-green-600' : 'text-gray-300'}
                />
                <span className={item.done ? 'text-gray-500 line-through' : 'text-brand-dark'}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
