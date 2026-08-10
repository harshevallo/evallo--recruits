import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { CreateCompanyForm } from '@/features/account/components/CreateCompanyForm';
import { ContextSwitcher } from '@/features/home/components/ContextSwitcher';
import { NextActionCard } from '@/features/home/components/NextActionCard';
import { CompanyContextCard } from '@/features/home/components/CompanyContextCard';
import { useAuth } from '@/context/AuthContext';
import { createCandidateProfile } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * HOME-01 — universal home: "combined next actions and context switcher" (PRD Appendix A).
 *
 * Three responsibilities, and no more (PRD §5.2):
 *   1. Emphasise the next setup actions for whatever state the account is in.
 *   2. Offer a context switcher covering Personal and every company (PRD §5.3).
 *   3. Route into the personal and company surfaces.
 *
 * It is deliberately NOT a profile page — CAN-01 owns candidate detail and REC-10 owns company
 * activity. Both capabilities are shown together because one account holds both; nothing here
 * reads or writes a global role, because there isn't one (ADR-001).
 */
export function AppHomePage() {
  const { user, capabilities, error, refresh } = useAuth();
  const navigate = useNavigate();

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [candidateStatus, setCandidateStatus] = useState(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  const location = useLocation();
  const candidateSection = useRef(null);

  const companies = capabilities?.companies ?? [];
  const hasCandidateProfile = Boolean(capabilities?.hasCandidateProfile);
  const hasCompany = companies.length > 0;
  const isNewAccount = !hasCandidateProfile && !hasCompany;

  /**
   * AUTH-05 hands over an intent, never a completed action. "company" opens the creation form;
   * "candidate" brings the card into view. Neither creates anything — the user still confirms.
   */
  const intent = location.state?.intent;
  useEffect(() => {
    if (intent === 'company') setCompanyModalOpen(true);
    if (intent === 'candidate') {
      candidateSection.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [intent]);

  /**
   * Explicit, user-initiated. HOME-01 never creates a profile on its own.
   *
   * On success it goes STRAIGHT INTO the builder. Stopping at a success message left the person on
   * this page with nothing to click: the whole candidate surface is behind `RequireCandidate`, so
   * before the profile existed there was no link to it, and afterwards there was still nothing
   * telling them where it had gone. Creating a profile and then filling it in is one intention.
   */
  async function startCandidateProfile() {
    setIsCreatingProfile(true);
    setCandidateStatus(null);
    try {
      await createCandidateProfile({});
      // The capability is derived per request, so refresh before routing past RequireCandidate.
      await refresh();
      navigate(PATHS.CANDIDATE_PROFILE_BUILDER);
    } catch (apiError) {
      setCandidateStatus({ tone: 'error', text: apiError.message ?? 'Could not create profile.' });
      setIsCreatingProfile(false);
    }
  }

  return (
    <Container className="py-32">
      <header className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">
            Welcome{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="mt-2 max-w-xl text-gray-600">
            One account. Build a candidate profile, run companies, or both — nothing here locks you
            into a single role.
          </p>
        </div>

        {/* PRD §5.3: the switcher shows Personal and every company the user belongs to. */}
        <ContextSwitcher companies={companies} current="personal" />
      </header>

      {error && (
        <StatusRegion tone="error" className="mb-6">
          {error.message ?? 'We could not load your account.'}
        </StatusRegion>
      )}

      {/*
        PRD §5.2 signed-in navigation: Explore companies and Account settings stay available whatever
        the account's state — unlike the setup actions below, which disappear once done. Settings
        appears exactly once ("Do not duplicate account settings").

        At the TOP, not the foot. This page has no rail — it is the one screen above both workspaces —
        so these two are not rail duplicates, but navigation still belongs where the eye starts.
      */}
      <nav aria-label="Account" className="mb-10 flex flex-wrap gap-3">
        <Button
          to={PATHS.COMPANY_DIRECTORY}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          <Icon name="compass" />
          Explore companies
        </Button>

        <Button
          to={PATHS.ACCOUNT_SETTINGS}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          <Icon name="gear" />
          Account settings
        </Button>
      </nav>

      {/*
        PRD §5.2 — "Home emphasizes next setup actions." Setup actions only, and only the ones
        still outstanding; once both capabilities exist there is nothing to set up and the whole
        section goes away. Persistent navigation (Explore, Settings) sits above this block
        so it does not disappear with it.
      */}
      {(!hasCandidateProfile || !hasCompany) && (
        <section aria-labelledby="next-actions" className="mb-10">
          <h2 id="next-actions" className="mb-1 text-lg font-bold text-brand-dark">
            {isNewAccount ? 'Set up your account' : 'Next steps'}
          </h2>
          <p className="mb-5 text-sm text-gray-600">
            {isNewAccount
              ? 'Pick whichever fits — you can add the other at any time.'
              : 'Optional. Your account already works as it is.'}
          </p>

          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {!hasCandidateProfile && (
              <NextActionCard
                icon="user"
                title="Start your candidate profile"
                description="Let education businesses find you. Creating a profile does not change your account — you keep every company you belong to."
                cta="Start candidate profile"
                onSelect={startCandidateProfile}
                busy={isCreatingProfile}
              />
            )}

            {!hasCompany && (
              <NextActionCard
                icon="building"
                title="Create a company"
                description="Set up an organisation, publish its page, and start receiving interest from educators. You become its owner."
                cta="Create or join a company"
                to={PATHS.COMPANY_START}
              />
            )}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal context */}
        <section
          ref={candidateSection}
          aria-labelledby="personal-context"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id="personal-context" className="text-lg font-bold text-brand-dark">
              Your candidate profile
            </h2>
            {hasCandidateProfile && (
              <Badge tone="successLight" size="sm" radius="full">
                {capabilities.candidateProfile.status}
              </Badge>
            )}
          </div>

          {hasCandidateProfile ? (
            <>
              <p className="text-sm text-gray-600">
                {capabilities.candidateProfile.headline ||
                  'Your profile exists but has no headline yet.'}
              </p>
              <p className="mt-3 text-xs text-gray-400">
                Visibility: {capabilities.candidateProfile.status} · Contact:{' '}
                {capabilities.candidateProfile.contactVisibility}
              </p>
              {/* CAN-01 owns the detail; HOME-01 only routes into it. */}
              <Button
                to={PATHS.CANDIDATE_HOME}
                variant="primary"
                size="sm"
                radius="lg"
                className="mt-5"
              >
                Open candidate home
              </Button>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              You have not created a candidate profile yet. Use “Start your candidate profile”
              above whenever you are ready — nothing is created until you choose to.
            </p>
          )}

          {candidateStatus && (
            <StatusRegion tone={candidateStatus.tone} className="mt-4">
              {candidateStatus.text}
            </StatusRegion>
          )}
        </section>

        {/* Company contexts — one row per membership, each with its own role */}
        <section
          aria-labelledby="company-contexts"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="company-contexts" className="text-lg font-bold text-brand-dark">
              Your companies
            </h2>
            <Button to={PATHS.COMPANY_START} variant="primary" size="sm">
              Create or join
            </Button>
          </div>

          {hasCompany ? (
            <ul className="space-y-3">
              {companies.map((company) => (
                <CompanyContextCard key={company.companyId} company={company} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">
              You do not belong to any company yet. Create one to start recruiting, or accept an
              invitation.
            </p>
          )}
        </section>
      </div>

      <Modal
        open={companyModalOpen}
        onClose={() => setCompanyModalOpen(false)}
        title="Create a company"
        description="You become its owner. Your personal profile is unaffected."
      >
        <CreateCompanyForm
          onCreated={async () => {
            await refresh();
            setCompanyModalOpen(false);
          }}
        />
      </Modal>
    </Container>
  );
}
