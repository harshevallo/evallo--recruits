import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { restoreAccount } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/**
 * Cancels a pending account deletion — the target of the emailed restore link
 * (`16_RETENTION_POLICY.md` §2).
 *
 * This screen exists because the deletion lock-out is deliberately total: both sign-in paths
 * refuse a `deletion_pending` account, so the owner cannot log in to change their mind, and cannot
 * discover the request at all if someone else made it. The emailed token is the only way back.
 *
 * It does NOT sign the user in. Proving control of the mailbox reverses the request; signing in
 * afterwards is a separate act with its own password check, so this page can never become a
 * passwordless back door.
 *
 * The `attempted` ref guards React 18 StrictMode's double-invoke, which would otherwise spend the
 * single-use token twice and show a spurious "already used" error.
 */
export function RestoreAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState(token ? { status: 'restoring' } : { status: 'missing' });
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    restoreAccount(token)
      .then(() => setState({ status: 'restored' }))
      .catch((error) =>
        setState({
          status: 'error',
          message:
            error.message ?? 'This restore link is not valid. It may have expired or been used.',
        }),
      );
  }, [token]);

  if (state.status === 'restoring') {
    return (
      <AuthCard title="Restoring your account" subtitle="One moment.">
        <div role="status" aria-live="polite" className="text-sm text-gray-600">
          Checking your restore link…
        </div>
      </AuthCard>
    );
  }

  if (state.status === 'restored') {
    return (
      <AuthCard
        title="Your account is back"
        subtitle="The deletion request has been cancelled and nothing was removed."
      >
        <StatusRegion tone="success">
          Your profile and your data are intact. Sign in to pick up where you left off.
        </StatusRegion>

        <Button to={PATHS.SIGN_IN} variant="primary" size="md" radius="lg" className="mt-6 w-full">
          Sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={state.status === 'missing' ? 'Restore link missing' : 'We could not restore it'}
      subtitle="Use the link exactly as it appears in the email we sent you."
    >
      <StatusRegion tone="error">
        {state.status === 'missing'
          ? 'This page needs the restore link from your email.'
          : state.message}
      </StatusRegion>

      <p className="mt-6 text-sm text-gray-600">
        If the grace period has already passed, the account and its data are gone and cannot be
        brought back. You are welcome to{' '}
        <Link to={PATHS.SIGN_UP} className="font-medium text-brand-blue hover:underline">
          create a new account
        </Link>
        .
      </p>

      <Button
        to={PATHS.SIGN_IN}
        variant="outlineDark"
        size="md"
        radius="lg"
        className="mt-6 w-full !border-gray-300 !text-brand-dark hover:!bg-gray-50"
      >
        Back to sign in
      </Button>
    </AuthCard>
  );
}
