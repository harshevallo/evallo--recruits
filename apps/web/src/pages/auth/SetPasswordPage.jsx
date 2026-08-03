import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { setPasswordSchema } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, PasswordInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { useAuth } from '@/context/AuthContext';
import { setPassword } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/**
 * AUTH-03 — Set password.
 *
 * Reached only after the email link is opened, carrying the single-use setup token that proves
 * ownership. This is the first point at which a credential exists for the account (PRD §6.1
 * step 4), and it establishes the session that carries onboarding through to the workspace.
 */
export function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { adoptSession } = useAuth();

  const token = searchParams.get('token') ?? '';

  const form = useAuthForm({
    schema: setPasswordSchema,
    initial: { token, password: '', confirmPassword: '' },
    onSubmit: async (values) => {
      const user = await setPassword(values);
      await adoptSession(user);
      // Continue to AUTH-04.
      navigate(PATHS.BASIC_SETUP, { replace: true });
    },
  });

  // No token means this page was opened directly; there is nothing to authorise the change.
  if (!token) return <Navigate to={PATHS.SIGN_IN} replace />;

  return (
    <AuthCard
      title="Choose a password"
      subtitle="Your email is confirmed. Set a password to finish creating your account."
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <FormField
          label="Password"
          name="password"
          error={form.errors.password}
          required
          className="mb-4"
        >
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              showStrength
              autoFocus
              value={form.values.password}
              onChange={(e) => form.setField('password', e.target.value)}
              disabled={form.isSubmitting}
            />
          )}
        </FormField>

        <FormField
          label="Confirm password"
          name="confirmPassword"
          error={form.errors.confirmPassword}
          required
          className="mb-5"
        >
          {(field) => (
            <PasswordInput
              {...field}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={form.values.confirmPassword}
              onChange={(e) => form.setField('confirmPassword', e.target.value)}
              disabled={form.isSubmitting}
            />
          )}
        </FormField>

        <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={form.isSubmitting}>
          {form.isSubmitting ? 'Saving…' : 'Continue'}
        </Button>

        {form.message && form.status === 'error' && (
          <StatusRegion tone="error" className="mt-4">
            {form.message}
          </StatusRegion>
        )}
      </form>
    </AuthCard>
  );
}
