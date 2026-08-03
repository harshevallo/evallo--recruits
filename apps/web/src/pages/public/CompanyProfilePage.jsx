import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Container, Icon } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { CompanyProfileHeader } from '@/features/companies/components/CompanyProfileHeader';
import { CompanyOverview } from '@/features/companies/components/CompanyOverview';
import { OpenRoleCard } from '@/features/companies/components/OpenRoleCard';
import { ExpressInterestModal } from '@/features/companies/components/ExpressInterestModal';
import { useCompanyProfile } from '@/features/companies/hooks/useCompanyProfile';
import { PATHS } from '@/router/paths';

function ProfileSkeleton() {
  return (
    <>
      <div className="hero-pattern pb-12 pt-32">
        <Container>
          <div className="flex items-start gap-5">
            <Skeleton className="h-16 w-16 rounded-lg bg-gray-700" />
            <div className="flex-1">
              <Skeleton className="mb-3 h-9 w-72 bg-gray-700" />
              <Skeleton className="mb-2 h-5 w-56 bg-gray-800" />
              <Skeleton className="h-4 w-80 bg-gray-800" />
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <Skeleton className="mb-4 h-6 w-32" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </Container>
    </>
  );
}

/**
 * PUB-02 — public company profile (PRD §7.4, §9.3).
 *
 * Anonymous, no authentication. Visitors can review the organisation, see its open roles, and
 * express interest.
 */
export function CompanyProfilePage() {
  const { slug } = useParams();
  const { company, isLoading, isNotFound, isError, error, retry } = useCompanyProfile(slug);

  const [interestOpen, setInterestOpen] = useState(false);
  const [selectedIntentId, setSelectedIntentId] = useState('');

  function openInterest(intentId = '') {
    setSelectedIntentId(intentId);
    setInterestOpen(true);
  }

  if (isLoading) return <ProfileSkeleton />;

  if (isNotFound) {
    return (
      <Container size="prose" className="py-32">
        <EmptyState
          icon="file-shield"
          title="Company not found"
          description="This company page does not exist, or it is not published yet."
          action={
            <Button to={PATHS.COMPANY_DIRECTORY} variant="primary" size="md">
              Browse all companies
            </Button>
          }
        />
      </Container>
    );
  }

  if (isError) {
    return (
      <Container size="prose" className="py-32">
        <EmptyState
          icon="file-shield"
          title="We couldn't load this page"
          description={error?.message ?? 'Something went wrong. Please try again.'}
          action={
            <Button variant="primary" size="md" onClick={retry}>
              Try again
            </Button>
          }
        />
      </Container>
    );
  }

  const openRoles = company.openRoles ?? [];

  return (
    <>
      <CompanyProfileHeader company={company} onExpressInterest={() => openInterest('')} />

      <Container className="py-4">
        <Link
          to={PATHS.COMPANY_DIRECTORY}
          className="inline-flex items-center gap-2 py-4 text-sm font-medium text-gray-600 hover:text-brand-blue"
        >
          <Icon name="arrow-right" className="rotate-180" />
          All companies
        </Link>
      </Container>

      <Container className="pb-16">
        <CompanyOverview company={company} />

        <section id="open-roles" className="mt-10">
          <h2 className="mb-5 text-2xl font-bold text-brand-dark">
            Open roles
            {openRoles.length > 0 && (
              <span className="ml-2 text-base font-medium text-gray-500">
                ({openRoles.length})
              </span>
            )}
          </h2>

          {openRoles.length > 0 ? (
            <div className="space-y-4">
              {openRoles.map((role) => (
                <OpenRoleCard key={role.id} role={role} onExpressInterest={openInterest} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="filter"
              title="No open roles right now"
              description={
                company.acceptsGeneralInterest
                  ? 'This company still welcomes general interest for future opportunities.'
                  : 'Check back later, or browse other organizations that are hiring.'
              }
              action={
                company.acceptsGeneralInterest ? (
                  <Button variant="primary" size="md" onClick={() => openInterest('')}>
                    Share your interest
                  </Button>
                ) : (
                  <Button to={PATHS.COMPANY_DIRECTORY} variant="primary" size="md">
                    Browse companies
                  </Button>
                )
              }
            />
          )}
        </section>
      </Container>

      <ExpressInterestModal
        open={interestOpen}
        onClose={() => setInterestOpen(false)}
        company={company}
        defaultIntentId={selectedIntentId}
      />
    </>
  );
}
