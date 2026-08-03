import { useCallback } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { signupSchema } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard, AuthDivider } from '@/features/auth/components/AuthCard';
import { SocialButtons } from '@/features/auth/components/GoogleButton';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { useAuth } from '@/context/AuthContext';
import { PATHS } from '@/router/paths';

/**
 * AUTH-01 — Create account.
 *
 * Email ONLY. PRD §6.2 and §21.1 forbid asking for a password, a name, a role, or company
 * details here. The password comes after verification (AUTH-03), the name after that (AUTH-04).
 */
export function SignUpPage() {
  const { isAuthenticated, isLoading, signup, loginWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = location.state?.from ?? PATHS.APP_HOME;

  const form = useAuthForm({
    schema: signupSchema,
    initial: { email: '' },
    onSubmit: async (values) => {
      await signup(values);
      // Signup never authenticates — continue to AUTH-02.
      sessionStorage.setItem('pendingVerificationEmail', values.email);
      navigate(PATHS.VERIFICATION_SENT, { replace: true, state: { email: values.email } });
    },
  });

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
      title="Create your account"
      subtitle="Start with your email — we'll send you a link to confirm it. One account covers your candidate profile and every company you join."
      footer={
        <>
          Already have an account?{' '}
          <Link to={PATHS.SIGN_IN} className="font-medium text-brand-blue hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SocialButtons
        onGoogleCredential={handleGoogle}
        onError={handleSocialError}
        disabled={form.isSubmitting}
      />

      <AuthDivider />

      <form onSubmit={form.handleSubmit} noValidate>
        <FormField label="Email address" name="email" error={form.errors.email} required className="mb-5">
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

        <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={form.isSubmitting}>
          {form.isSubmitting ? 'Sending…' : 'Send verification link'}
        </Button>

        {form.message && form.status === 'error' && (
          <StatusRegion tone="error" className="mt-4">
            {form.message}
          </StatusRegion>
        )}
      </form>

      <p className="mt-4 text-center text-xs text-gray-400">
        By continuing you agree to our{' '}
        <Link to={PATHS.TERMS} className="underline hover:text-brand-blue">terms</Link> and{' '}
        <Link to={PATHS.PRIVACY} className="underline hover:text-brand-blue">privacy policy</Link>.
      </p>
    </AuthCard>
  );
}
