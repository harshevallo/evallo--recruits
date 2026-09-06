import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONVERSATION_STATUS, MESSAGING_LIMITS } from '@evallo/shared';
import { Avatar, BackLink, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { Textarea } from '@/components/form';
import {
  fetchConversations,
  fetchConversation,
  sendMessage,
  respondToConversation,
  setConversationMuted,
  reportConversation,
} from '@/services';

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The URL key for the open conversation — shared by both workspaces so links are portable. */
const PARAM = 'conversation';

/**
 * THE inbox (ADR-025). One component, rendered by `/me/messages` and `/c/:companySlug/messages`.
 *
 * A conversation is between two people and belongs to both of them, so there is exactly one inbox
 * per person — the same list whichever workspace it is opened from. The two pages differ only in
 * where "back" goes and how an empty inbox explains itself; everything else is here once, because
 * two copies of a chat screen drift apart the first time one of them is fixed.
 *
 * ── The request model, as the screen shows it ─────────────────────────────────────────────────
 *
 * A first message from a stranger arrives as a REQUEST: the list marks it, the thread opens with an
 * Accept / Decline banner, and writing back is acceptance. The person who started it sees the same
 * thread with a note that they are waiting, and stops being able to write after a few messages until
 * the other side answers (PRD §16.3). Declining closes the thread to the starter without deleting
 * anything; the decliner can reopen it by accepting or simply replying. Mute is per person. Report
 * closes the thread to the reported party and keeps the record.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────────────────────
 *
 * An app shell on desktop, a normal document on mobile. Messaging is the one screen whose content
 * is unbounded, so on `lg:` the page owns the viewport (`h-screen` + `flex-col`, `pt-24` clearing
 * the fixed `h-20` navbar) and the two panes scroll inside it. On a phone the columns stack and the
 * page scroll is the right one.
 */
export function ConversationsInbox({
  backTo,
  backLabel,
  title = 'Messages',
  description = 'Your conversations. Each one is between you and one other person.',
  emptyDescription,
  emptyAction,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get(PARAM);

  const [list, setList] = useState({ status: 'loading', conversations: [] });
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const endRef = useRef(null);

  const patchRow = useCallback((id, patch) => {
    setList((current) => ({
      ...current,
      conversations: current.conversations.map((row) =>
        row.id === id ? { ...row, ...(typeof patch === 'function' ? patch(row) : patch) } : row,
      ),
    }));
  }, []);

  const loadList = useCallback(async (signal) => {
    try {
      const data = await fetchConversations({ signal });
      setList({ status: 'ready', ...data });
    } catch (error) {
      if (signal?.aborted || error.name === 'CanceledError') return;
      setList({ status: 'error', conversations: [], message: error.message });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    if (!openId) {
      setThread(null);
      return undefined;
    }

    const controller = new AbortController();
    setThread({ status: 'loading' });
    setDraft('');
    setFeedback(null);

    fetchConversation(openId, { signal: controller.signal })
      .then((data) => {
        setThread({ status: 'ready', ...data });
        /*
         * Opening a thread clears my unread count server-side; mirror that in the list so the
         * badge stops claiming unread messages I am currently reading.
         */
        patchRow(openId, { unread: 0 });
        setList((current) => ({
          ...current,
          unreadTotal: current.conversations.reduce(
            (sum, row) => sum + (row.id === openId ? 0 : (row.unread ?? 0)),
            0,
          ),
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setThread({ status: 'error', message: error.message ?? 'We could not open that conversation.' });
      });

    return () => controller.abort();
  }, [openId, patchRow]);

  useEffect(() => {
    if (thread?.status === 'ready') endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread]);

  const conversation = thread?.status === 'ready' ? thread.conversation : null;
  const otherName = conversation?.other?.name ?? 'this person';

  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || busy || !conversation) return;

    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendMessage(conversation.id, draft.trim());

      setThread((current) => ({
        ...current,
        messages: [...current.messages, result.message],
        conversation: {
          ...current.conversation,
          status: result.status,
          isRequest: false,
          messageCount: (current.conversation.messageCount ?? 0) + 1,
          closed: false,
          closedReason: null,
        },
      }));
      patchRow(conversation.id, (row) => ({
        status: result.status,
        isRequest: false,
        lastMessagePreview: result.message.body.slice(0, MESSAGING_LIMITS.PREVIEW_LENGTH),
        lastMessageAt: result.message.sentAt,
        lastMessageFromMe: true,
        messageCount: (row.messageCount ?? 0) + 1,
      }));
      setList((current) => ({
        ...current,
        pendingRequests: current.conversations.filter(
          (row) => row.isRequest && row.id !== conversation.id,
        ).length,
      }));
      setDraft('');
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.body ?? error.message ?? 'We could not send that message.',
      });
    } finally {
      setBusy(false);
    }
  }

  /** PRD §11.2 — accept or decline a request someone sent me. */
  async function respond(accepted) {
    if (!conversation) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await respondToConversation(conversation.id, accepted);
      const patch = { status: result.status, muted: result.muted, isRequest: false };
      setThread((current) => ({ ...current, conversation: { ...current.conversation, ...patch } }));
      patchRow(conversation.id, patch);
      setList((current) => ({
        ...current,
        pendingRequests: Math.max(0, (current.pendingRequests ?? 1) - 1),
      }));
      setFeedback({
        tone: 'success',
        text: accepted
          ? 'Accepted. You can reply below.'
          : `Declined. ${otherName} can no longer write to you here, and the conversation is muted.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  /** PRD §11.2 — mute, for me only. The thread stays readable; only notifications stop. */
  async function toggleMute() {
    if (!conversation) return;
    setBusy(true);
    try {
      const result = await setConversationMuted(conversation.id, !conversation.muted);
      setThread((current) => ({
        ...current,
        conversation: { ...current.conversation, muted: result.muted },
      }));
      patchRow(conversation.id, { muted: result.muted });
      setFeedback({
        tone: 'success',
        text: result.muted ? 'Muted. You will not be notified about this conversation.' : 'Unmuted.',
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    if (!conversation) return;
    const reason = window.prompt('What is wrong with this conversation?');
    if (!reason?.trim()) return;

    try {
      await reportConversation(conversation.id, reason.trim());
      const patch = { reported: true, reportedByMe: true };
      setThread((current) => ({ ...current, conversation: { ...current.conversation, ...patch } }));
      patchRow(conversation.id, patch);
      setFeedback({
        tone: 'success',
        text: 'Reported. Our team will review it — the conversation stays here as the record.',
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
    <Container className="py-32 lg:flex lg:h-screen lg:flex-col lg:pb-6 lg:pt-24">
      {backTo && <BackLink to={backTo} label={backLabel} className="mb-6 lg:shrink-0" />}

      <header className="mb-8 lg:shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">{title}</h1>
        <p className="mt-2 max-w-xl text-gray-600">{description}</p>
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

      {list.status === 'ready' && list.conversations.length === 0 ? (
        <EmptyState
          icon="comments"
          title="No conversations yet"
          description={
            emptyDescription ??
            'When someone writes to you, or you write to someone, the conversation appears here.'
          }
          action={emptyAction}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[20rem_1fr]">
          <nav aria-label="Conversations" className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <ul className="space-y-2">
              {list.conversations.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ [PARAM]: row.id })}
                    aria-current={row.id === openId ? 'true' : undefined}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                      row.id === openId
                        ? 'border-brand-blue bg-blue-50/60'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <Avatar
                      src={row.other?.photoUrl ?? undefined}
                      initials={row.other?.initials ?? '?'}
                      size="sm"
                      alt=""
                    />
                    <span className="min-w-0 flex-1">
                      {/* The PERSON is the title; the company they wrote through is context beneath. */}
                      <span className="block truncate text-sm font-semibold text-brand-dark">
                        {row.other?.name ?? 'Someone'}
                      </span>
                      {row.company?.name && (
                        <span className="block truncate text-xs text-gray-600">{row.company.name}</span>
                      )}
                      <span className="block truncate text-xs text-gray-500">
                        {row.lastMessageFromMe && (
                          <span className="font-medium text-gray-600">You: </span>
                        )}
                        {row.lastMessagePreview ?? 'No messages yet'}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {row.isRequest && (
                          <Badge tone="brandOutline" size="xs" radius="full">
                            Request
                          </Badge>
                        )}
                        {row.muted && (
                          <Badge tone="neutral" size="xs" radius="full">
                            Muted
                          </Badge>
                        )}
                        {row.closed && row.closedReason === 'declined' && (
                          <Badge tone="neutral" size="xs" radius="full">
                            Declined
                          </Badge>
                        )}
                        <span className="text-[10px] text-gray-400">{formatTime(row.lastMessageAt)}</span>
                      </span>
                    </span>
                    {row.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-brand-blue px-2 py-0.5 text-xs font-semibold text-white">
                        {row.unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section
            aria-labelledby="conversation-heading"
            className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden"
          >
            {!openId && (
              <p id="conversation-heading" className="text-sm text-gray-600">
                Select a conversation to read it.
              </p>
            )}

            {thread?.status === 'loading' && <Skeleton className="h-72 w-full rounded-2xl" />}

            {thread?.status === 'error' && (
              <StatusRegion tone="error">
                <span id="conversation-heading">{thread.message}</span>
              </StatusRegion>
            )}

            {conversation && (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 lg:shrink-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      src={conversation.other?.photoUrl ?? undefined}
                      initials={conversation.other?.initials ?? '?'}
                      size="md"
                      alt=""
                    />
                    <div className="min-w-0">
                      <h2 id="conversation-heading" className="truncate text-lg font-bold text-brand-dark">
                        {conversation.other?.name ?? 'Conversation'}
                      </h2>
                      {conversation.company?.name && (
                        <p className="truncate text-sm text-gray-600">{conversation.company.name}</p>
                      )}
                    </div>
                  </div>

                  {/* PRD §11.2 — mute and report. Block lives with the company, in visibility settings. */}
                  <div className="flex flex-wrap items-center gap-4">
                    <Button
                      variant="link"
                      size="none"
                      radius="none"
                      className="text-sm"
                      onClick={toggleMute}
                      disabled={busy}
                    >
                      {conversation.muted ? 'Unmute' : 'Mute'}
                    </Button>
                    <Button
                      variant="link"
                      size="none"
                      radius="none"
                      className="text-sm"
                      onClick={handleReport}
                      disabled={conversation.reported}
                    >
                      {conversation.reported ? 'Reported' : 'Report'}
                    </Button>
                  </div>
                </div>

                {conversation.isRequest && (
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-4 lg:shrink-0">
                    <p className="min-w-0 flex-1 text-sm text-blue-900">
                      <span className="font-semibold">{otherName}</span> wants to message you. Accept
                      to reply — or simply write back — or decline.
                    </p>
                    <Button variant="primary" size="sm" radius="lg" disabled={busy} onClick={() => respond(true)}>
                      Accept
                    </Button>
                    <Button variant="outline" size="sm" radius="lg" disabled={busy} onClick={() => respond(false)}>
                      Decline
                    </Button>
                  </div>
                )}

                {conversation.startedByMe && conversation.status === CONVERSATION_STATUS.PENDING && (
                  <p className="mb-5 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 lg:shrink-0">
                    Message request sent. {otherName} has not replied yet — you can send up to{' '}
                    {thread.limits?.pendingRequestMessageCap ?? MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP}{' '}
                    messages before they do.
                  </p>
                )}

                <ol
                  className="relative mb-6 space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
                  aria-live="polite"
                >
                  {thread.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                          message.mine ? 'bg-brand-blue text-white' : 'bg-gray-50 text-brand-dark'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-1 text-xs ${message.mine ? 'text-blue-100' : 'text-gray-400'}`}>
                          <span className="sr-only">
                            {message.mine ? 'You, ' : `${message.senderName ?? otherName}, `}
                          </span>
                          {formatTime(message.sentAt)}
                          {message.mine && message.readAt ? ' · read' : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                  <li ref={endRef} aria-hidden="true" />
                </ol>

                <ConversationFooter
                  conversation={conversation}
                  otherName={otherName}
                  draft={draft}
                  busy={busy}
                  onDraft={setDraft}
                  onSend={send}
                  onAccept={() => respond(true)}
                />
              </>
            )}
          </section>
        </div>
      )}
    </Container>
  );
}

/**
 * What sits under the messages: the composer, or the reason there is none.
 *
 * The server decides whether I may write (`closed` / `closedReason`); this only explains it in
 * words. The decliner is the one case where a closed-looking thread still takes a message — writing
 * back is how they reopen it — so they get a note and the composer both.
 */
function ConversationFooter({ conversation, otherName, draft, busy, onDraft, onSend, onAccept }) {
  if (conversation.reported) {
    return (
      <div className="rounded-xl bg-gray-50 p-4 lg:shrink-0">
        <p className="text-sm text-gray-600">
          {conversation.reportedByMe
            ? `You reported this conversation. ${otherName} can no longer write to you here, and the messages stay as the record.`
            : 'This conversation has been reported and is closed to new messages.'}
        </p>
      </div>
    );
  }

  if (conversation.closed) {
    const copy = {
      declined: `${otherName} declined this conversation, so replies are closed. The messages stay here as a record.`,
      awaiting_reply: `You have sent ${conversation.messageCount} messages and ${otherName} has not replied yet. You can write again once they do.`,
      blocked: 'This conversation is closed.',
    };
    return (
      <div className="rounded-xl bg-gray-50 p-4 lg:shrink-0">
        <p className="text-sm text-gray-600">
          {copy[conversation.closedReason] ?? 'This conversation is closed.'}
        </p>
      </div>
    );
  }

  const iDeclined =
    conversation.status === CONVERSATION_STATUS.DECLINED && !conversation.startedByMe;

  return (
    <form onSubmit={onSend} className="lg:shrink-0">
      {iDeclined && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          <span>You declined this conversation. Writing back reopens it.</span>
          <Button variant="link" size="none" radius="none" className="text-xs font-medium" onClick={onAccept} disabled={busy} type="button">
            Accept it after all
          </Button>
        </div>
      )}
      <label htmlFor="conversation-reply" className="mb-2 block text-sm font-medium text-gray-700">
        Reply
      </label>
      <Textarea
        id="conversation-reply"
        name="reply"
        rows={3}
        maxLength={MESSAGING_LIMITS.BODY_MAX_LENGTH}
        value={draft}
        disabled={busy}
        onChange={(event) => onDraft(event.target.value)}
        placeholder={`Write to ${otherName}…`}
      />
      <Button
        type="submit"
        variant="primary"
        size="md"
        radius="lg"
        className="mt-3"
        disabled={busy || !draft.trim()}
      >
        {busy ? 'Sending…' : 'Send'}
        <Icon name="arrow-right" className="text-xs" />
      </Button>
    </form>
  );
}
