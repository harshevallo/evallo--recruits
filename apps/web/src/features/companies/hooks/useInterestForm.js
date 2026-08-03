import { useCallback, useEffect, useState } from 'react';
import { publicInterestSchema, interestDefaults } from '@evallo/shared';
import { submitCompanyInterest } from '@/services';

/**
 * Expression-of-interest form state — PUB-02 (PRD §8.7).
 *
 * Validates with the SAME Zod schema the server enforces (ADR-009).
 */
export function useInterestForm({ slug, defaultIntentId, onSuccess }) {
  const [values, setValues] = useState({
    ...interestDefaults,
    hiringIntentId: defaultIntentId ?? '',
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState(null);

  // Reflect the role the visitor clicked from.
  useEffect(() => {
    setValues((current) => ({ ...current, hiringIntentId: defaultIntentId ?? '' }));
  }, [defaultIntentId]);

  const setField = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setValues({ ...interestDefaults, hiringIntentId: defaultIntentId ?? '' });
    setErrors({});
    setStatus('idle');
    setMessage(null);
  }, [defaultIntentId]);

  async function handleSubmit(event) {
    event.preventDefault();

    // An empty select means general company interest — omit rather than send "".
    const payload = {
      ...values,
      message: values.message || undefined,
      hiringIntentId: values.hiringIntentId || undefined,
    };

    const parsed = publicInterestSchema.safeParse(payload);

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
      await submitCompanyInterest(slug, parsed.data);

      setStatus('success');
      // Repeat submissions are reported identically — the company sees it exactly once either way.
      setMessage('Your interest has been shared with this company.');
      onSuccess?.();
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
    isSuccess: status === 'success',
    setField,
    handleSubmit,
    reset,
  };
}
