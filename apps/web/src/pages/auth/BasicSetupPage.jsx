import { Navigate, useNavigate } from 'react-router-dom';
import { basicSetupSchema } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { useAuth } from '@/context/AuthContext';
import { updateCurrentUser } from '@/services/users.api';
import { PATHS } from '@/router/paths';

/**
 * AUTH-04 — Basic personal setup.
 *
 * Full name only. PRD §6.1 step 5 defers the photo, location/time zone, and headline, so nothing
 * else is asked here. Reuses PATCH /api/me — no new endpoint.
 */
export function BasicSetupPage() {
  const { isAuthenticated, isLoading, user, refresh } = useAuth();
  const navigate = useNavigate();

  const form = useAuthForm({
    schema: basicSetupSchema,
    initial: { name: user?.name ?? '' },
    onSubmit: async (values) => {
      await updateCurrentUser({ name: values.name });
      await refresh().catch(() => {});
      // Continue to AUTH-05, the last step of the sign-up chain (PRD §6.1).
      navigate(PATHS.FIRST_ACTION, { replace: true });
    },
  });

  if (isLoading) return null;
  // This step requires the session created by AUTH-03.
  if (!isAuthenticated) return <Navigate to={PATHS.SIGN_IN} replace />;

  return (
    <AuthCard
      title="What should we call you?"
      subtitle="Add your name so recruiters and teammates can recognise you. You can add a photo and more details later."
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <FormField label="Full name" name="name" error={form.errors.name} required className="mb-5">
          {(field) => (
            <TextInput
              {...field}
              type="text"
              autoComplete="name"
              placeholder="Sarah Jenkins"
              autoFocus
              value={form.values.name}
              onChange={(e) => form.setField('name', e.target.value)}
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
