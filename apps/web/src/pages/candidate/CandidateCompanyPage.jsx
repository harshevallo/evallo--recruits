import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Container, Icon } from '@/components/ui';
import { EmptyState } from '@/components/feedback/EmptyState';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { CompanyProfileView } from '@/features/companies/components/CompanyProfileView';
import { CompanyProfileSkeleton } from '@/features/companies/components/CompanyProfileSkeleton';
import { CandidateInterestModal } from '@/features/candidate/components/CandidateInterestModal';
import { BlockCompanyModal } from '@/features/candidate/components/BlockCompanyModal';
import { useCompanyProfile } from '@/features/companies/hooks/useCompanyProfile';
import {
  fetchCompanyRelationship,
  saveCompany,
  unsaveCompany,
  submitCandidateInterest,
  blockCompany,
  unblockCompany,
} from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-06 — company page, signed in (PRD §8.2: "public page; follow/save; express interest").
 *
 * ── This page renders the public page, not a copy of it ───────────────────────────────────────
 *
 * The company CONTENT comes from the same public endpoint PUB-02 uses, and since this revision it
 * is drawn by the same `CompanyProfileView` as well. Before that only the two inner cards were
 * shared and the surrounding page was written twice — so when PUB-02 was rebuilt to the approved
 * reference, this URL kept the old layout and the product had two different-looking company pages
 * at the same time. Which one you saw depended on whether you followed a link or browsed while
 * signed in.
 *
 * What this page adds is ONLY the candidate's own relationship to the company: saved or not,
 * interest already expressed or not, blocked or not. That is the whole of the difference, and it
 * arrives through `actions` and `banner` rather than through a second layout.
 *
 * Report is deliberately not here — PRD §16.3 routes company reporting through moderation.
 *
 * Blocking (CAN-04, PRD §4.3) IS here. The setting is still owned by CAN-04 and Privacy settings,
 * which list and reverse it; this page is where the decision is actually made, because it is the
 * only screen where a candidate is looking at a specific company.
 */
export function CandidateCompanyPage() {
  const { slug } = useParams();
  const { company, isLoading, isNotFound, isError, error, retry } = useCompanyProfile(slug);

  const [relationship, setRelationship] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [interestOpen, setInterestOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

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

  /**
   * CAN-04 — block, confirmed by BlockCompanyModal.
   *
   * The modal awaits this, so a failure surfaces inside the dialog and the dialog stays open. On
   * success the local relationship is updated from the same request rather than re-fetched, so
   * the header cannot show a stale state.
   */
  async function confirmBlock() {
    await blockCompany(relationship.companyId);
    setRelationship((current) => ({ ...current, blocked: true }));
    setBlockOpen(false);
    setFeedback({
      tone: 'success',
      text: `${company.name} is blocked. They can no longer find or open your profile.`,
    });
  }

  async function handleUnblock() {
    setBusy(true);
    setFeedback(null);
    try {
      await unblockCompany(relationship.companyId);
      setRelationship((current) => ({ ...current, blocked: false }));
      setFeedback({ tone: 'success', text: `${company.name} is unblocked.` });
    } catch (apiError) {
      setFeedback({ tone: 'error', text: apiError.message ?? 'We could not unblock that company.' });
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
          : 'Interest submitted. You can withdraw it any time from Shortlisted companies.',
    });
  }

  if (isLoading) return <CompanyProfileSkeleton topSpacing="workspace" />;

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

  const hasInterest = Boolean(relationship?.interest);
  const isBlocked = Boolean(relationship?.blocked);
  /* Nothing can act until the relationship has loaded — companyId is what every action needs. */
  const relationshipReady = Boolean(relationship?.companyId);

  /* Shared by the two secondary controls, which are outline buttons on a light surface. */
  const secondary =
    'justify-center px-4 py-2 text-sm font-semibold !border-gray-300 !text-brand-dark hover:!bg-gray-50';

  const actions = (
    <div className="flex flex-wrap gap-2 sm:justify-end">
      <Button
        variant="outlineDark"
        size="none"
        radius="lg"
        className={secondary}
        disabled={busy}
        onClick={toggleSave}
      >
        {/*
          `star` in BOTH states, and the label carries the difference. The rail marks saved
          companies with `star` and shortlisted ones with `bookmark`, so flipping to `heart` once
          saved would be a third mark that means nothing anywhere else in the product.
        */}
        <Icon name="star" className="text-xs" />
        {relationship?.saved ? 'Saved' : 'Save'}
      </Button>

      {/*
        CAN-04 — blocking lives here because this is where a candidate actually meets a company.
        It stays available while blocked, as the reverse action, so the control never disappears
        and leaves the state unreachable.
      */}
      <Button
        variant="outlineDark"
        size="none"
        radius="lg"
        className={secondary}
        disabled={busy || !relationshipReady}
        onClick={isBlocked ? handleUnblock : () => setBlockOpen(true)}
      >
        <Icon name="shield-halved" className="text-xs" />
        {isBlocked ? 'Unblock' : 'Block'}
      </Button>

      <Button
        variant="primary"
        size="none"
        radius="lg"
        className="justify-center px-5 py-2 text-sm font-semibold"
        disabled={hasInterest || isBlocked}
        onClick={() => setInterestOpen(true)}
      >
        {hasInterest ? 'Interest submitted' : "I'm interested"}
      </Button>
    </div>
  );

  const banner = (feedback || isBlocked || hasInterest) && (
    <div className="space-y-3">
      {feedback && <StatusRegion tone={feedback.tone}>{feedback.text}</StatusRegion>}

      {isBlocked && (
        <StatusRegion tone="info">
          You have blocked this company. They cannot find or open your profile. Manage blocked
          companies in{' '}
          <Link to={PATHS.SETTINGS_PRIVACY} className="font-medium underline">
            Privacy settings
          </Link>
          .
        </StatusRegion>
      )}

      {hasInterest && (
        <StatusRegion tone="info">
          You expressed interest on{' '}
          {new Date(relationship.interest.submittedAt).toLocaleDateString()}. Manage it from{' '}
          <Link to={PATHS.CANDIDATE_INTERESTS} className="font-medium underline">
            Shortlisted companies
          </Link>
          .
        </StatusRegion>
      )}
    </div>
  );

  return (
    <>
      <CompanyProfileView
        company={company}
        topSpacing="workspace"
        backTo={PATHS.CANDIDATE_COMPANIES}
        actions={actions}
        banner={banner}
        /*
          Omitted once interest is in, or the company is blocked, so the role cards drop their
          Apply button instead of offering an action that is already spent or forbidden. The
          header button says which of the two it is.
        */
        onExpressInterest={hasInterest || isBlocked ? undefined : () => setInterestOpen(true)}
      />

      <CandidateInterestModal
        open={interestOpen}
        onClose={() => setInterestOpen(false)}
        company={company}
        roles={company.openRoles ?? []}
        onSubmitted={handleInterest}
      />

      <BlockCompanyModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        companyName={company.name}
        onConfirm={confirmBlock}
      />
    </>
  );
}
