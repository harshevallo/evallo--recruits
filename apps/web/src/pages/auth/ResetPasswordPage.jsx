import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { resetPasswordSchema } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, PasswordInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { resetPassword } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/** AUTH-12 — set a new password from a reset link. Token comes from the URL. */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const form = useAuthForm({
    schema: resetPasswordSchema,
    initial: { token, password: '' },
    onSubmit: async (values) => {
      await resetPassword(values.token, values.password);
    },
  });

  if (!token) {
    return (
      <AuthCard title="Invalid reset link">
        <StatusRegion tone="error">
          This password reset link is missing its token. Request a new one.
        </StatusRegion>
        <Button to={PATHS.FORGOT_PASSWORD} variant="primary" size="md" fullWidth className="mt-5">
          Request a new link
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Enter a new password for your account."
      footer={
        <Link to={PATHS.SIGN_IN} className="font-medium text-brand-blue hover:underline">
          Back to sign in
        </Link>
      }
    >
      {form.isSuccess ? (
        <div>
          <StatusRegion tone="success">
            Your password has been reset. You can sign in with it now.
          </StatusRegion>
          <Button
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            onClick={() => navigate(PATHS.SIGN_IN, { replace: true })}
          >
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit} noValidate>
          <FormField label="New password" name="password" error={form.errors.password} required className="mb-5">
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

          <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>

          {form.message && form.status === 'error' && (
            <StatusRegion tone="error" className="mt-4">
              {form.message}
            </StatusRegion>
          )}
        </form>
      )}
    </AuthCard>
  );
}
