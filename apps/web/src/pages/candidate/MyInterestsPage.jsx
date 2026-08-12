import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, BackLink, Badge, Button, Container } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchMyInterests, withdrawInterest } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * CAN-08 — my interests (PRD §8.2, §8.7 step 8).
 *
 * Company, role, date, status, and withdraw.
 *
 * Every record sits at "Submitted" today, and that is accurate rather than a placeholder: the
 * later statuses (viewed, contacted, progressed) are set by the recruiter's interest inbox
 * (REC-11), which is not built. The screen says so, instead of implying the company has ignored
 * the candidate.
 */
const STATUS_LABELS = {
  submitted: 'Submitted',
  viewed: 'Viewed',
  contacted: 'Contacted',
  progressed: 'In progress',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
};

const STATUS_TONES = {
  submitted: 'brand',
  viewed: 'brand',
  contacted: 'successLight',
  progressed: 'successLight',
  closed: 'neutral',
  withdrawn: 'neutral',
  expired: 'neutral',
};

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function MyInterestsPage() {
  const [state, setState] = useState({ status: 'loading', interests: [] });
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchMyInterests({ signal: controller.signal })
      .then((interests) => setState({ status: 'ready', interests }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', interests: [], message: error.message });
      });

    return () => controller.abort();
  }, []);

  async function handleWithdraw(interest) {
    setBusyId(interest.id);
    setFeedback(null);
    try {
      await withdrawInterest(interest.id);
      const interests = await fetchMyInterests();
      setState({ status: 'ready', interests });
      setFeedback({
        tone: 'success',
        text: `Withdrawn. ${interest.company?.name ?? 'The company'} no longer has access to your profile.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not withdraw that.' });
    } finally {
      setBusyId(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your interests…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-40 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-32">
      {/* Back to the candidate home, at the top — the same affordance the company pages use. */}
      <BackLink to={PATHS.CANDIDATE_HOME} label="Candidate home" className="mb-6" />

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">My interests</h1>
        <p className="mt-2 max-w-xl text-gray-600">
          Companies you have shared your profile with. Withdrawing removes their access.
        </p>
      </header>

      {state.status === 'error' && (
        <StatusRegion tone="error" className="mb-6">
          {state.message ?? 'We could not load your interests.'}
        </StatusRegion>
      )}

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {state.interests.length === 0 ? (
        <EmptyState
          icon="compass"
          title="You have not expressed interest yet"
          description="Browse companies and share your profile with the ones you would like to hear from."
          action={
            <Button to={PATHS.CANDIDATE_COMPANIES} variant="primary" size="md">
              Browse companies
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {state.interests.map((interest) => (
            <li
              key={interest.id}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar
                  src={interest.company?.logoUrl}
                  initials={interest.company?.initials}
                  size="sm"
                  shape="rounded"
                  tone="brand"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {interest.company ? (
                      <Link
                        to={buildPath(PATHS.CANDIDATE_COMPANY_PROFILE, {
                          slug: interest.company.slug,
                        })}
                        className="truncate font-medium text-brand-dark hover:underline"
                      >
                        {interest.company.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-brand-dark">Company unavailable</span>
                    )}
                    <Badge
                      tone={STATUS_TONES[interest.status] ?? 'neutral'}
                      size="sm"
                      radius="full"
                    >
                      {STATUS_LABELS[interest.status] ?? interest.status}
                    </Badge>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">
                    {interest.role ? interest.role.title : 'General interest'} ·{' '}
                    {formatDate(interest.submittedAt)}
                  </p>

                  {interest.message && (
                    <p className="mt-2 text-sm italic text-gray-500">“{interest.message}”</p>
                  )}
                </div>

                {interest.canWithdraw && (
                  <Button
                    variant="outlineDark"
                    size="sm"
                    radius="lg"
                    className="shrink-0 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
                    disabled={busyId === interest.id}
                    onClick={() => handleWithdraw(interest)}
                  >
                    {busyId === interest.id ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.interests.some((i) => i.status === 'submitted') && (
        <p className="mt-6 text-xs text-gray-400">
          Companies review interest in their own time. Status updates appear here when a company
          acts on yours.
        </p>
      )}

    </Container>
  );
}
