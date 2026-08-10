import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * "Back to the parent screen" affordance for drill-down pages.
 *
 * Extracted from the settings layout, which already had this pattern inline, so every drill-down
 * uses one implementation instead of each page inventing its own arrow. It is a real `Link` to a
 * known parent rather than `history.back()`: a page reached directly — from a notification, a shared
 * URL, a new tab — has no history to go back to, and a dead control is worse than no control.
 */
export function BackLink({ to, label, className = '' }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition-colors hover:text-brand-dark ${className}`}
    >
      <Icon name="chevron-left" className="text-xs" /> {label}
    </Link>
  );
}
