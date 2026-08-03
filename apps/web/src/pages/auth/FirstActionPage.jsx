import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { FirstActionChoice } from '@/features/auth/components/FirstActionChoice';
import { useAuth } from '@/context/AuthContext';
import { completeOnboarding } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * AUTH-05 — first-action router (PRD §6.2, TRD §5.2).
 *
 * The last step of the sign-up chain: AUTH-04 name → AUTH-05 → the chosen destination.
 *
 * This screen is NAVIGATION ONLY. It writes no role, creates no CandidateProfile and no Company
 * (PRD §21.1, ADR-001) — picking "Create Company" here does not make anyone a recruiter; an
 * active CompanyMember does, and that only exists once a company is actually created.
 *
 * The single side effect is stamping `onboardingCompletedAt`, so a returning user never sees this
 * screen again.
 */
export function FirstActionPage() {
  const { isAuthenticated, isLoading, user, refresh } = useAuth();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(null); // the icon key of the option being actioned
  const [error, setError] = useState(null);

  /**
   * Marks the router as seen, then routes. If the stamp fails the user is still sent on their
   * way — a bookkeeping error must not trap someone at the end of onboarding. The worst case is
   * that this screen appears once more.
   */
  async function choose(key, destination, state) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await completeOnboarding();
      await refresh().catch(() => {});
    } catch (apiError) {
      setError(apiError.message ?? null);
    } finally {
      setBusy(null);
      navigate(destination, state ? { state } : undefined);
    }
  }

  if (isLoading) return null;

  // This step belongs to the authenticated onboarding chain (session created at AUTH-03).
  if (!isAuthenticated) return <Navigate to={PATHS.SIGN_IN} replace />;

  // Shown once, only to a user who has just finished onboarding.
  if (user?.onboardingCompletedAt) return <Navigate to={PATHS.APP_HOME} replace />;

  return (
    <div>
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">
          What would you like to do first?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600">
          One account covers all of it. Pick a starting point — you can do the others whenever you
          like, and nothing here locks you into a single role.
        </p>
      </header>

      {error && (
        <StatusRegion tone="error" className="mx-auto mb-6 max-w-xl">
          {error}
        </StatusRegion>
      )}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <FirstActionChoice
          icon="user"
          title="Create a candidate profile"
          description="Show your teaching experience, subjects, and availability so education businesses can find and contact you."
          cta="Create candidate profile"
          disabled={Boolean(busy)}
          onSelect={() => choose('user', PATHS.APP_HOME, { intent: 'candidate' })}
        />

        <FirstActionChoice
          icon="building"
          title="Create a company"
          description="Set up your organisation's public page, mark yourself as hiring, and start receiving interest from educators."
          cta="Create company"
          disabled={Boolean(busy)}
          onSelect={() => choose('building', PATHS.APP_HOME, { intent: 'company' })}
        />

        <FirstActionChoice
          icon="compass"
          title="Explore first"
          description="Browse education businesses already on Evallo Recruit. Decide later — your account stays exactly as it is."
          cta="Browse companies"
          disabled={Boolean(busy)}
          onSelect={() => choose('compass', PATHS.COMPANY_DIRECTORY)}
        />
      </ul>

      <p className="mt-8 text-center text-xs text-gray-400">
        Choosing an option here sets up nothing on its own — it just takes you to the right place.
      </p>
    </div>
  );
}
