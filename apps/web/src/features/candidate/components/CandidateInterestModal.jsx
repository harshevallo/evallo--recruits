import { useEffect, useState } from 'react';
import { Button, Icon, Modal } from '@/components/ui';
import { Checkbox, Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { fetchConsentDisclosure } from '@/services';

/**
 * CAN-07 — interest submission (PRD §8.7 steps 4–6).
 *
 * Role selection, an optional note, and consent.
 *
 * The consent step is the important one. PRD §8.7 step 6 requires the candidate to see **exactly
 * which profile sections and contact details the company will access** — so the disclosure is
 * fetched from the server, built from the candidate's own visibility settings, rather than being
 * hard-coded copy that could quietly drift from what actually happens.
 */
export function CandidateInterestModal({ open, onClose, company, roles = [], onSubmitted }) {
  const [hiringIntentId, setHiringIntentId] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [disclosure, setDisclosure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    fetchConsentDisclosure({ signal: controller.signal })
      .then(setDisclosure)
      .catch(() => setDisclosure(null));

    return () => controller.abort();
  }, [open]);

  // Reset between openings so a previous attempt never leaks into the next.
  useEffect(() => {
    if (open) return;
    setHiringIntentId('');
    setMessage('');
    setConsent(false);
    setError(null);
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmitted({
        hiringIntentId: hiringIntentId || undefined,
        message: message.trim() || undefined,
        consent: true,
      });
    } catch (apiError) {
      setError(
        apiError.details?.profile ??
          apiError.message ??
          'We could not submit your interest. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Express interest in ${company?.name ?? 'this company'}`}
      description="Share your profile so they can consider you."
    >
      <form onSubmit={handleSubmit} noValidate>
        {/* PRD §8.7 step 4 — one or more active role intents, or general interest. */}
        <fieldset className="mb-5">
          <legend className="mb-2 block text-sm font-medium text-gray-700">
            What are you interested in?
          </legend>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm">
              <input
                type="radio"
                name="interest-scope"
                value=""
                checked={hiringIntentId === ''}
                onChange={() => setHiringIntentId('')}
                className="mt-0.5 h-4 w-4 text-brand-blue focus:ring-brand-blue"
              />
              <span>
                <span className="block font-medium text-brand-dark">General interest</span>
                <span className="block text-xs text-gray-500">
                  You are open to hearing about anything suitable.
                </span>
              </span>
            </label>

            {roles.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm"
              >
                <input
                  type="radio"
                  name="interest-scope"
                  value={role.id}
                  checked={hiringIntentId === role.id}
                  onChange={() => setHiringIntentId(role.id)}
                  className="mt-0.5 h-4 w-4 text-brand-blue focus:ring-brand-blue"
                />
                <span className="font-medium text-brand-dark">{role.title}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* PRD §8.7 step 5 — optional short note. */}
        <div className="mb-5">
          <label htmlFor="interest-message" className="mb-2 block text-sm font-medium text-gray-700">
            Add a note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <Textarea
            id="interest-message"
            name="message"
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything you would like them to know."
          />
        </div>

        {/* PRD §8.7 step 6 — exactly what they will receive. */}
        {disclosure && (
          <div className="mb-5 rounded-lg bg-blue-50 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-900">
              <Icon name="shield-halved" className="text-xs" />
              What this company will see
            </p>
            <ul className="ml-1 space-y-1 text-sm text-blue-900">
              {disclosure.shares.map((line) => (
                <li key={line}>· {line}</li>
              ))}
              <li>· {disclosure.contact}</li>
              <li>· {disclosure.grants}</li>
            </ul>
          </div>
        )}

        <Checkbox
          className="mb-5"
          label="I agree to share my profile with this company"
          description="You can withdraw at any time from Shortlisted companies, which removes their access."
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />

        {error && (
          <StatusRegion tone="error" className="mb-5">
            {error}
          </StatusRegion>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          radius="lg"
          fullWidth
          disabled={!consent || busy}
        >
          {busy ? 'Submitting…' : 'Submit interest'}
        </Button>
      </form>
    </Modal>
  );
}
