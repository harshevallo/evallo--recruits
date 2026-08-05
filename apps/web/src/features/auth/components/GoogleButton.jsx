import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Icon } from '@/components/ui';
import { isGoogleConfigured } from '@/config/auth';

/**
 * Social sign-in buttons.
 *
 * `<GoogleLogin>` returns `credentialResponse.credential` — a Google ID token (JWT) — which the
 * backend verifies with google-auth-library before issuing OUR JWT. Google's token never
 * authorizes our APIs.
 *
 * WIDTH: Google Identity Services requires `width` as a NUMBER OF PIXELS (max 400). Passing a
 * CSS string such as "100%" is invalid and makes GSI render a 0×0 iframe — an invisible but
 * still FOCUSABLE tab stop, so keyboard focus lands on nothing visible and keystrokes are
 * swallowed by the cross-origin frame. We therefore measure the container and pass an integer.
 */
const GSI_MAX_WIDTH = 400;
const GSI_MIN_WIDTH = 200;

function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      const clamped = Math.max(GSI_MIN_WIDTH, Math.min(GSI_MAX_WIDTH, next));
      // Only update on an actual integer change — GSI re-renders its iframe whenever `width`
      // changes, so thrashing this value would recreate the button repeatedly.
      setWidth((current) => (current === clamped ? current : clamped));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

function DisabledButton({ label, hint }) {
  return (
    <button
      type="button"
      disabled
      title={hint}
      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-400"
    >
      <Icon name="certificate" />
      {label}
      <span className="sr-only"> (not yet enabled)</span>
    </button>
  );
}

/**
 * Detects a Google button that never actually renders.
 *
 * GSI can fail SILENTLY — for example when the page origin is not listed in the OAuth client's
 * "Authorized JavaScript origins" — leaving nothing visible. We then show a labelled fallback
 * rather than an empty gap.
 *
 * WHAT TO LOOK FOR. Google renders its button as a `div[role="button"]` styled with CSS, NOT as
 * a sized iframe. The only iframe GSI creates is an auxiliary FedCM/communication frame that is
 * ALWAYS 0×0, on success just as much as on failure. An earlier version of this hook polled for
 * `iframe` with a non-zero width, a condition that can therefore never be satisfied: it discarded
 * a perfectly good button after six seconds and replaced it with the disabled fallback. That is
 * why sign-in appeared to "work, then stop working until refresh".
 */
const GSI_BUTTON_SELECTOR = '[role="button"]';
const GSI_RENDER_TIMEOUT_MS = 8000;

function useGoogleButtonRendered(containerRef, enabled) {
  const [state, setState] = useState('pending'); // pending | rendered | failed

  useEffect(() => {
    if (!enabled) return undefined;

    const deadline = Date.now() + GSI_RENDER_TIMEOUT_MS;
    const timer = setInterval(() => {
      const button = containerRef.current?.querySelector(GSI_BUTTON_SELECTOR);
      if (button && button.getBoundingClientRect().width > 0) {
        setState('rendered');
        clearInterval(timer);
      } else if (Date.now() > deadline) {
        setState('failed');
        clearInterval(timer);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [containerRef, enabled]);

  return state;
}

function GoogleSignInButton({ onCredential, onError, disabled }) {
  const [containerRef, width] = useContainerWidth();
  const renderState = useGoogleButtonRendered(containerRef, width > 0);

  if (renderState === 'failed') {
    return (
      <DisabledButton
        label="Continue with Google"
        hint="Google Sign-In is unavailable: this origin is not authorised for the configured Google client ID."
      />
    );
  }

  return (
    <div ref={containerRef} className={disabled ? 'pointer-events-none opacity-60' : undefined}>
      {/* Rendered only once a real pixel width is known, so GSI never gets an invalid value. */}
      {width > 0 && (
        <GoogleLogin
          onSuccess={(response) => {
            if (response.credential) onCredential(response.credential);
            else onError?.('Google did not return a credential.');
          }}
          onError={() => onError?.('Google sign-in was cancelled or failed.')}
          width={width}
          text="continue_with"
          shape="rectangular"
          logo_alignment="center"
        />
      )}
    </div>
  );
}

/**
 * Memoised: the parent re-renders on every keystroke in the email/password fields. Without this
 * the whole Google subtree re-renders alongside it. Callers must pass stable (useCallback)
 * handlers for the memo to hold.
 */
export const SocialButtons = memo(function SocialButtons({
  onGoogleCredential,
  onError,
  disabled,
}) {
  return (
    <div className="space-y-3">
      {isGoogleConfigured ? (
        <GoogleSignInButton
          onCredential={onGoogleCredential}
          onError={onError}
          disabled={disabled}
        />
      ) : (
        <DisabledButton
          label="Continue with Google"
          hint="Set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID to enable Google sign-in"
        />
      )}

      {/* Microsoft — architecture ready; enabled after Google. */}
      <DisabledButton label="Continue with Microsoft" hint="Microsoft sign-in is coming soon" />

      {!isGoogleConfigured && (
        <p className="text-center text-xs text-gray-500">
          Social sign-in needs a Google client id in the environment. Email works now.
        </p>
      )}
    </div>
  );
});
