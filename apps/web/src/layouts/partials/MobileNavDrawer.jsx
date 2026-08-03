import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * Mobile navigation panel.
 *
 * A disclosure, not a modal — it expands below the navbar rather than covering the page, so the
 * correct pattern is aria-expanded/aria-controls on the trigger plus Escape to dismiss, not a
 * focus trap.
 *
 * Items with `to` are routes; items with `href` are in-page anchors.
 */
export function MobileNavDrawer({ id, open, onClose, links, ctaTo, ctaLabel }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const itemClass =
    'block rounded-md px-3 py-2 text-base font-medium text-gray-300 hover:bg-gray-800 hover:text-white';

  return (
    <div
      id={id}
      className="border-t border-gray-800 bg-brand-dark/95 backdrop-blur-md md:hidden"
    >
      <nav className="space-y-1 px-2 pb-3 pt-2 sm:px-3" aria-label="Mobile">
        {links.map((link) =>
          link.to ? (
            <Link key={link.to} to={link.to} onClick={onClose} className={itemClass}>
              {link.label}
            </Link>
          ) : (
            <a key={link.href} href={link.href} onClick={onClose} className={itemClass}>
              {link.label}
            </a>
          ),
        )}

        <Link
          to={ctaTo}
          onClick={onClose}
          className="mt-4 block rounded-md bg-brand-blue px-3 py-2 text-center text-base font-medium text-white hover:bg-blue-600"
        >
          {ctaLabel}
        </Link>
      </nav>
    </div>
  );
}
