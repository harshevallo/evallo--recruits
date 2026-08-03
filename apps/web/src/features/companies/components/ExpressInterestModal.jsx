import { ROLE_CATEGORY_LABELS } from '@evallo/shared';
import { Button, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useInterestForm } from '../hooks/useInterestForm';

function roleLabel(role) {
  if (role.title) return role.title;
  return (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c).join(', ');
}

/**
 * Express interest in a company or one of its open roles — PRD §8.7.
 *
 * Pre-authentication implementation: contact details are supplied inline. Once AUTH lands they
 * come from the candidate profile and this form collapses to role selection, note, and consent.
 */
export function ExpressInterestModal({ open, onClose, company, defaultIntentId }) {
  const form = useInterestForm({ slug: company.slug, defaultIntentId });

  const roleOptions = [
    { value: '', label: 'General interest in this company' },
    ...(company.openRoles ?? []).map((role) => ({
      value: role.id,
      label: roleLabel(role),
    })),
  ];

  function handleClose() {
    form.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Express interest in ${company.name}`}
      description={
        form.isSuccess ? undefined : 'Share your details so this company can get in touch.'
      }
    >
      {form.isSuccess ? (
        <div>
          <StatusRegion tone="success">{form.message}</StatusRegion>
          <Button variant="primary" size="md" fullWidth onClick={handleClose} className="mt-5">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit} noValidate>
          {(company.openRoles ?? []).length > 0 && (
            <FormField label="I'm interested in" name="hiringIntentId" className="mb-5">
              {(field) => (
                <SelectInput
                  {...field}
                  options={roleOptions}
                  value={form.values.hiringIntentId}
                  onChange={(event) => form.setField('hiringIntentId', event.target.value)}
                  disabled={form.isSubmitting}
                />
              )}
            </FormField>
          )}

          <FormField label="Name" name="name" error={form.errors.name} required className="mb-5">
            {(field) => (
              <TextInput
                {...field}
                type="text"
                placeholder="Your full name"
                autoComplete="name"
                value={form.values.name}
                onChange={(event) => form.setField('name', event.target.value)}
                disabled={form.isSubmitting}
              />
            )}
          </FormField>

          <FormField
            label="Email address"
            name="email"
            error={form.errors.email}
            required
            className="mb-5"
          >
            {(field) => (
              <TextInput
                {...field}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.values.email}
                onChange={(event) => form.setField('email', event.target.value)}
                disabled={form.isSubmitting}
              />
            )}
          </FormField>

          <FormField
            label="Message (optional)"
            name="message"
            error={form.errors.message}
            hint="Briefly, what makes you a good fit?"
            className="mb-5"
          >
            {(field) => (
              <Textarea
                {...field}
                placeholder="A short note for the hiring team"
                maxLength={1000}
                value={form.values.message}
                onChange={(event) => form.setField('message', event.target.value)}
                disabled={form.isSubmitting}
              />
            )}
          </FormField>

          {/* PRD §8.7 step 6 — the visitor sees exactly what the company receives. */}
          <div className="mb-5 rounded-lg bg-brand-light p-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.values.consent}
                onChange={(event) => form.setField('consent', event.target.checked)}
                disabled={form.isSubmitting}
                aria-invalid={form.errors.consent ? 'true' : undefined}
                aria-describedby={form.errors.consent ? 'consent-error' : undefined}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span>
                I agree to share my <strong>name</strong>, <strong>email address</strong>, and
                any message above with {company.name}.
              </span>
            </label>

            {form.errors.consent && (
              <p id="consent-error" className="mt-2 text-sm text-red-600">
                {form.errors.consent}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            radius="lg"
            fullWidth
            disabled={form.isSubmitting}
          >
            {form.isSubmitting ? 'Sending…' : 'Send interest'}
          </Button>

          {form.message && form.status === 'error' && (
            <StatusRegion tone="error" className="mt-4">
              {form.message}
            </StatusRegion>
          )}
        </form>
      )}
    </Modal>
  );
}
