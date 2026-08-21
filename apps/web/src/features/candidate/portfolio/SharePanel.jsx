import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { Badge, Button, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import {
  fetchShareLink,
  enableShareLink,
  rotateShareLink,
  disableShareLink,
} from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * "Share portfolio" — the candidate's control over the one link that reaches them without an
 * Evallo account (ADR-019).
 *
 * The panel's job is to make the consequence legible before the action, not after. Three facts
 * are always on screen together, because separating them is how someone ends up sharing a link
 * they thought was off:
 *
 *   · whether the link is ON
 *   · whether it currently RESOLVES, which depends on their visibility state
 *   · what a recipient will see, in a sentence rather than a settings reference
 *
 * A draft profile is the case that matters. Its share link is enabled-but-dead, and saying so
 * plainly here is better than the candidate discovering it from a recruiter who got a 404.
 */

/** What a link holder actually gets, phrased from the candidate's point of view. */
const STATE_COPY = {
  [CANDIDATE_VISIBILITY.DRAFT]: {
    tone: 'warning',
    text: 'Your profile is still a draft, so the link will not open for anyone. Publish it to make sharing work.',
  },
  [CANDIDATE_VISIBILITY.PRIVATE]: {
    tone: 'info',
    text: 'Your profile is private, so it stays out of recruiter search — but anyone you send this link to can open it.',
  },
  [CANDIDATE_VISIBILITY.DISCOVERABLE]: {
    tone: 'info',
    text: 'Your profile is discoverable in recruiter search, and anyone you send this link to can open it.',
  },
  [CANDIDATE_VISIBILITY.PAUSED]: {
    tone: 'info',
    text: 'Your profile is paused, so it stays out of new searches — but this link still opens for anyone you send it to. Turn the link off to stop that.',
  },
  [CANDIDATE_VISIBILITY.ARCHIVED]: {
    tone: 'warning',
    text: 'This profile is archived, so the link will not open for anyone.',
  },
};

export function SharePanel({ className = '' }) {
  /*
   * `phase` is the load-state machine and `status` is the candidate's VISIBILITY state, which the
   * API also calls `status`. Two different things with one word, so they get two fields — spreading
   * the response over a `status: 'ready'` marker would silently overwrite the machine with
   * `'draft'` and leave the component's own state unreadable.
   */
  const [state, setState] = useState({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmingRotate, setConfirmingRotate] = useState(false);

  const load = useCallback(async (signal) => {
    const data = await fetchShareLink({ signal });
    setState({ phase: 'ready', ...data });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({ phase: 'error', message: error.message });
    });
    return () => controller.abort();
  }, [load]);

  /*
   * The link is assembled here, not on the server.
   *
   * The API runs on a different origin from the web app, so a server-built URL would point at the
   * API host. Building it from `window.location.origin` also means preview deployments produce
   * links that work on the preview deployment.
   */
  const shareUrl = state.token
    ? `${window.location.origin}${buildPath(PATHS.PUBLIC_PORTFOLIO, { token: state.token })}`
    : null;

  async function run(action, message) {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await action();
      setState({ phase: 'ready', ...data });
      setFeedback({ tone: 'success', text: message });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'That did not work. Try again.' });
    } finally {
      setBusy(false);
      setConfirmingRotate(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback({ tone: 'success', text: 'Link copied to your clipboard.' });
    } catch {
      /*
       * Clipboard access is refused in some browsers and over plain HTTP. The input below is
       * readonly-but-selectable precisely so this failure leaves the person a way through.
       */
      setFeedback({ tone: 'error', text: 'Could not copy automatically — select the link and copy it.' });
    }
  }

  /** The OS share sheet, where the platform has one. Silently absent elsewhere. */
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function nativeShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: 'My teaching portfolio',
        text: 'Here is my teaching portfolio on Evallo Recruit.',
        url: shareUrl,
      });
    } catch {
      /* The person dismissed the sheet. Not an error, and not worth a message. */
    }
  }

  if (state.phase === 'loading') {
    return (
      <section className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
        <p className="text-sm text-gray-500" role="status">
          Loading your share settings…
        </p>
      </section>
    );
  }

  if (state.phase === 'error') {
    return (
      <section className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
        <StatusRegion tone="error">
          {state.message ?? 'We could not load your share settings.'}
        </StatusRegion>
      </section>
    );
  }

  const visibilityCopy = STATE_COPY[state.status] ?? null;

  return (
    <section
      aria-labelledby="share-heading"
      className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="share-heading" className="flex items-center gap-2.5 text-lg font-bold text-brand-dark">
            <Icon name="link" className="text-sm text-brand-blue" />
            Share portfolio
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            A private link to your portfolio. No Evallo account needed to open it.
          </p>
        </div>

        <Badge tone={state.enabled ? 'successLight' : 'neutral'} size="sm" radius="full">
          {state.enabled ? 'Link on' : 'Link off'}
        </Badge>
      </div>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mt-4">
          {feedback.text}
        </StatusRegion>
      )}

      {/*
        The visibility consequence, always visible while the link is on. This is the sentence that
        stops a candidate believing "paused" also means "link dead".
      */}
      {state.enabled && visibilityCopy && (
        <p
          className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            visibilityCopy.tone === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-blue-100 bg-blue-50/60 text-brand-dark'
          }`}
        >
          <Icon
            name={visibilityCopy.tone === 'warning' ? 'shield-halved' : 'circle-check'}
            className="mt-0.5 flex-none text-xs"
          />
          <span>{visibilityCopy.text}</span>
        </p>
      )}

      {state.enabled && shareUrl ? (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {/*
              Readonly rather than disabled: a disabled input cannot be selected, and manual
              selection is the fallback when the Clipboard API is unavailable.
            */}
            <input
              readOnly
              value={shareUrl}
              aria-label="Your portfolio link"
              onFocus={(event) => event.target.select()}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 font-mono text-xs text-gray-700 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            />
            <Button type="button" variant="primary" size="md" radius="lg" onClick={copyLink}>
              Copy link
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {canNativeShare && (
              <Button
                type="button"
                variant="outlineDark"
                size="md"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                onClick={nativeShare}
              >
                Share…
              </Button>
            )}

            <Button
              to={PATHS.CANDIDATE_PROFILE_PREVIEW}
              variant="outlineDark"
              size="md"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            >
              Preview what they see
            </Button>

            {/*
              Rotation is confirmed inline rather than in a modal. It is destructive — every copy
              of the old link dies — but it is also reversible in the only sense that matters:
              you can send the new one. A modal would be heavier than the consequence.
            */}
            {confirmingRotate ? (
              <span className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
                <span className="text-sm text-amber-900">
                  Replace the link? Every copy you have sent stops working.
                </span>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  radius="lg"
                  disabled={busy}
                  onClick={() => run(rotateShareLink, 'New link created. The old one no longer opens.')}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="link"
                  size="none"
                  radius="none"
                  className="text-sm"
                  onClick={() => setConfirmingRotate(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="link"
                size="none"
                radius="none"
                className="self-center px-2 text-sm"
                onClick={() => setConfirmingRotate(true)}
              >
                Replace link
              </Button>
            )}

            <Button
              type="button"
              variant="link"
              size="none"
              radius="none"
              className="self-center px-2 text-sm !text-red-600"
              disabled={busy}
              onClick={() => run(disableShareLink, 'Sharing is off. The link no longer opens.')}
            >
              Turn off sharing
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            disabled={busy}
            onClick={() => run(enableShareLink, 'Your portfolio link is ready.')}
          >
            Create share link
          </Button>
          <p className="mt-3 text-sm text-gray-500">
            You can turn the link off or replace it at any time.{' '}
            <Link
              to={PATHS.CANDIDATE_VISIBILITY}
              className="font-medium text-brand-blue hover:underline"
            >
              Visibility settings
            </Link>{' '}
            still control what a reader sees.
          </p>
        </div>
      )}
    </section>
  );
}
