import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { forgotPassword } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/**
 * AUTH-11 — request a password reset.
 *
 * The response is identical whether or not the account exists (privacy-safe, PRD §6.3), so the
 * success state never confirms an email is registered.
 */
export function ForgotPasswordPage() {
  const form = useAuthForm({
    schema: forgotPasswordSchema,
    initial: { email: '' },
    onSubmit: (values) => forgotPassword(values.email),
  });

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      footer={
        <Link to={PATHS.SIGN_IN} className="font-medium text-brand-blue hover:underline">
          Back to sign in
        </Link>
      }
    >
      {form.isSuccess ? (
        <StatusRegion tone="success">
          If an account exists for that email, a reset link is on its way. Check your inbox and
          spam folder.
        </StatusRegion>
      ) : (
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
            {form.isSubmitting ? 'Sending…' : 'Send reset link'}
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
