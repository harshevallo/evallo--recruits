import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ROLE_CATEGORY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  SUBJECT_LABELS,
  COUNTRY_LABELS,
} from '@evallo/shared';
import { Avatar, BackLink, Badge, Button, Container, Icon } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { CandidateInterestModal } from '@/features/candidate/components/CandidateInterestModal';
import {
  fetchPublicRole,
  fetchCompanyRelationship,
  submitCandidateInterest,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';
import { usePageMeta, clampDescription } from '@/utils/pageMeta';

/**
 * The role's heading.
 *
 * `title` is optional by design — PRD §7.5 lets a company activate hiring with only a role
 * category, and the server does not invent one. The categories become the heading in that case.
 */
function roleHeading(role) {
  if (role.title?.trim()) return role.title;
  const categories = (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
  return categories.length > 0 ? categories.join(' · ') : 'Open role';
}

function placeLine(location) {
  return [location.city, location.region, COUNTRY_LABELS[location.country] ?? location.country]
    .filter(Boolean)
    .join(', ');
}

/** Compensation, only ever when the company published it — the server withholds the rest. */
function payLine(compensation) {
  if (!compensation) return null;
  const { min, max, currency, period } = compensation;
  if (min == null && max == null) return null;

  const money = (value) => `${currency ? `${currency} ` : ''}${Number(value).toLocaleString()}`;
  const range = min != null && max != null ? `${money(min)}–${money(max)}` : money(min ?? max);
  return period ? `${range} / ${period}` : range;
}

/** One labelled fact in the summary panel. Absent facts render nothing, never "Not specified". */
function Fact({ icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <Icon name={icon} className="mt-1 shrink-0 text-xs text-gray-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-brand-dark">{children}</dd>
      </div>
    </div>
  );
}

/**
 * CAN-05b — one role, on its own page.
 *
 * ── Why this page exists ──────────────────────────────────────────────────────────────────────
 *
 * It did not, until now. A role result linked to `/me/companies/<slug>#open-roles`, so opening a
 * role from "Search for Roles" landed on the company profile — the same destination "Search for
 * Companies" leads to. Two searches, one destination: the role search could find a role but never
 * show you one, and the role you clicked arrived as one card among several.
 *
 * The original reasoning was about the APPLY flow, not the destination: the consent disclosure and
 * the intent selector lived on the company page, and a second consented-disclosure implementation
 * would be a genuine liability (PRD §8.7 step 6 makes it a privacy guarantee, not a form). That
 * concern is answered by reusing `CandidateInterestModal` here rather than rebuilding it — one
 * implementation of consent, two places it can be opened from.
 *
 * ── What is role-led and what is company context ──────────────────────────────────────────────
 *
 * The role is the subject: it takes the `<h1>`, the summary panel and the apply action. The
 * company is context, and its name is a real link to the profile — a candidate deciding on a role
 * still wants to know who they would be working for. That link is now a choice rather than
 * somewhere they were sent.
 */
/**
 * @param {object} props
 * @param {string}  [props.rolesPath]           where "back to search" goes
 * @param {string}  [props.companyProfilePath]  where the company link goes
 * @param {boolean} [props.candidateActions]    render the signed-in candidate affordances
 *
 * ── Why `candidateActions` is a flag and not just two more paths ─────────────────────────
 *
 * The role itself comes from the PUBLIC endpoint, so the page body needs no session. What does
 * need one is the CANDIDATE'S RELATIONSHIP to the company — "already applied", "you blocked them"
 * — which is fetched from `/me/companies/:slug/relationship`. For a visitor with no account that
 * request is a guaranteed 401, and firing it would mean every public role view logs an auth
 * failure and briefly renders an Apply button that cannot work.
 *
 * So the flag gates the FETCH, not merely the markup. A visitor is offered sign-in instead, with
 * the role remembered so they land back here rather than on a dashboard.
 */
export function RoleDetailPage({
  rolesPath = PATHS.PUBLIC_ROLES,
  companyProfilePath = PATHS.COMPANY_PROFILE,
  candidateActions = false,
} = {}) {
  const { roleId } = useParams();
  const location = useLocation();

  const [role, setRole] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | notFound | error
  const [error, setError] = useState(null);

  const [relationship, setRelationship] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [interestOpen, setInterestOpen] = useState(false);

  const load = useCallback(
    (signal) => {
      setStatus('loading');
      return fetchPublicRole(roleId, { signal })
        .then((data) => {
          if (signal?.aborted) return;
          setRole(data);
          setStatus('ready');
        })
        .catch((apiError) => {
          if (signal?.aborted || apiError?.code === 'ERR_CANCELED') return;
          setError(apiError);
          setStatus(apiError?.status === 404 ? 'notFound' : 'error');
        });
    },
    [roleId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /*
   * The candidate's relationship to the COMPANY, not to the role — interest is recorded against a
   * company with an optional intent, so "already applied" is a company-level fact. Fetched only
   * once the role has resolved, because the slug comes from it.
   */
  useEffect(() => {
    const slug = role?.company?.slug;
    /* No session, no relationship to fetch — and no 401 to provoke. */
    if (!slug || !candidateActions) return undefined;

    const controller = new AbortController();
    fetchCompanyRelationship(slug, { signal: controller.signal })
      .then(setRelationship)
      .catch(() => setRelationship(null));

    return () => controller.abort();
  }, [role?.company?.slug, candidateActions]);

  async function handleInterest(payload) {
    const result = await submitCandidateInterest(role.company.slug, payload);
    setRelationship(await fetchCompanyRelationship(role.company.slug));
    setInterestOpen(false);
    setFeedback(
      result.status === 'already_submitted'
        ? 'You have already expressed interest in this company.'
        : 'Interest submitted. You can withdraw it any time from Shortlisted companies.',
    );
  }

  /*
   * Page metadata — the role title and the company name, and nothing else.
   *
   * COMPENSATION IS DELIBERATELY ABSENT even when the API marks it public. A meta description is
   * copied into link previews, search snippets and chat unfurls, all of which outlive the page and
   * none of which re-check visibility later. A company that publishes a salary today and hides it
   * next week would find the figure still sitting in a cached snippet. The page shows it; the
   * metadata does not.
   *
   * The description is built from what the company wrote. When there is no description, it falls
   * back to a factual restatement of fields already on the page — not an invented summary.
   *
   * Before the early returns: hooks cannot follow a conditional return.
   */
  usePageMeta(
    role
      ? {
          title: `${roleHeading(role)}${role.company?.name ? ` — ${role.company.name}` : ''} | Evallo Recruit`,
          description: clampDescription(
            role.description ||
              [
                roleHeading(role),
                role.company?.name ? `at ${role.company.name}` : null,
                (role.locations ?? []).map(placeLine).filter(Boolean)[0],
              ]
                .filter(Boolean)
                .join(' '),
          ),
          path: buildPath(PATHS.PUBLIC_ROLE_DETAIL, { roleId }),
          /* The hiring company's logo is the only image; a role has none of its own. */
          image: role.company?.logoUrl || undefined,
        }
      : null,
  );

  if (status === 'loading') {
    return (
      <Container className="py-28">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading role…</span>
          <Skeleton className="mb-4 h-5 w-32" />
          <Skeleton className="mb-3 h-9 w-2/3" />
          <Skeleton className="mb-8 h-5 w-48" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  if (status !== 'ready') {
    const isGone = status === 'notFound';
    return (
      <Container size="prose" className="py-28">
        <EmptyState
          icon="filter"
          title={isGone ? 'This role is no longer available' : 'We could not load this role'}
          description={
            isGone
              ? 'It may have been filled or withdrawn since you found it. Other roles are still open.'
              : (error?.message ?? 'Something went wrong. Please try again.')
          }
          action={
            isGone ? (
              <Button to={rolesPath} variant="primary" size="md">
                Back to role search
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={() => load()}>
                Try again
              </Button>
            )
          }
        />
      </Container>
    );
  }

  const { company } = role;
  const companyHref = company
    ? buildPath(companyProfilePath, { slug: company.slug })
    : null;

  const categories = (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
  const employment = (role.employmentTypes ?? []).map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t);
  const delivery = (role.deliveryModes ?? []).map((m) => DELIVERY_MODE_LABELS[m] ?? m);
  const places = (role.locations ?? []).map(placeLine).filter(Boolean);
  const subjects = role.specializations?.subjects ?? [];
  const pay = payLine(role.compensation);

  const seniority = [...(role.experienceLevels ?? [])];
  if (typeof role.minYears === 'number' && role.minYears > 0) {
    seniority.push(`${role.minYears}+ ${role.minYears === 1 ? 'year' : 'years'}`);
  }

  const hasInterest = Boolean(relationship?.interest);
  const isBlocked = Boolean(relationship?.blocked);

  return (
    <>
      <Container className="py-28">
        <BackLink to={rolesPath} label="Back to role search" className="mb-6" />

        <header className="mb-8">
          {(categories.length > 0 || role.postedAt) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {categories[0] && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  {categories[0]}
                </span>
              )}
              {role.postedAt && (
                <span className="text-xs text-gray-500">
                  Posted {new Date(role.postedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          <h1 className="break-words text-3xl font-bold tracking-tight text-brand-dark">
            {roleHeading(role)}
          </h1>

          {/* Company as CONTEXT — named, branded, and linked, but secondary to the role. */}
          {company && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Avatar
                src={company.logoUrl}
                initials={company.initials}
                size="md"
                shape="rounded"
                tone="brand"
              />
              <div className="min-w-0">
                <Link
                  to={companyHref}
                  className="text-base font-semibold text-brand-dark hover:text-brand-blue"
                >
                  {company.name}
                </Link>
                <p className="text-sm text-gray-600">
                  {[
                    ORGANIZATION_TYPE_LABELS[company.organizationType] ??
                      company.organizationType,
                    company.location ? placeLine(company.location) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          )}
        </header>

        {feedback && (
          <StatusRegion tone="success" className="mb-6">
            {feedback}
          </StatusRegion>
        )}

        {isBlocked && (
          <StatusRegion tone="info" className="mb-6">
            You have blocked {company?.name ?? 'this company'}, so you cannot apply to their roles.
            Manage blocked companies in{' '}
            <Link to={PATHS.SETTINGS_PRIVACY} className="font-medium underline">
              Privacy settings
            </Link>
            .
          </StatusRegion>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <h2 className="mb-3 text-xl font-bold text-brand-dark">About this role</h2>
            {role.description ? (
              <p className="whitespace-pre-line leading-relaxed text-gray-600">
                {role.description}
              </p>
            ) : (
              /*
                PRD §7.5 is explicit that no job description is required. So this is a normal
                state, not a gap to scold the company about — the summary panel beside it still
                carries everything they did say.
              */
              <p className="text-sm text-gray-500">
                This company activated hiring without a written description. What they are looking
                for is summarised alongside.
              </p>
            )}

            {subjects.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-base font-bold text-brand-dark">Subjects</h2>
                <ul className="flex flex-wrap gap-2">
                  {subjects.map((subject) => (
                    <li key={subject}>
                      <Badge tone="neutral" size="sm" radius="md">
                        {SUBJECT_LABELS[subject] ?? subject}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {companyHref && (
              <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-brand-dark">
                  Working at {company.name}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Their profile has the full picture — programs, culture, and every other role they
                  have open.
                </p>
                <Button
                  to={companyHref}
                  variant="outlineDark"
                  size="none"
                  radius="lg"
                  className="mt-4 px-4 py-2 text-sm font-semibold !border-gray-300 !text-brand-dark hover:!bg-gray-50"
                >
                  View company profile <Icon name="arrow-right" className="text-xs" />
                </Button>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-lg font-bold text-brand-dark">Role summary</h2>
              <dl>
                <Fact icon="location-dot" label="Location">
                  {[...places, ...delivery].join(' · ') || null}
                </Fact>
                <Fact icon="briefcase" label="Engagement">
                  {employment.join(' · ') || null}
                </Fact>
                <Fact icon="chart-line" label="Experience">
                  {seniority.join(' · ') || null}
                </Fact>
                <Fact icon="bolt" label="Start">
                  {role.availability}
                </Fact>
                <Fact icon="award" label="Compensation">
                  {pay}
                </Fact>
              </dl>

              {candidateActions ? (
                <Button
                  variant="primary"
                  size="md"
                  radius="lg"
                  fullWidth
                  className="mt-5"
                  disabled={hasInterest || isBlocked}
                  onClick={() => setInterestOpen(true)}
                >
                  {hasInterest ? 'Interest submitted' : 'Apply to this role'}
                </Button>
              ) : (
                /*
                  Applying needs an account, so a visitor is sent to sign-in rather than shown a
                  button that fails. `state.from` is the CURRENT url, which SignInPage already
                  honours — so they return to this role, not to a dashboard, and do not have to
                  find it again.
                */
                <>
                  <Button
                    to={PATHS.SIGN_IN}
                    state={{ from: `${location.pathname}${location.search}` }}
                    variant="primary"
                    size="md"
                    radius="lg"
                    fullWidth
                    className="mt-5"
                  >
                    Sign in to apply
                  </Button>
                  <p className="mt-3 text-center text-xs text-gray-500">
                    Browsing is open to everyone. An account is needed only to apply.
                  </p>
                </>
              )}

              {hasInterest && (
                <p className="mt-3 text-center text-xs text-gray-500">
                  Manage it from{' '}
                  <Link
                    to={PATHS.CANDIDATE_INTERESTS}
                    className="font-medium text-brand-blue underline"
                  >
                    Shortlisted companies
                  </Link>
                  .
                </p>
              )}
            </div>
          </aside>
        </div>
      </Container>

      {/*
        `candidateActions` as well as `company`: a visitor can never open this — nothing sets
        `interestOpen` for them — but mounting a candidate-only surface on a public page is the
        kind of thing that becomes a leak the first time someone adds a default-open prop.
      */}
      {company && candidateActions && (
        <CandidateInterestModal
          open={interestOpen}
          onClose={() => setInterestOpen(false)}
          company={company}
          roles={[{ id: role.id, title: roleHeading(role) }]}
          /* The candidate is looking at this role — it is the selection, not an option. */
          defaultIntentId={role.id}
          onSubmitted={handleInterest}
        />
      )}
    </>
  );
}
