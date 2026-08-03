import { useCallback, useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, ERROR_CODES } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput, PasswordInput, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard, AuthDivider } from '@/features/auth/components/AuthCard';
import { SocialButtons } from '@/features/auth/components/GoogleButton';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';

/** AUTH-10 — sign in with email + password (or Google). */
export function SignInPage() {
  const { isAuthenticated, isLoading, login, loginWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = location.state?.from ?? PATHS.APP_HOME;

  // Set when login is refused because the email is unverified — offers a path back to resend.
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);

  /** AUTH-03: verification redirects here with a success message and the confirmed address. */
  const justVerified = location.state?.verified === true;
  const alreadyVerified = location.state?.alreadyVerified === true;

  const form = useAuthForm({
    schema: loginSchema,
    initial: { email: location.state?.email ?? '', password: '', rememberMe: false },
    onSubmit: async (values) => {
      setUnverifiedEmail(null);
      try {
        await login(values);
        navigate(returnTo, { replace: true });
      } catch (error) {
        if (error.code === ERROR_CODES.EMAIL_NOT_VERIFIED) {
          setUnverifiedEmail(values.email);
        }
        throw error; // let the form surface the message
      }
    },
  });

  // Stable identities so the memoised SocialButtons (and the Google iframe inside it) do not
  // re-render on every keystroke in the email/password fields.
  const handleGoogle = useCallback(
    async (credential) => {
      try {
        await loginWithGoogle(credential);
        navigate(returnTo, { replace: true });
      } catch (error) {
        form.setStatus('error');
        form.setMessage(error.message ?? 'Google sign-in failed.');
      }
    },
    [loginWithGoogle, navigate, returnTo, form],
  );

  const handleSocialError = useCallback(
    (msg) => {
      form.setStatus('error');
      form.setMessage(msg);
    },
    [form],
  );

  if (!isLoading && isAuthenticated) return <Navigate to={returnTo} replace />;

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. One account for your candidate profile and every company you belong to."
      footer={
        <>
          New to Evallo Recruit?{' '}
          <Link to={PATHS.SIGN_UP} className="font-medium text-brand-blue hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {(justVerified || alreadyVerified) && (
        <StatusRegion tone="success" className="mb-6">
          {justVerified
            ? 'Your email is verified. Sign in to continue.'
            : 'Your email is already verified. Sign in to continue.'}
        </StatusRegion>
      )}

      <SocialButtons
        onGoogleCredential={handleGoogle}
        onError={handleSocialError}
        disabled={form.isSubmitting}
      />

      <AuthDivider />

      <form onSubmit={form.handleSubmit} noValidate>
        <FormField label="Email address" name="email" error={form.errors.email} required className="mb-4">
          {(field) => (
            <TextInput
              {...field}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              autoFocus
              value={form.values.email}
              onChange={(e) => form.setField('email', e.target.value)}
              disabled={form.isSubmitting}
            />
          )}
        </FormField>

        <FormField label="Password" name="password" error={form.errors.password} required className="mb-2">
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="current-password"
              placeholder="Your password"
              value={form.values.password}
              onChange={(e) => form.setField('password', e.target.value)}
              disabled={form.isSubmitting}
            />
          )}
        </FormField>

        <div className="mb-5 flex items-center justify-between gap-4">
          <Checkbox
            label="Remember me"
            name="rememberMe"
            checked={form.values.rememberMe}
            onChange={(e) => form.setField('rememberMe', e.target.checked)}
            disabled={form.isSubmitting}
          />
          <Link
            to={PATHS.FORGOT_PASSWORD}
            className="whitespace-nowrap text-sm font-medium text-brand-blue hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={form.isSubmitting}>
          {form.isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        {form.message && form.status === 'error' && (
          <StatusRegion tone="error" className="mt-4">
            {form.message}
            {unverifiedEmail && (
              <>
                {' '}
                <Link
                  to={PATHS.VERIFICATION_SENT}
                  state={{ email: unverifiedEmail }}
                  className="font-medium underline"
                  onClick={() =>
                    sessionStorage.setItem('pendingVerificationEmail', unverifiedEmail)
                  }
                >
                  Resend verification email
                </Link>
                .
              </>
            )}
          </StatusRegion>
        )}
      </form>
    </AuthCard>
  );
}
