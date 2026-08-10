import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Container } from '@/components/ui';
import { Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { useCompany } from '@/context/CompanyContext';
import {
  fetchCompanyConversations,
  fetchCompanyConversation,
  sendCompanyReply,
} from '@/services';

/**
 * REC-15 messages — company side (PRD §7.6, §11.2).
 *
 * The same threads CAN-09 shows the candidate, from the other end. A conversation belongs to the
 * COMPANY rather than to the recruiter who started it (05_DATABASE_SCHEMA §9), so every member with
 * the permission sees the whole list — PRD §21.6 requires a departing recruiter's replacement to
 * inherit the thread rather than it disappearing with them.
 *
 * A candidate who declines closes the thread to their own replies. The company still sees it,
 * because the content is the record (§16.3), but this screen says so rather than letting a recruiter
 * type into a thread nobody will answer.
 */

const STATE_COPY = {
  pending: { label: 'Awaiting reply', tone: 'neutral' },
  accepted: { label: 'Replying', tone: 'successLight' },
  declined: { label: 'Declined', tone: 'neutral' },
};

function timeOf(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CompanyMessagesPage() {
  const { companySlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useCompany();
  const maySend = can('message:send');

  const [list, setList] = useState({ status: 'loading' });
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const endRef = useRef(null);

  const activeId = searchParams.get('conversation');

  const loadList = useCallback(
    async (signal) => {
      try {
        const data = await fetchCompanyConversations(companySlug, { signal });
        setList({ status: 'ready', ...data });
      } catch (error) {
        if (signal?.aborted || error.name === 'CanceledError') return;
        setList({ status: 'error', message: error.message });
      }
    },
    [companySlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  /* Opening a thread marks it read server-side, so the list is refreshed after it loads. */
  useEffect(() => {
    if (!activeId) {
      setThread(null);
      return undefined;
    }

    const controller = new AbortController();
    setThread({ status: 'loading' });

    fetchCompanyConversation(companySlug, activeId, { signal: controller.signal })
      .then((data) => {
        setThread({ status: 'ready', ...data });
        loadList();
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setThread({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, [companySlug, activeId, loadList]);

  useEffect(() => {
    if (thread?.status === 'ready') endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread]);

  async function send(event) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    try {
      await sendCompanyReply(companySlug, activeId, draft.trim());
      setDraft('');
      const data = await fetchCompanyConversation(companySlug, activeId);
      setThread({ status: 'ready', ...data });
      await loadList();
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not send that.' });
    } finally {
      setBusy(false);
    }
  }

  if (list.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading messages…</span>
          <Skeleton className="h-10 w-56 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (list.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{list.message ?? 'We could not load this.'}</StatusRegion>
      </Container>
    );
  }

  return (
    <Container className="py-32">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Messages</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Conversations with candidates. Threads belong to your company, so anyone on your team can
          pick one up.
        </p>
      </div>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {list.conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
          <p className="text-base font-semibold text-brand-dark">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            Message a candidate from their profile or from talent search. Your first message
            identifies your company and what it is about.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
          {/* Thread list */}
          <nav aria-label="Conversations" className="lg:max-h-[32rem] lg:overflow-y-auto">
            <ul className="space-y-2">
              {list.conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                const state = STATE_COPY[conversation.candidateState] ?? STATE_COPY.pending;

                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => setSearchParams({ conversation: conversation.id })}
                      className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                        isActive
                          ? 'border-brand-blue bg-blue-50/40'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={conversation.candidate.photoUrl ?? undefined}
                          initials={(conversation.candidate.name ?? '?').slice(0, 1).toUpperCase()}
                          size="sm"
                          alt=""
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brand-dark">
                            {conversation.candidate.name ?? 'Candidate'}
                          </p>
                          {conversation.lastMessagePreview && (
                            <p className="truncate text-xs text-gray-500">
                              {conversation.lastMessageFromCompany && (
                                <span className="font-medium text-gray-600">You: </span>
                              )}
                              {conversation.lastMessagePreview}
                            </p>
                          )}
                        </div>
                        {conversation.unread > 0 && (
                          <span
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-blue px-1.5 text-[10px] font-bold text-white"
                            aria-label={`${conversation.unread} unread`}
                          >
                            {conversation.unread}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge tone={state.tone} size="sm" radius="full">
                          {state.label}
                        </Badge>
                        <span className="text-[10px] text-gray-400">
                          {timeOf(conversation.lastMessageAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Thread */}
          <section aria-label="Conversation" className="min-w-0">
            {!activeId && (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
                Choose a conversation to read it.
              </div>
            )}

            {thread?.status === 'loading' && <Skeleton className="h-72 w-full rounded-2xl" />}

            {thread?.status === 'error' && (
              <StatusRegion tone="error">
                {thread.message ?? 'We could not load that conversation.'}
              </StatusRegion>
            )}

            {thread?.status === 'ready' && (
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <header className="flex items-center gap-3 border-b border-gray-100 p-5">
                  <Avatar
                    src={thread.conversation.candidate.photoUrl ?? undefined}
                    initials={(thread.conversation.candidate.name ?? '?').slice(0, 1).toUpperCase()}
                    size="sm"
                    alt=""
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-brand-dark">
                      {thread.conversation.candidate.name ?? 'Candidate'}
                    </h2>
                    {thread.conversation.candidate.headline && (
                      <p className="truncate text-xs text-gray-600">
                        {thread.conversation.candidate.headline}
                      </p>
                    )}
                  </div>
                </header>

                <ul className="max-h-96 space-y-3 overflow-y-auto p-5">
                  {thread.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          message.mine
                            ? 'bg-brand-blue text-white'
                            : 'border border-gray-200 bg-slate-50 text-brand-dark'
                        }`}
                      >
                        {/*
                          Which teammate wrote it. `mine` means "my company's", so without a name a
                          shared thread reads as though one person sent everything.
                        */}
                        {message.mine && message.senderName && (
                          <p className="mb-1 text-[11px] font-semibold text-blue-100">
                            {message.senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${message.mine ? 'text-blue-100' : 'text-gray-400'}`}
                        >
                          {timeOf(message.sentAt)}
                          {message.mine && message.readAt ? ' · read' : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                  <li ref={endRef} />
                </ul>

                <footer className="border-t border-gray-100 p-5">
                  {thread.conversation.candidateState === 'declined' ? (
                    <p className="text-sm text-gray-500">
                      This candidate declined the conversation, so they will not receive further
                      messages.
                    </p>
                  ) : !maySend ? (
                    <p className="text-sm text-gray-500">
                      You can read this thread but not reply. Ask an admin for message permission.
                    </p>
                  ) : (
                    <form noValidate onSubmit={send}>
                      <label htmlFor="company-reply" className="sr-only">
                        Your message
                      </label>
                      <Textarea
                        id="company-reply"
                        name="company-reply"
                        rows={3}
                        placeholder="Write a message…"
                        value={draft}
                        disabled={busy}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          radius="lg"
                          disabled={busy || !draft.trim()}
                        >
                          {busy ? 'Sending…' : 'Send'}
                        </Button>
                      </div>
                    </form>
                  )}
                </footer>
              </div>
            )}
          </section>
        </div>
      )}
    </Container>
  );
}
