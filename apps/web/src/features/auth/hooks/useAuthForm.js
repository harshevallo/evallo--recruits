import { useCallback, useRef, useState } from 'react';

/**
 * Shared form plumbing for the auth screens: field state, Zod validation, submit lifecycle, and
 * field-keyed error mapping from either client validation or the API.
 *
 * @param {object} options
 * @param {object} options.schema        Zod schema for the whole form
 * @param {object} options.initial       Initial field values
 * @param {(values) => Promise<void>} options.onSubmit
 */
export function useAuthForm({ schema, initial, onSubmit }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [message, setMessage] = useState(null);

  /**
   * Stable across renders so child inputs don't receive a new handler on every keystroke.
   * Uses the functional setState form, so it never needs `values` as a dependency.
   */
  const setField = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  /**
   * Latest values/schema/onSubmit held in a ref so handleSubmit can stay referentially stable
   * without going stale — otherwise every keystroke would hand the <form> a new onSubmit.
   */
  const latest = useRef({ values, schema, onSubmit });
  latest.current = { values, schema, onSubmit };

  /**
   * Guards against duplicate submissions (AUTH-04).
   *
   * `status` alone is not enough: two rapid submits (double-click, or Enter held down) can both
   * run before React commits the state change. A ref flips synchronously, so the second call
   * returns immediately.
   */
  const inFlight = useRef(false);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    if (inFlight.current) return;

    const { values, schema, onSubmit } = latest.current;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setStatus('error');
      setMessage(null);
      return;
    }

    inFlight.current = true;
    setStatus('submitting');
    setErrors({});
    setMessage(null);

    try {
      await onSubmit(parsed.data);
      setStatus('success');
    } catch (apiError) {
      setStatus('error');
      setErrors(apiError.details ?? {});
      setMessage(apiError.message ?? 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  return {
    values,
    errors,
    status,
    message,
    isSubmitting: status === 'submitting',
    isSuccess: status === 'success',
    setField,
    setMessage,
    setStatus,
    handleSubmit,
  };
}
