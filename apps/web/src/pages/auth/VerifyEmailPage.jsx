import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ERROR_CODES } from '@evallo/shared';
import { Button } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { verifyEmail } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/**
 * AUTH-03 — email verification landing (the emailed link target).
 *
 * Consumes the token on mount, then redirects to Sign In with a success message. A ref guards
 * React 18 StrictMode's double-invoke so a single-use token isn't spent twice.
 *
 * The user is NOT authenticated here — verification precedes sign-in (AUTH-01 security model).
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState(token ? { status: 'verifying' } : { status: 'missing' });
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    verifyEmail(token)
      .then((data) => {
        sessionStorage.removeItem('pendingVerificationEmail');

        /**
         * PRD §6.1 step 3→4: a verified address with no credential yet continues straight to the
         * password-creation page, carrying the single-use setup token.
         */
        if (data?.needsPassword && data?.setupToken) {
          navigate(`${PATHS.SET_PASSWORD}?token=${encodeURIComponent(data.setupToken)}`, {
            replace: true,
          });
          return;
        }

        // Account already has a password (e.g. re-verifying after an email change).
        navigate(PATHS.SIGN_IN, {
          replace: true,
          state: { verified: true, email: data?.email ?? null },
        });
      })
      .catch((error) => {
        // Already verified is a success outcome for the user — send them to sign in.
        if (error.code === ERROR_CODES.ALREADY_VERIFIED) {
          sessionStorage.removeItem('pendingVerificationEmail');
          navigate(PATHS.SIGN_IN, {
            replace: true,
            state: { alreadyVerified: true },
          });
          return;
        }
        setState({ status: 'error', code: error.code, message: error.message });
      });
  }, [token, navigate]);

  if (state.status === 'verifying') {
    return (
      <AuthCard title="Verifying your email…">
        <div
          className="flex items-center gap-3 text-sm text-gray-600"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-brand-blue"
            aria-hidden="true"
          />
          One moment.
        </div>
      </AuthCard>
    );
  }

  const isExpired = state.code === ERROR_CODES.VERIFICATION_TOKEN_EXPIRED;

  return (
    <AuthCard
      title={isExpired ? 'This link has expired' : 'Verification failed'}
      footer={
        <Link to={PATHS.HOME} className="font-medium text-brand-blue hover:underline">
          Back to home
        </Link>
      }
    >
      <StatusRegion tone="error">
        {state.status === 'missing'
          ? 'This verification link is missing its token.'
          : state.message}
      </StatusRegion>

      <p className="mt-4 text-sm text-gray-600">
        {isExpired
          ? 'Verification links are valid for 24 hours. Sign in and we’ll offer to send you a new one.'
          : 'If you already verified this address, you can simply sign in.'}
      </p>

      <Button to={PATHS.SIGN_IN} variant="primary" size="md" radius="lg" fullWidth className="mt-5">
        Go to sign in
      </Button>
    </AuthCard>
  );
}
