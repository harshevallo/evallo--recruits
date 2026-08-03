import { useState } from 'react';
import { earlyAccessRequestSchema, earlyAccessDefaults } from '@evallo/shared';
import { submitEarlyAccess } from '@/services';

/**
 * State and submission for the early-access form.
 *
 * All logic lives here rather than in the component — the form component only renders and
 * forwards events (07_PROJECT_STRUCTURE.md §4.1).
 *
 * Validation uses the SAME Zod schema the server enforces (ADR-009), so the client cannot
 * accept something the API will reject.
 */
export function useEarlyAccessForm() {
  const [values, setValues] = useState(earlyAccessDefaults);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState(null);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));

    // Clear a field's error as soon as the user edits it — keeping a stale error visible while
    // someone is fixing it reads as the form being broken.
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const parsed = earlyAccessRequestSchema.safeParse(values);

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
    setErrors({});
    setMessage(null);

    try {
      await submitEarlyAccess(parsed.data);

      setStatus('success');
      // The API distinguishes a new record from a repeat submission, but the UI deliberately
      // does not — surfacing that would make this an email-enumeration oracle.
      setMessage("Thank you. You're on the list — we'll be in touch about the pilot.");
      setValues(earlyAccessDefaults);
    } catch (apiError) {
      setStatus('error');
      setErrors(apiError.details ?? {});
      setMessage(apiError.message ?? 'Something went wrong. Please try again.');
    }
  }

  return {
    values,
    errors,
    status,
    message,
    isSubmitting: status === 'submitting',
    setField,
    handleSubmit,
  };
}
