import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { common } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { changeEmail } from '@/services/auth.api';
import { PATHS } from '@/router/paths';

/**
 * AUTH-02 — Change Email (pre-verification).
 *
 * The user is not authenticated here (signup created no session). The account being changed is
 * identified by the current email carried from the Verification Sent screen.
 */
export function ChangeEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentEmail =
    location.state?.email ?? sessionStorage.getItem('pendingVerificationEmail') ?? null;

  // Validate only the new email; the current one is fixed context, not user input.
  const schema = useMemo(() => z.object({ email: common.email }), []);

  const form = useAuthForm({
    schema,
    initial: { email: '' },
    onSubmit: async (values) => {
      await changeEmail(currentEmail, values.email);
      // Update the stored pending email, then return to Verification Sent showing the new one.
      sessionStorage.setItem('pendingVerificationEmail', values.email);
      navigate(PATHS.VERIFICATION_SENT, { replace: true, state: { email: values.email } });
    },
  });

  if (!currentEmail) return <Navigate to={PATHS.SIGN_UP} replace />;

  return (
    <AuthCard
      title="Change your email"
      subtitle="Enter a new address and we'll send the verification link there instead."
    >
      <div className="mb-5 rounded-lg bg-brand-light p-4 text-sm">
        <span className="text-gray-500">Current email</span>
        <p className="mt-1 break-all font-medium text-brand-dark">{currentEmail}</p>
      </div>

      <form onSubmit={form.handleSubmit} noValidate>
        <FormField label="New email address" name="email" error={form.errors.email} required className="mb-5">
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

        <div className="space-y-3">
          <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Updating…' : 'Update email'}
          </Button>
          <Button
            to={PATHS.VERIFICATION_SENT}
            state={{ email: currentEmail }}
            variant="outlineDark"
            size="md"
            radius="lg"
            fullWidth
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            Cancel
          </Button>
        </div>

        {form.message && form.status === 'error' && (
          <StatusRegion tone="error" className="mt-4">
            {form.message}
          </StatusRegion>
        )}
      </form>
    </AuthCard>
  );
}
