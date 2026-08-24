import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Avatar, Icon } from '@/components/ui';
import { uploadProfilePhoto, deleteProfilePhoto } from '@/services/users.api.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { prepareProfilePhoto, ImagePrepError, ACCEPTED_IMAGE_TYPES } from '@/utils/imageResize.js';

/**
 * Profile photo upload (ADR-020) — browse, drag-and-drop, preview, replace, remove.
 *
 * ── One component, two surfaces ────────────────────────────────────────────────────────────────
 *
 * Used by the CAN-02 builder's identity section and by Settings → Account. Those two screens
 * previously carried two separate blocks of copy, both of which said uploading was impossible.
 * Replacing them with two independent implementations would mean two upload state machines to keep
 * in step — and this one is not trivial: it holds a file input, a drag counter, an in-flight latch,
 * a progress figure, an object-URL lifecycle and an error. The `compact` prop covers the only real
 * difference, which is how much room the surface has.
 *
 * ── Why the auth context is refreshed rather than a callback fired ─────────────────────────────
 *
 * `profilePicture` is rendered by twelve surfaces, all reading `user` from `AuthContext`. The
 * upload response is the full `/me` envelope, so pushing it into the context updates the avatar in
 * the top bar, the sidebar and every other consumer at once. A local `onChange` callback would have
 * updated this component and left the header showing the old photo until a reload.
 */
export function ProfilePhotoUploader({ compact = false }) {
  const { user, refresh } = useAuth();
  const inputId = useId();

  const fileInputRef = useRef(null);

  /**
   * The in-flight latch.
   *
   * A ref, not state. `busy` as state is read from the render that queued the handler, so two
   * clicks in the same tick both see `false` and both fire — the exact double-submit that produced
   * duplicate portfolio videos and duplicate account PATCHes earlier in this codebase. A ref is
   * written and read synchronously, so the second click sees the first.
   */
  const inFlight = useRef(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  /**
   * The locally-generated preview, shown between "file chosen" and "server confirmed".
   *
   * Without it the avatar does not change until the round trip finishes, which on a slow connection
   * reads as the upload having failed. Held in a ref alongside state purely so the cleanup effect
   * can revoke the URL without depending on it and re-running on every change.
   */
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);

  const setPreviewUrl = useCallback((url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  }, []);

  /* Revoke on unmount. An object URL held after the component goes away is a leaked Blob. */
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const handleFile = useCallback(
    async (file) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setProgress(0);

      try {
        /* Downscale and centre-crop first, so the preview shows the crop that will be stored. */
        const { blob, previewUrl } = await prepareProfilePhoto(file);
        setPreviewUrl(previewUrl);

        await uploadProfilePhoto(blob, setProgress);
        await refresh();

        /*
         * The server URL is now in context and carries a fresh `?v=`, so the real image will load.
         * Dropping the local preview here avoids holding the Blob for the life of the page.
         */
        setPreviewUrl(null);
      } catch (caught) {
        setPreviewUrl(null);

        if (caught instanceof ImagePrepError) {
          setError(caught.message);
        } else {
          /* The API's field-keyed envelope, falling back to its message, then to something true. */
          const data = caught?.response?.data?.error;
          setError(data?.details?.photo ?? data?.message ?? 'That upload did not go through.');
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
        setProgress(0);
        /* Clear the input, or picking the SAME file again fires no change event. */
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [refresh, setPreviewUrl],
  );

  const handleRemove = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);

    try {
      await deleteProfilePhoto();
      await refresh();
      setPreviewUrl(null);
    } catch (caught) {
      setError(caught?.response?.data?.error?.message ?? 'That photo could not be removed.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [refresh, setPreviewUrl]);

  /*
   * Drag and drop.
   *
   * `dragOver` must preventDefault or the browser navigates to the dropped file instead of handing
   * it over. The leave handler is deliberately not counted per-child: `dragging` is only cosmetic,
   * so a flicker crossing an inner element is not worth a depth counter.
   */
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  /* An upload in flight shows its own preview; otherwise whatever the account currently has. */
  const shown = preview ?? user?.profilePicture ?? null;
  const hasUploaded = Boolean(user?.profilePicture?.includes('/api/media/'));

  const size = compact ? 'h-16 w-16' : 'h-24 w-24';

  return (
    <div className={compact ? 'flex items-start gap-4' : 'flex flex-col gap-6 sm:flex-row sm:items-start'}>
      {/*
        The target is a label, not a button. A label bound to a file input opens the picker with a
        click OR with Enter/Space from the keyboard, natively — a div with an onClick would have to
        reimplement both, and screen readers would not announce it as a control at all.
      */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          size,
          'group relative flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full shadow-sm transition',
          'focus-within:ring-2 focus-within:ring-brand-blue focus-within:ring-offset-2',
          dragging ? 'ring-2 ring-brand-blue ring-offset-2' : '',
          shown ? '' : 'border-2 border-dashed border-gray-300 bg-slate-50',
          busy ? 'pointer-events-none opacity-70' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {shown ? (
          <Avatar src={shown} alt="" size="lg" className={`${size} object-cover`} />
        ) : (
          <span className="flex flex-col items-center text-gray-400">
            <Icon name="camera" className={compact ? 'text-base' : 'mb-1 text-xl'} />
            {!compact && (
              <span className="text-[10px] font-semibold uppercase tracking-wider">Add</span>
            )}
          </span>
        )}

        {/* Hover affordance. Hidden from assistive tech — the label already says what this does. */}
        {!busy && (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-dark/55 text-white opacity-0 transition group-hover:opacity-100"
          >
            <Icon name="camera" />
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/80 text-xs font-semibold text-brand-blue">
            {progress > 0 && progress < 100 ? (
              `${progress}%`
            ) : (
              /* The same border-spinner every other loading state in this app uses. */
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-brand-blue/30 border-t-brand-blue"
              />
            )}
          </span>
        )}

        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>

      <div className="flex-1 pt-1">
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Profile photo</p>

        {!compact && (
          <p className="text-xs text-gray-500">
            Profiles with a clear headshot get noticeably more recruiter attention.
          </p>
        )}

        <p className={`text-xs text-gray-500 ${compact ? '' : 'mt-2'}`}>
          PNG, JPEG, or WebP. Drag one here or{' '}
          <label
            htmlFor={inputId}
            className="cursor-pointer font-semibold text-brand-blue hover:text-blue-700"
          >
            browse your files
          </label>
          . It is cropped to a square and resized for you.
        </p>

        {/*
          `role="status"` so the outcome is announced. Without it, a keyboard or screen-reader user
          who picks a file gets no feedback at all — the avatar changing is a purely visual event.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {busy ? 'Uploading your photo.' : ''}
        </p>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        {/*
          Remove is offered only for a photo WE store. A Google avatar is not ours to delete, and a
          button that appeared to remove it and then left it in place would be a lie.
        */}
        {hasUploaded && !busy && (
          <button
            type="button"
            onClick={handleRemove}
            className="mt-2 text-xs font-semibold text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-red-600"
          >
            Remove photo
          </button>
        )}
      </div>
    </div>
  );
}
