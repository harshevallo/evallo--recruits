import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Container } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { CompanyProfileView } from '@/features/companies/components/CompanyProfileView';
import { CompanyProfileSkeleton } from '@/features/companies/components/CompanyProfileSkeleton';
import { ExpressInterestModal } from '@/features/companies/components/ExpressInterestModal';
import { useCompanyProfile } from '@/features/companies/hooks/useCompanyProfile';
import { usePageMeta, clampDescription } from '@/utils/pageMeta';
import { PATHS, buildPath } from '@/router/paths';

/**
 * PUB-02 — public company profile (PRD §7.4, §9.3).
 *
 * Anonymous, no authentication. Visitors can review the organisation, see its open roles, and
 * express interest.
 *
 * The profile itself is `CompanyProfileView`, which CAN-06 renders too — the two company URLs
 * must never again be two different-looking pages. What stays here is only what belongs to being
 * anonymous: the pre-authentication interest form, and the public directory as the way back.
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

  /*
   * Page metadata from the company's own words — nothing invented.
   *
   * `description.short` is the line the company wrote for exactly this purpose, and the tagline is
   * the fallback. When neither exists the description is omitted rather than generated, because a
   * made-up summary of somebody's organisation is worse than none. While the fetch is in flight
   * `usePageMeta(null)` writes nothing, so the document keeps the generic defaults.
   *
   * The hook runs BEFORE the early returns below — hooks cannot sit after a conditional return.
   */
  usePageMeta(
    company
      ? {
          title: `${company.name} — hiring educators | Evallo Recruit`,
          description: clampDescription(
            company.description?.short ||
              company.tagline ||
              `${company.name} on Evallo Recruit.`,
          ),
          path: buildPath(PATHS.COMPANY_PROFILE, { slug }),
          ogType: 'profile',
          /* Only a real logo. `initials` are rendered CSS, not an image a crawler can fetch. */
          image: company.logoUrl || undefined,
        }
      : null,
  );

  if (isLoading) return <CompanyProfileSkeleton />;

  if (isNotFound || isError) {
    return (
      <Container size="prose" className="py-32">
        <EmptyState
          icon="file-shield"
          title={isNotFound ? 'Company not found' : "We couldn't load this page"}
          description={
            isNotFound
              ? 'This company page does not exist, or it is not published yet.'
              : (error?.message ?? 'Something went wrong. Please try again.')
          }
          action={
            isNotFound ? (
              <Button to={PATHS.COMPANY_DIRECTORY} variant="primary" size="md">
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

  return (
    <>
      <CompanyProfileView
        company={company}
        backTo={PATHS.COMPANY_DIRECTORY}
        onExpressInterest={openInterest}
      />

      <ExpressInterestModal
        open={interestOpen}
        onClose={() => setInterestOpen(false)}
        company={company}
        defaultIntentId={selectedIntentId}
      />
    </>
  );
}
