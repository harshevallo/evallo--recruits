import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';

/**
 * CAN-04 — confirmation before blocking a company (PRD §4.3).
 *
 * Blocking is destructive to a relationship, so it is confirmed rather than done on one click.
 *
 * Every line of copy below is something `candidateAccess.service` actually enforces, verified
 * against the call sites: search excludes the candidate inside the query
 * (`searchableCandidateFilter`), the viewer and the pipeline refuse with "Candidate not found",
 * and company messaging resolves the same access before sending or listing a thread. Nothing
 * further is claimed — messages already delivered are not withdrawn, because no code does that,
 * and a promise the product does not keep is worse than no promise.
 */
export function BlockCompanyModal({ open, onClose, companyName, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (apiError) {
      setError(apiError.message ?? 'We could not block that company. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Block ${companyName}?`}
      description="They will no longer be able to find or open your profile."
    >
      <div className="space-y-4">
        <ul className="space-y-2 text-sm text-gray-600">
          <li>· This company will not see you in candidate search.</li>
          <li>· They cannot open your profile, whatever your visibility setting is.</li>
          <li>· They cannot send you new messages.</li>
          <li>· They are not told that you blocked them.</li>
          <li>· You can unblock them at any time from Privacy settings.</li>
        </ul>

        {error && <StatusRegion tone="error">{error}</StatusRegion>}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="button" variant="dark" size="md" radius="lg" disabled={busy} onClick={confirm}>
            {busy ? 'Blocking…' : 'Block company'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
