import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button } from '@/components/ui';
import { TextInput, Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import {
  searchCompanies,
  requestToJoinCompany,
  fetchMyJoinRequests,
  withdrawJoinRequest,
} from '@/services';

/**
 * REC-01 — find the company you work at and ask to join it (PRD §7.2).
 *
 * Searching is server-side and debounced. It is never filtered in the browser: the result set is
 * bounded by the server, and which companies may be seen at all is a privacy decision that only the
 * server can make.
 *
 * Joining is a REQUEST, not a self-grant. The company's owner or admin approves it and chooses the
 * role — so this component can never produce a membership on its own, which is what keeps the
 * permission model (ADR-001) intact.
 */

/** How each row's action is labelled, given what the caller already has with that company. */
const RELATIONSHIP = {
  member: { label: 'You are a member', tone: 'successLight' },
  invited: { label: 'Invitation waiting', tone: 'neutral' },
  requested: { label: 'Request pending', tone: 'neutral' },
};

export function CompanyJoinSearch({ onJoined }) {
  const [term, setTerm] = useState('');
  const [state, setState] = useState({ status: 'idle', companies: [] });
  const [asking, setAsking] = useState(null); // the company row being asked about
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [mine, setMine] = useState([]);

  const debounce = useRef(null);
  const controllerRef = useRef(null);

  const loadMine = useCallback(async () => {
    try {
      const data = await fetchMyJoinRequests();
      setMine(data.requests ?? []);
    } catch {
      // A failure here only hides the pending list; it must not break searching.
      setMine([]);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  /* Debounced server search. Two characters is the server's own floor, mirrored to avoid a
     request that is guaranteed to return nothing. */
  useEffect(() => {
    controllerRef.current?.abort();
    window.clearTimeout(debounce.current);

    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setState({ status: 'idle', companies: [] });
      return undefined;
    }

    setState((current) => ({ ...current, status: 'searching' }));

    debounce.current = window.setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;

      searchCompanies(trimmed, { signal: controller.signal })
        .then((data) => setState({ status: 'ready', companies: data.companies ?? [] }))
        .catch((error) => {
          if (controller.signal.aborted || error.name === 'CanceledError') return;
          setState({ status: 'error', companies: [], message: error.message });
        });
    }, 300);

    return () => window.clearTimeout(debounce.current);
  }, [term]);

  async function submitRequest() {
    if (!asking || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await requestToJoinCompany(asking.id, { message: message.trim() || null });
      setAsking(null);
      setMessage('');
      setFeedback({
        tone: 'success',
        text: `Request sent to ${asking.name}. Someone who manages the company will review it.`,
      });
      // Reflect the new state in both the row and the pending list.
      setState((current) => ({
        ...current,
        companies: current.companies.map((company) =>
          company.id === asking.id ? { ...company, relationship: 'requested' } : company,
        ),
      }));
      await loadMine();
      onJoined?.();
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.companyId ?? error.message ?? 'We could not send that request.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(request) {
    setBusy(true);
    try {
      await withdrawJoinRequest(request.id);
      setFeedback({ tone: 'success', text: `Withdrew your request to ${request.company?.name}.` });
      await loadMine();
      setState((current) => ({
        ...current,
        companies: current.companies.map((company) =>
          company.id === request.company?.id ? { ...company, relationship: 'none' } : company,
        ),
      }));
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not withdraw that.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-4">
          {feedback.text}
        </StatusRegion>
      )}

      {/* Outstanding asks, so a pending request does not disappear the moment the search clears. */}
      {mine.length > 0 && (
        <ul className="mb-5 space-y-2">
          {mine.map((request) => (
            <li
              key={request.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-slate-50/60 p-3"
            >
              <p className="min-w-0 text-sm text-gray-700">
                <span className="font-semibold text-brand-dark">{request.company?.name}</span> —
                awaiting approval
              </p>
              <button
                type="button"
                onClick={() => withdraw(request)}
                disabled={busy}
                className="flex-none text-xs font-semibold text-gray-500 transition-colors hover:text-red-600"
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor="company-search" className="mb-1.5 block text-sm font-semibold text-gray-700">
        Search for your company
      </label>
      <TextInput
        id="company-search"
        name="company-search"
        type="search"
        autoComplete="off"
        placeholder="Start typing a company name…"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <p className="mt-1 text-xs text-gray-500">
        Only companies that have published their page can be found here.
      </p>

      <div aria-live="polite" className="mt-4">
        {state.status === 'searching' && <p className="text-sm text-gray-500">Searching…</p>}

        {state.status === 'error' && (
          <StatusRegion tone="error">{state.message ?? 'Search failed.'}</StatusRegion>
        )}

        {state.status === 'ready' && state.companies.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-5 text-center">
            <p className="text-sm font-semibold text-brand-dark">No published company matches</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-gray-600">
              If a colleague has created it but not published it yet, ask them to invite this email
              address. Otherwise create it below.
            </p>
          </div>
        )}

        {state.status === 'ready' && state.companies.length > 0 && (
          <ul className="space-y-2">
            {state.companies.map((company) => {
              const known = RELATIONSHIP[company.relationship];
              return (
                <li
                  key={company.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                >
                  <Avatar
                    src={company.logoUrl ?? undefined}
                    initials={company.initials}
                    size="sm"
                    shape="square"
                    alt=""
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-brand-dark">{company.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {[company.location?.city, company.location?.country]
                        .filter(Boolean)
                        .join(', ') || 'Location not shared'}
                    </p>
                  </div>

                  {known ? (
                    <Badge tone={known.tone} size="sm" radius="full">
                      {known.label}
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="outlineDark"
                      size="sm"
                      radius="lg"
                      className="flex-none !border-gray-300 !text-brand-dark hover:!bg-gray-50"
                      onClick={() => {
                        setAsking(company);
                        setMessage('');
                        setFeedback(null);
                      }}
                    >
                      Ask to join
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The ask itself. Inline rather than a modal — it is one optional field. */}
      {asking && (
        <div className="mt-4 rounded-xl border border-brand-blue/30 bg-blue-50/30 p-4">
          <p className="text-sm font-semibold text-brand-dark">Ask to join {asking.name}</p>
          <p className="mt-1 text-xs text-gray-600">
            Someone who manages this company approves the request and chooses your role. You will not
            have access until they do.
          </p>

          <label htmlFor="join-message" className="mt-3 mb-1.5 block text-sm font-semibold text-gray-700">
            Add a note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <Textarea
            id="join-message"
            name="join-message"
            rows={3}
            maxLength={500}
            placeholder="Tell them who you are, so they can recognise you."
            value={message}
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
          />

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              onClick={() => setAsking(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              radius="lg"
              disabled={busy}
              onClick={submitRequest}
            >
              {busy ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
