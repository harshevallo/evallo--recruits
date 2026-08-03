import { useState } from 'react';
import { z } from 'zod';
import { common, ORGANIZATION_TYPE_OPTIONS } from '@evallo/shared';
import { Button } from '@/components/ui';
import { FormField, TextInput, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { createCompany } from '@/services';

const schema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(120),
  organizationType: z.string().min(1, 'Choose an organization type'),
  country: common.countryCode,
});

/**
 * Create a company.
 *
 * The creator becomes its owner via a CompanyMember row. Nothing on their User document
 * changes — they can already be a candidate, and can create more companies afterwards.
 */
export function CreateCompanyForm({ onCreated }) {
  const [values, setValues] = useState({
    name: '',
    organizationType: ORGANIZATION_TYPE_OPTIONS[0].value,
    country: '',
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState(null);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      setStatus('error');
      setMessage('Please correct the highlighted fields.');
      return;
    }

    setStatus('submitting');
    setMessage(null);

    try {
      const company = await createCompany({
        name: parsed.data.name,
        organizationType: parsed.data.organizationType,
        location: { country: parsed.data.country },
      });

      setStatus('success');
      setMessage(`${company.name} created — you are its owner.`);
      setValues({ name: '', organizationType: ORGANIZATION_TYPE_OPTIONS[0].value, country: '' });
      await onCreated?.();
    } catch (error) {
      setStatus('error');
      setErrors(error.details ?? {});
      setMessage(error.message ?? 'Could not create the company.');
    }
  }

  const isSubmitting = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormField label="Company name" name="name" error={errors.name} required className="mb-4">
        {(field) => (
          <TextInput
            {...field}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="Seven Square Learning"
            disabled={isSubmitting}
          />
        )}
      </FormField>

      <FormField
        label="Organization type"
        name="organizationType"
        error={errors.organizationType}
        required
        className="mb-4"
      >
        {(field) => (
          <SelectInput
            {...field}
            options={ORGANIZATION_TYPE_OPTIONS}
            value={values.organizationType}
            onChange={(event) => setField('organizationType', event.target.value)}
            disabled={isSubmitting}
          />
        )}
      </FormField>

      <FormField
        label="Country"
        name="country"
        error={errors.country ?? errors['location.country']}
        hint="Two-letter code, e.g. US, IN, GB"
        required
        className="mb-5"
      >
        {(field) => (
          <TextInput
            {...field}
            value={values.country}
            onChange={(event) => setField('country', event.target.value.toUpperCase())}
            placeholder="US"
            maxLength={2}
            disabled={isSubmitting}
          />
        )}
      </FormField>

      <Button type="submit" variant="primary" size="md" radius="lg" fullWidth disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create company'}
      </Button>

      {message && (
        <StatusRegion tone={status === 'success' ? 'success' : 'error'} className="mt-4">
          {message}
        </StatusRegion>
      )}
    </form>
  );
}
