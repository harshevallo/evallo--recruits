import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { RESEND_COOLDOWN_SECONDS } from '@evallo/shared';
import { Button, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useCountdown } from '@/features/auth/hooks/useCountdown';
import { resendVerification } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/** The pending email travels via router state, falling back to sessionStorage across reloads. */
function usePendingEmail() {
  const location = useLocation();
  return location.state?.email ?? sessionStorage.getItem('pendingVerificationEmail') ?? null;
}

/**
 * Masks the local part — PRD §6.2 (AUTH-02) asks for a masked address, so the screen confirms
 * which account is pending without displaying the full address on a shared screen.
 * `sarah.jenkins@example.com` → `sa••••••••ns@example.com`
 */
function maskEmail(address) {
  const [local, domain] = String(address).split('@');
  if (!domain) return address;
  if (local.length <= 2) return `${local[0] ?? ''}•@${domain}`;
  if (local.length <= 4) return `${local[0]}${'•'.repeat(local.length - 1)}@${domain}`;
  return `${local.slice(0, 2)}${'•'.repeat(local.length - 4)}${local.slice(-2)}@${domain}`;
}

/** Deep link to the recipient's webmail where we can recognise the provider. */
function emailAppUrl(address) {
  const domain = String(address).split('@')[1]?.toLowerCase();
  const known = {
    'gmail.com': 'https://mail.google.com/',
    'googlemail.com': 'https://mail.google.com/',
    'outlook.com': 'https://outlook.live.com/mail/',
    'hotmail.com': 'https://outlook.live.com/mail/',
    'live.com': 'https://outlook.live.com/mail/',
    'yahoo.com': 'https://mail.yahoo.com/',
    'proton.me': 'https://mail.proton.me/',
    'protonmail.com': 'https://mail.proton.me/',
    'icloud.com': 'https://www.icloud.com/mail/',
  };
  return known[domain] ?? null;
}

/**
 * AUTH-02 — Verification Sent.
 *
 * Reached after email signup. The user is NOT authenticated (no session is created until the
 * email is verified and they sign in). The account is identified only by the email address the
 * signup carried here — never by a session.
 */
export function VerificationSentPage() {
  const email = usePendingEmail();
  const { seconds, isActive, start } = useCountdown();

  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [message, setMessage] = useState(null);

  // A verification email was just sent by signup — begin the resend cooldown on arrival.
  useEffect(() => {
    start(RESEND_COOLDOWN_SECONDS);
  }, [start]);

  // Nothing to show without a pending email (e.g. page opened directly).
  if (!email) return <Navigate to={PATHS.SIGN_UP} replace />;

  async function handleResend() {
    setStatus('sending');
    setMessage(null);
    try {
      await resendVerification(email);
      setStatus('success');
      // Privacy-safe: the server response is identical whether or not the account needs it.
      setMessage('If that account still needs verification, a new link has been sent.');
      start(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setStatus('error');
      setMessage(error.message ?? 'Could not resend the email. Please try again.');
    }
  }

  const resendDisabled = status === 'sending' || isActive;

  return (
    <AuthCard
      title="Check your email"
      footer={
        <Link to={PATHS.SIGN_IN} className="font-medium text-brand-blue hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-2xl text-brand-blue">
          <Icon name="circle-check" />
        </div>
        <p className="text-sm text-gray-600">We&apos;ve sent a verification email to</p>
        <p className="mt-1 break-all font-semibold text-brand-dark" title="Address partially hidden">
          {maskEmail(email)}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          Open the link in that email to confirm your address. You&apos;ll then choose a password
          and finish setting up your account.
        </p>
      </div>

      {message && (
        <StatusRegion tone={status === 'error' ? 'error' : 'success'} className="mb-5">
          {message}
        </StatusRegion>
      )}

      <div className="space-y-3">
        {emailAppUrl(email) && (
          <Button
            href={emailAppUrl(email)}
            variant="outlineDark"
            size="md"
            radius="lg"
            fullWidth
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            Open email app
          </Button>
        )}

        <Button
          variant="primary"
          size="md"
          radius="lg"
          fullWidth
          onClick={handleResend}
          disabled={resendDisabled}
        >
          {status === 'sending'
            ? 'Sending…'
            : isActive
              ? `Resend email (${seconds}s)`
              : 'Resend email'}
        </Button>

        <Button
          to={PATHS.CHANGE_EMAIL}
          state={{ email }}
          variant="outlineDark"
          size="md"
          radius="lg"
          fullWidth
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          Change email address
        </Button>
      </div>

      <p className="mt-5 text-center text-xs text-gray-400">
        The link expires in 24 hours. Didn&apos;t get it? Check your spam folder, or resend above.
      </p>
    </AuthCard>
  );
}
