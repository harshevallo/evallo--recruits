import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

/**
 * The single button primitive.
 *
 * MKT-01 alone needs five visual treatments, so they are variants here rather than five
 * components. Every later screen uses the same component.
 *
 * `as` matters for semantics: several "buttons" in the prototype are navigation and must render
 * as links. A <button> that navigates is wrong for keyboard and screen-reader users, and breaks
 * open-in-new-tab.
 */

const VARIANTS = {
  /** Solid brand blue. Nav CTA and hero primary. */
  primary:
    'bg-brand-blue text-white shadow-lg hover:bg-blue-600 hover:shadow-brand-blue/40',
  /** Outlined on a dark surface. Hero secondary. */
  outlineDark:
    'bg-transparent border border-gray-600 text-white hover:border-gray-400 hover:bg-gray-800',
  /**
   * Outlined on a LIGHT surface — the secondary action on any normal page.
   *
   * `outlineDark` is `text-white`, for the marketing hero's dark band. Every in-app secondary
   * button was reaching for it anyway and then overriding three of its colours with `!important`
   * (`!border-gray-300 !text-brand-dark hover:!bg-gray-50`) — around forty call sites carry that
   * hack. It works, but it is invisible failure waiting to happen: drop the override and you get
   * white text on a white page, a button that is there, focusable, clickable and unreadable.
   * This variant is what those call sites actually wanted.
   */
  outline:
    'bg-white border border-gray-300 text-brand-dark hover:bg-gray-50 hover:border-gray-400',
  /** White on a dark surface. "Claim Your Company Profile". */
  white: 'bg-white text-brand-dark hover:bg-gray-100',
  /** Near-black. Early-access form submit. */
  dark: 'bg-brand-dark text-white shadow-lg hover:bg-black',
  /** Text-only. "Create Your Educator Profile". */
  link: 'text-brand-blue hover:text-blue-700',
};

const SIZES = {
  sm: 'px-5 py-2.5 text-sm font-medium',
  md: 'px-6 py-3 text-base font-semibold',
  lg: 'px-8 py-4 text-lg font-semibold',
  none: '',
};

const RADII = {
  full: 'rounded-full',
  lg: 'rounded-lg',
  none: '',
};

export function Button({
  as,
  to,
  href,
  variant = 'primary',
  size = 'md',
  radius = 'full',
  fullWidth = false,
  className,
  children,
  ...rest
}) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 transition-all',
    'disabled:cursor-not-allowed disabled:opacity-60',
    VARIANTS[variant],
    SIZES[size],
    RADII[radius],
    fullWidth && 'w-full',
    className,
  );

  // Internal navigation — React Router link.
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  // In-page anchor or external URL.
  if (href) {
    const isExternal = /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className={classes}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }

  const Component = as ?? 'button';
  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
