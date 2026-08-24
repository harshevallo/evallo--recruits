import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog.
 *
 * Unlike the mobile nav (a disclosure), this genuinely covers the page, so it needs the full
 * dialog treatment: focus moves in on open, is trapped while open, and returns to the trigger on
 * close. Escape and backdrop click both dismiss.
 */
/**
 * @param {'md'|'wide'} [size]
 *   `wide` is for content with its own aspect ratio to honour — currently the portfolio's video
 *   player, where `max-w-lg` would letterbox a 16:9 frame down to something not worth watching.
 *   Everything else stays `md`; a dialog wider than its content is harder to read, not easier.
 */
const PANEL_WIDTH = Object.freeze({ md: 'sm:max-w-lg', wide: 'sm:max-w-3xl' });

export function Modal({ open, onClose, title, description, size = 'md', children }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  /*
   * `onClose` is read through a ref so the setup effect below can depend on `open` ALONE.
   *
   * Callers pass it inline — `onClose={() => setEditing(null)}` — which is a new function identity
   * on every render. With `onClose` in the dependency array, every keystroke inside the dialog
   * re-ran the whole effect: focus was pushed back to the first field, so typing a name jumped the
   * cursor out of the field after each character and the form was unusable. The ref keeps the
   * latest handler available without making the effect re-run when its identity changes.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;

    // Move focus into the dialog so the next Tab stays inside it.
    const firstField = panelRef.current?.querySelector(FOCUSABLE);
    (firstField ?? panelRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Prevent the page behind the dialog from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    /*
      `h-[100dvh]`, not the `inset-0` height alone.
      On a phone browser the layout viewport includes the area behind a collapsing URL bar, so a
      panel sized to it extends past what is actually on screen — which is how a bottom-anchored
      dialog ends up with its Cancel and Save buttons cut off and unreachable. The dynamic viewport
      unit tracks the visible area instead, and `dvh` degrades to the same value as `vh` on desktop.
    */
    <div className="fixed inset-0 z-[100] flex h-[100dvh] items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-brand-dark/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-description' : undefined}
        tabIndex={-1}
        /*
          The extra bottom padding clears the phone's home indicator, which otherwise sits on top
          of the last control in the dialog — usually the primary action. `max()` keeps the normal
          padding on hardware that reports no inset.
        */
        className={`relative z-10 max-h-full w-full overflow-y-auto rounded-t-2xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-8 sm:pb-8 ${PANEL_WIDTH[size] ?? PANEL_WIDTH.md}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-brand-dark">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="mt-1 text-sm text-gray-600">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-2 -mt-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-dark"
          >
            <Icon name="xmark" className="text-xl" />
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body,
  );
}
