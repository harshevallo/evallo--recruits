import { useEffect, useState } from 'react';
import { MESSAGING_LIMITS } from '@evallo/shared';
import { Button, Modal } from '@/components/ui';
import { Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { startConversation } from '@/services';

/**
 * The first message to someone (ADR-025).
 *
 * One composer for every place a conversation can begin — a recruiter on a search result or a
 * candidate's profile, a candidate on a company page's team list — so the request rules are
 * explained the same way everywhere. Whoever the recipient is, the same pair of people always lands
 * in one thread, so this also quietly CONTINUES a conversation that already exists.
 *
 * @param {object}   recipient   `{ recipientUserId }` for a listed person, or `{ candidateId }` for a
 *                               candidate reached through a company
 * @param {string}   [companyId] The company the sender is acting for — required with `candidateId`
 *                               (PRD §11.2: a first message identifies the company)
 * @param {Function} onSent      Receives the API result `{ conversationId, created, status, … }`
 */
export function StartConversationModal({
  open,
  onClose,
  recipientName,
  recipient,
  companyId,
  companyName,
  interestId,
  onSent,
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /* A fresh dialog each time it opens — a half-written message to one person must not carry over. */
  useEffect(() => {
    if (!open) return;
    setBody('');
    setError(null);
    setBusy(false);
  }, [open, recipient?.recipientUserId, recipient?.candidateId]);

  async function send(event) {
    event.preventDefault();
    if (busy || !body.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const result = await startConversation({
        ...recipient,
        companyId,
        interestId,
        body: body.trim(),
      });
      onSent?.(result);
      onClose();
    } catch (apiError) {
      setError(apiError.details?.body ?? apiError.message ?? 'We could not send that message.');
    } finally {
      setBusy(false);
    }
  }

  const firstName = recipientName?.split(' ')[0];
  const viaCompany = Boolean(companyId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Message ${firstName || 'this person'}`}
      description={
        viaCompany
          ? `They will see your name${companyName ? ` and ${companyName}` : ' and your company'} with this message. Keep it about the role.`
          : 'They will see your name with this message. Say why you are writing.'
      }
    >
      <form noValidate onSubmit={send}>
        <label htmlFor="start-conversation-body" className="mb-1.5 block text-sm font-semibold text-gray-700">
          Your message
        </label>
        <Textarea
          id="start-conversation-body"
          name="body"
          rows={5}
          maxLength={MESSAGING_LIMITS.BODY_MAX_LENGTH}
          placeholder={
            viaCompany
              ? 'Introduce your company and the role you have in mind…'
              : 'Introduce yourself and what you are looking for…'
          }
          value={body}
          disabled={busy}
          hasError={Boolean(error)}
          onChange={(event) => setBody(event.target.value)}
        />

        {/*
          A first message is a REQUEST until the other person answers, and the starter can send only
          a few before then (PRD §16.3 anti-spam). Said up front, so nobody discovers the cap by
          hitting it.
        */}
        <p className="mt-2 text-xs text-gray-500">
          This starts a message request. You can send up to{' '}
          {MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP} messages before they reply.
        </p>

        {error && (
          <StatusRegion tone="error" className="mt-4">
            {error}
          </StatusRegion>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
          <Button type="button" variant="outline" size="sm" radius="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy || !body.trim()}
          >
            {busy ? 'Sending…' : 'Send message'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
