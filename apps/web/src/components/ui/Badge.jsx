import { cn } from '@/utils/cn';

/**
 * Small status pill.
 *
 * Covers every pill in the prototype: "Now accepting pilot partners", "Hiring", "Verified",
 * "SAT 1550+", "SAT Math: 800".
 */

const TONES = {
  brand: 'bg-brand-blue/20 text-brand-blue',
  brandOutline: 'bg-brand-blue/10 border border-brand-blue/20 text-brand-blue',
  successDark: 'bg-green-900/40 text-green-400',
  successLight: 'bg-green-100 text-green-700',
  neutral: 'bg-gray-50 border border-gray-200 text-brand-dark',
};

const SIZES = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-2 text-sm',
};

const RADII = {
  sm: 'rounded',
  md: 'rounded-lg',
  full: 'rounded-full',
};

export function Badge({
  tone = 'brand',
  size = 'sm',
  radius = 'sm',
  weight = 'medium',
  className,
  children,
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        TONES[tone],
        SIZES[size],
        RADII[radius],
        weight === 'bold' ? 'font-bold' : 'font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
