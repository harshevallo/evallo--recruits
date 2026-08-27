import { ROLE_CATEGORY_LABELS, EMPLOYMENT_TYPE_LABELS, DELIVERY_MODE_LABELS } from '@evallo/shared';
import { Button, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useInterestForm } from '../hooks/useInterestForm';

function roleLabel(role) {
  if (role.title?.trim()) return role.title;
  const categories = (role.roleCategories ?? []).map((c) => ROLE_CATEGORY_LABELS[c] ?? c);
  return categories.length > 0 ? categories.join(' · ') : 'Open role';
}

/** "Part-time · Remote" — the second line of a role option. */
function roleSubLabel(role) {
  const employment = (role.employmentTypes ?? []).map((t) => EMPLOYMENT_TYPE_LABELS[t] ?? t);
  const delivery = (role.deliveryModes ?? []).map((m) => DELIVERY_MODE_LABELS[m] ?? m);
  return [...employment, ...delivery].join(' · ');
}

/**
 * One selectable role, drawn as the reference's bordered card.
 *
 * A RADIO, not the reference's checkbox. The reference lets a candidate tick several roles at
 * once; `publicInterestSchema` carries a single optional `hiringIntentId`, and one interest
 * record means one intent all the way through to the recruiter's inbox (REC-11) and the
 * candidate's own list. Drawing checkboxes over a single-value contract would let someone tick
 * three roles and silently submit one — so the control matches what the submission can actually
 * express. Multi-role interest is a real change to the interest record, not a change to this file.
 */
function RoleOption({ value, label, subLabel, checked, disabled, onChange }) {
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked ? 'border-brand-blue bg-brand-blue/5' : 'border-gray-200 hover:bg-gray-50'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="radio"
        name="hiringIntentId"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-brand-blue focus:ring-brand-blue"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-brand-dark">{label}</span>
        {subLabel && <span className="mt-1 block text-xs text-gray-500">{subLabel}</span>}
      </span>
    </label>
  );
}

/**
 * Express interest in a company or one of its open roles — PRD §8.7.
 *
 * Pre-authentication implementation: contact details are supplied inline. Once AUTH lands they
 * come from the candidate profile and this form collapses to role selection, note, and consent.
 *
 * ── Consent is a checkbox, not a notice ───────────────────────────────────────────────────────
 *
 * The reference renders the privacy block as read-only text — submitting implies agreement. This
 * keeps the reference's panel treatment but keeps the real checkbox inside it, because
 * `publicInterestSchema` requires `consent: true` and PRD §8.7 step 6 wants the visitor to see and
 * accept exactly what the company receives. An implied consent would also be a claim the server
 * cannot evidence later.
 */
export function ExpressInterestModal({ open, onClose, company, defaultIntentId }) {
  const form = useInterestForm({ slug: company.slug, defaultIntentId });
  const openRoles = company.openRoles ?? [];

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
          {openRoles.length > 0 && (
            <fieldset className="mb-5">
              <legend className="mb-2 block text-sm font-semibold text-gray-700">
                Which role are you interested in?
              </legend>

              <div className="space-y-2">
                {openRoles.map((role) => (
                  <RoleOption
                    key={role.id}
                    value={role.id}
                    label={roleLabel(role)}
                    subLabel={roleSubLabel(role)}
                    checked={form.values.hiringIntentId === role.id}
                    disabled={form.isSubmitting}
                    onChange={(value) => form.setField('hiringIntentId', value)}
                  />
                ))}

                {/*
                  Last, and always present. It is the fallback rather than the headline — a visitor
                  who arrived by clicking Apply on a specific role should not have to re-pick it,
                  and `defaultIntentId` has already selected that one above.
                */}
                <RoleOption
                  value=""
                  label="General interest in this company"
                  subLabel="Not tied to a specific role"
                  checked={!form.values.hiringIntentId}
                  disabled={form.isSubmitting}
                  onChange={(value) => form.setField('hiringIntentId', value)}
                />
              </div>
            </fieldset>
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
            label="Add a brief note (optional)"
            name="message"
            error={form.errors.message}
            hint="Briefly, what makes you a good fit?"
            className="mb-5"
          >
            {(field) => (
              <Textarea
                {...field}
                rows={4}
                placeholder="Hi team, I have five years of experience preparing students for the digital SAT…"
                maxLength={1000}
                value={form.values.message}
                onChange={(event) => form.setField('message', event.target.value)}
                disabled={form.isSubmitting}
              />
            )}
          </FormField>

          {/* PRD §8.7 step 6 — the visitor sees exactly what the company receives. */}
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.values.consent}
                onChange={(event) => form.setField('consent', event.target.checked)}
                disabled={form.isSubmitting}
                aria-invalid={form.errors.consent ? 'true' : undefined}
                aria-describedby={form.errors.consent ? 'consent-error' : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
              />
              <span className="text-xs leading-relaxed text-gray-600">
                <span className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-brand-dark">
                  <Icon name="shield-halved" className="text-brand-blue" /> Privacy consent
                </span>
                I agree to share my <strong>name</strong>, <strong>email address</strong>, and any
                note above with {company.name}. Nothing else about me is sent.
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
