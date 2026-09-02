import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, BackLink, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { Textarea } from '@/components/form';
import {
  fetchConversations,
  fetchConversation,
  sendReply,
  reportConversation,
  respondToConversation,
  setConversationMuted,
} from '@/services';
import { PATHS } from '@/router/paths';

function formatTime(value) {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * CAN-09 — messages (PRD §8.2, §11.2).
 *
 * Threads, reply, and safety reporting.
 *
 * A candidate can only reply inside a thread a company opened. That is a product rule, not a
 * missing feature: unsolicited candidate-to-company messaging would turn the platform into a
 * cold-outreach channel, which PRD §11.2 does not describe. Until the recruiter side (REC-15)
 * ships, the inbox is legitimately empty and says why.
 */
export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('thread');

  const [list, setList] = useState({ status: 'loading', threads: [] });
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchConversations({ signal: controller.signal })
      .then((threads) => setList({ status: 'ready', threads }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setList({ status: 'error', threads: [], message: error.message });
      });

    return () => controller.abort();
  }, []);

  const loadThread = useCallback((id, signal) => {
    if (!id) {
      setThread(null);
      return;
    }
    fetchConversation(id, { signal })
      .then((data) => {
        setThread(data);
        /*
         * Opening a thread clears its unread count server-side, so mirror that in the list.
         * Without this the badge keeps claiming unread messages the user is currently reading.
         */
        setList((current) => ({
          ...current,
          threads: current.threads.map((t) => (t.id === id ? { ...t, unread: 0 } : t)),
        }));
      })
      .catch((error) => {
        if (signal?.aborted || error.name === 'CanceledError') return;
        setFeedback({ tone: 'error', text: error.message ?? 'We could not open that thread.' });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadThread(openId, controller.signal);
    return () => controller.abort();
  }, [openId, loadThread]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread]);

  async function handleSend(event) {
    event.preventDefault();
    if (!reply.trim() || busy) return;

    setBusy(true);
    setFeedback(null);
    try {
      const message = await sendReply(thread.id, reply.trim());
      setThread((current) => ({ ...current, messages: [...current.messages, message] }));

      // Keep the list in step with the thread — otherwise the preview still shows the company's
      // last message after the candidate has replied to it.
      setList((current) => ({
        ...current,
        threads: current.threads.map((t) =>
          t.id === thread.id
            ? { ...t, lastMessagePreview: message.body.slice(0, 200), lastMessageAt: message.sentAt }
            : t,
        ),
      }));
      setReply('');
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not send that message.' });
    } finally {
      setBusy(false);
    }
  }

  /** PRD 11.2 - accept or decline a company-initiated conversation. */
  async function respond(accepted) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await respondToConversation(thread.id, accepted);
      setThread((current) => ({ ...current, state: result.state, muted: result.muted }));
      setList((current) => ({
        ...current,
        threads: current.threads.map((t) =>
          t.id === thread.id ? { ...t, state: result.state, muted: result.muted } : t,
        ),
      }));
      setFeedback({
        tone: 'success',
        text: accepted
          ? 'Accepted. You can reply below.'
          : 'Declined. The company can no longer expect a reply, and the thread is muted.',
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  /** PRD 11.2 - mute. The thread stays readable; only notifications stop. */
  async function toggleMute() {
    setBusy(true);
    try {
      const result = await setConversationMuted(thread.id, !thread.muted);
      setThread((current) => ({ ...current, muted: result.muted }));
      setList((current) => ({
        ...current,
        threads: current.threads.map((t) =>
          t.id === thread.id ? { ...t, muted: result.muted } : t,
        ),
      }));
      setFeedback({
        tone: 'success',
        text: result.muted
          ? 'Muted. You will not be notified about this conversation.'
          : 'Unmuted.',
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    const reason = window.prompt('What is wrong with this conversation?');
    if (!reason?.trim()) return;

    try {
      await reportConversation(thread.id, reason.trim());
      setThread((current) => ({ ...current, reported: true }));
      setFeedback({
        tone: 'success',
        text: 'Reported. Our team will review it — the conversation stays here in the meantime.',
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not report that.' });
    }
  }

  if (list.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your messages…</span>
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-32">
      {/* Back to the candidate home, at the top — the same affordance the company pages use. */}
      <BackLink to={PATHS.CANDIDATE_HOME} label="Candidate home" className="mb-6" />

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Messages</h1>
        <p className="mt-2 max-w-xl text-gray-600">
          Conversations with companies you have shared your profile with.
        </p>
      </header>

      {list.status === 'error' && (
        <StatusRegion tone="error" className="mb-6">
          {list.message ?? 'We could not load your messages.'}
        </StatusRegion>
      )}

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {list.threads.length === 0 ? (
        <EmptyState
          icon="comments"
          title="No conversations yet"
          description="Companies start the conversation after you express interest. When one does, it appears here."
          action={
            <Button to={PATHS.CANDIDATE_INTERESTS} variant="primary" size="md">
              See shortlisted companies
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:h-[calc(100vh-26rem)] lg:min-h-[30rem] lg:grid-cols-[20rem_1fr]">
          {/*
           * Two independently scrolling columns on desktop.
           *
           * The grid is bounded to the viewport MINUS the chrome above and below it, so the page
           * itself does not scroll and neither column can be carried off-screen. That subtraction
           * is measured, not guessed: `py-32` on the container contributes 128px top and bottom,
           * the back link 48px and the header 100px — 404px, or 25.25rem. 26rem leaves a little
           * slack. Subtracting too little is what made the page scroll and drag the thread list
           * away with it.
           *
           * `min-h` wins on a short viewport, which reintroduces a small page scroll — hence the
           * sticky list below, so it stays put even then.
           *
           * Height rules are `lg:` only. On a phone the columns are stacked, and a fixed height
           * would trap the conversation in a short box inside an already-scrolling page.
           */}
          {/*
           * `self-start` keeps the list its natural height, so a short list simply sits there with
           * no scrollbar — it only becomes scrollable once it outgrows the column. `sticky` is the
           * belt to that braces: on a viewport short enough for `min-h` to force a page scroll, the
           * list stays in view instead of sliding away.
           */}
          <nav
            aria-label="Conversations"
            className="lg:sticky lg:top-6 lg:max-h-full lg:self-start lg:overflow-y-auto lg:pr-1"
          >
            <ul className="space-y-2">
              {list.threads.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ thread: item.id })}
                    aria-current={item.id === openId ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                      item.id === openId
                        ? 'border-brand-blue bg-blue-50/60'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Avatar
                      src={item.company?.logoUrl}
                      initials={item.company?.initials}
                      size="sm"
                      shape="rounded"
                      tone="brand"
                    />
                    {/*
                      * A candidate is talking to a PERSON, so the person is the title and the
                      * company is context beneath it (ADR-024).
                      *
                      * Legacy shared threads have no one owner, so they keep the company as their
                      * title rather than borrowing the name of whoever happened to write last —
                      * that thread really was a conversation with a company.
                      */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-brand-dark">
                        {item.recruiter?.name ?? item.company?.name ?? 'Company'}
                      </span>
                      {item.recruiter?.name && item.company?.name && (
                        <span className="block truncate text-xs text-gray-600">
                          {item.company.name}
                        </span>
                      )}
                      <span className="block truncate text-xs text-gray-500">
                        {/* Naming the sender is redundant once they are the heading. */}
                        {!item.recruiter?.name && item.lastMessageFrom && (
                          <span className="font-medium text-gray-600">
                            {item.lastMessageFrom}:{' '}
                          </span>
                        )}
                        {item.lastMessagePreview ?? 'No messages yet'}
                      </span>
                    </span>
                    {item.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-blue px-2 py-0.5 text-xs font-semibold text-white">
                        {item.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section
            aria-labelledby="thread-heading"
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden"
          >
            {!thread ? (
              <p id="thread-heading" className="text-sm text-gray-600">
                Select a conversation to read it.
              </p>
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 lg:shrink-0">
                  <div className="min-w-0">
                    <h2 id="thread-heading" className="text-lg font-bold text-brand-dark">
                      {thread.recruiter?.name ?? thread.company?.name ?? 'Conversation'}
                      {thread.state === 'declined' && (
                        <span className="ml-2 align-middle text-xs font-normal text-gray-500">
                          Declined
                        </span>
                      )}
                    </h2>
                    {/* The company stays visible as context, never replaced by the person. */}
                    {thread.recruiter?.name && thread.company?.name && (
                      <p className="truncate text-sm text-gray-600">{thread.company.name}</p>
                    )}
                  </div>

                  {/* PRD 11.2 candidate controls. Block lives in visibility settings. */}
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      variant="link"
                      size="none"
                      radius="none"
                      className="text-sm"
                      onClick={toggleMute}
                      disabled={busy}
                    >
                      {thread.muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button
                      variant="link"
                      size="none"
                      radius="none"
                      className="text-sm"
                      onClick={handleReport}
                      disabled={thread.reported}
                    >
                      {thread.reported ? 'Reported' : 'Report'}
                    </Button>
                  </div>
                </div>

                {thread.state === 'pending' && (
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-4 lg:shrink-0">
                    <p className="min-w-0 flex-1 text-sm text-blue-900">
                      {thread.company?.name ?? 'This company'} started this conversation. Would you
                      like to continue it?
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      radius="lg"
                      disabled={busy}
                      onClick={() => respond(true)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outlineDark"
                      size="sm"
                      radius="lg"
                      className="!border-gray-300 !text-brand-dark hover:!bg-white"
                      disabled={busy}
                      onClick={() => respond(false)}
                    >
                      Decline
                    </Button>
                  </div>
                )}

                <ol className="mb-6 space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1" aria-live="polite">
                  {thread.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                          message.mine
                            ? 'bg-brand-blue text-white'
                            : 'bg-gray-50 text-brand-dark'
                        }`}
                      >
                        {/*
                          The individual recruiter, named. Several people at one company can share a
                          thread, so "Company XYZ" alone would leave the candidate unsure who they
                          are replying to.
                        */}
                        {!message.mine && message.senderName && (
                          <p className="mb-1 text-xs font-semibold text-brand-dark">
                            {message.senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p
                          className={`mt-1 text-xs ${
                            message.mine ? 'text-blue-100' : 'text-gray-400'
                          }`}
                        >
                          <span className="sr-only">
                            {message.mine
                              ? 'You, '
                              : `${message.senderName ?? 'The company'}, `}
                          </span>
                          {formatTime(message.sentAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                  <li ref={endRef} aria-hidden="true" />
                </ol>

                {thread.state === 'declined' ? (
                  <div className="rounded-xl bg-gray-50 p-4 lg:shrink-0">
                    <p className="text-sm text-gray-600">
                      You declined this conversation, so replies are closed. The messages stay here
                      as a record.
                    </p>
                    <Button
                      variant="link"
                      size="none"
                      radius="none"
                      className="mt-2 text-sm font-medium"
                      onClick={() => respond(true)}
                      disabled={busy}
                    >
                      Accept it after all
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="lg:shrink-0">
                    <label htmlFor="reply" className="mb-2 block text-sm font-medium text-gray-700">
                      Reply
                    </label>
                  <Textarea
                    id="reply"
                    name="reply"
                    rows={3}
                    maxLength={5000}
                    value={reply}
                    disabled={busy}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    radius="lg"
                    className="mt-3"
                    disabled={busy || !reply.trim()}
                  >
                    {busy ? 'Sending…' : 'Send'}
                    <Icon name="arrow-right" className="text-xs" />
                  </Button>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}

    </Container>
  );
}
