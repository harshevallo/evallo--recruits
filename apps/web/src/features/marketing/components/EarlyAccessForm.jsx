import { Link } from 'react-router-dom';
import { EARLY_ACCESS_SEGMENT_OPTIONS } from '@evallo/shared';
import { Button } from '@/components/ui';
import { PATHS } from '@/router/paths';
import { FormField, TextInput, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useEarlyAccessForm } from '../hooks/useEarlyAccessForm';

/**
 * The only element on this page connected to the backend.
 *
 * The prototype reports the result with `alert()`; here it is announced through a live region
 * so assistive technology receives it without focus being stolen.
 */
export function EarlyAccessForm() {
  const { values, errors, status, message, isSubmitting, setField, handleSubmit } =
    useEarlyAccessForm();

  return (
    <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-left text-brand-dark shadow-2xl">
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField label="I am a..." name="segment" error={errors.segment}>
            {(field) => (
              <SelectInput
                {...field}
                options={EARLY_ACCESS_SEGMENT_OPTIONS}
                value={values.segment}
                onChange={(event) => setField('segment', event.target.value)}
                disabled={isSubmitting}
              />
            )}
          </FormField>

          <FormField label="Name" name="name" error={errors.name}>
            {(field) => (
              <TextInput
                {...field}
                type="text"
                placeholder="John Doe"
                autoComplete="name"
                value={values.name}
                onChange={(event) => setField('name', event.target.value)}
                disabled={isSubmitting}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Email Address"
          name="email"
          error={errors.email}
          className="mb-6"
        >
          {(field) => (
            <TextInput
              {...field}
              type="email"
              placeholder="john@example.com"
              autoComplete="email"
              value={values.email}
              onChange={(event) => setField('email', event.target.value)}
              disabled={isSubmitting}
            />
          )}
        </FormField>

        <Button
          type="submit"
          variant="dark"
          radius="lg"
          size="none"
          fullWidth
          disabled={isSubmitting}
          className="py-4 font-bold"
        >
          {isSubmitting ? 'Submitting…' : 'Request Early Access'}
        </Button>

        {message && (
          <StatusRegion tone={status === 'success' ? 'success' : 'error'} className="mt-4">
            {message}
          </StatusRegion>
        )}

        <p className="mt-4 text-center text-xs text-gray-500">
          By submitting, you agree to our{' '}
          <Link to={PATHS.TERMS} className="underline hover:text-brand-blue">
            terms of service
          </Link>{' '}
          and{' '}
          <Link to={PATHS.PRIVACY} className="underline hover:text-brand-blue">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
