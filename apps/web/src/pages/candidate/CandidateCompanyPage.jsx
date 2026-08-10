import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink, Badge, Button, Container, Icon } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { CompanyOverview } from '@/features/companies/components/CompanyOverview';
import { OpenRoleCard } from '@/features/companies/components/OpenRoleCard';
import { CandidateInterestModal } from '@/features/candidate/components/CandidateInterestModal';
import { useCompanyProfile } from '@/features/companies/hooks/useCompanyProfile';
import {
  fetchCompanyRelationship,
  saveCompany,
  unsaveCompany,
  submitCandidateInterest,
} from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-06 — company page, signed in (PRD §8.2: "public page; follow/save; express interest").
 *
 * The company CONTENT comes from the same public endpoint PUB-02 uses, so the signed-in and
 * anonymous views can never disagree about the company itself. This page adds only the candidate's
 * own relationship to it: saved or not, interest already expressed or not.
 *
 * Report is deliberately not here — PRD §16.3 routes company reporting through moderation, and the
 * candidate-side control that exists today is blocking, which lives in CAN-04.
 */
export function CandidateCompanyPage() {
  const { slug } = useParams();
  const { company, isLoading, isNotFound, isError, error, retry } = useCompanyProfile(slug);

  const [relationship, setRelationship] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [interestOpen, setInterestOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetchCompanyRelationship(slug, { signal: controller.signal })
      .then(setRelationship)
      .catch(() => setRelationship(null));

    return () => controller.abort();
  }, [slug]);

  async function toggleSave() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = relationship?.saved ? await unsaveCompany(slug) : await saveCompany(slug);
      setRelationship((current) => ({ ...current, saved: result.saved }));
      setFeedback({
        tone: 'success',
        text: result.saved ? 'Saved to your list.' : 'Removed from your list.',
      });
    } catch (apiError) {
      setFeedback({ tone: 'error', text: apiError.message ?? 'We could not update that.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleInterest(payload) {
    const result = await submitCandidateInterest(slug, payload);
    const fresh = await fetchCompanyRelationship(slug);
    setRelationship(fresh);
    setInterestOpen(false);
    setFeedback({
      tone: 'success',
      text:
        result.status === 'already_submitted'
          ? 'You have already expressed interest in this company.'
          : 'Interest submitted. You can withdraw it any time from My interests.',
    });
  }

  if (isLoading) {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading company…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (isNotFound || isError) {
    return (
      <Container size="prose" className="py-32">
        <EmptyState
          icon="file-shield"
          title={isNotFound ? 'Company not found' : 'We could not load this page'}
          description={
            isNotFound
              ? 'This company page does not exist, or it is not published yet.'
              : (error?.message ?? 'Something went wrong.')
          }
          action={
            isNotFound ? (
              <Button to={PATHS.CANDIDATE_COMPANIES} variant="primary" size="md">
                Browse all companies
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={retry}>
                Try again
              </Button>
            )
          }
        />
      </Container>
    );
  }

  const openRoles = company.openRoles ?? [];
  const hasInterest = Boolean(relationship?.interest);

  return (
    <Container className="py-32">
      <BackLink to={PATHS.CANDIDATE_COMPANIES} label="All companies" className="mb-6" />

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-brand-dark">{company.name}</h1>
            {company.isCurrentlyHiring && (
              <Badge tone="successLight" size="sm" radius="full">
                Hiring now
              </Badge>
            )}
          </div>
          {company.tagline && <p className="max-w-xl text-gray-600">{company.tagline}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Button
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            disabled={busy}
            onClick={toggleSave}
          >
            <Icon name={relationship?.saved ? 'heart' : 'star'} className="text-xs" />
            {relationship?.saved ? 'Saved' : 'Save'}
          </Button>

          <Button
            variant="primary"
            size="md"
            radius="lg"
            disabled={hasInterest}
            onClick={() => setInterestOpen(true)}
          >
            {hasInterest ? 'Interest submitted' : "I'm interested"}
          </Button>
        </div>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {hasInterest && (
        <StatusRegion tone="info" className="mb-6">
          You expressed interest on{' '}
          {new Date(relationship.interest.submittedAt).toLocaleDateString()}. Manage it from{' '}
          <Link to={PATHS.CANDIDATE_INTERESTS} className="font-medium underline">
            My interests
          </Link>
          .
        </StatusRegion>
      )}

      <CompanyOverview company={company} />

      <section id="open-roles" className="mt-10">
        <h2 className="mb-5 text-2xl font-bold text-brand-dark">
          Open roles
          {openRoles.length > 0 && (
            <span className="ml-2 text-base font-normal text-gray-500">({openRoles.length})</span>
          )}
        </h2>

        {openRoles.length === 0 ? (
          <p className="text-sm text-gray-600">
            No specific roles listed right now.
            {relationship?.acceptsGeneralInterest &&
              ' You can still register general interest — they accept it.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {openRoles.map((role) => (
              <OpenRoleCard
                key={role.id}
                role={role}
                onExpressInterest={() => setInterestOpen(true)}
              />
            ))}
          </div>
        )}
      </section>

      <CandidateInterestModal
        open={interestOpen}
        onClose={() => setInterestOpen(false)}
        company={company}
        roles={openRoles}
        onSubmitted={handleInterest}
      />
    </Container>
  );
}
