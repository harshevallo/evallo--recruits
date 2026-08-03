import { cn } from '@/utils/cn';

/**
 * Photo or generated initials.
 *
 * The initials fallback is not optional — PRD §7.3 makes a company logo optional and requires
 * generated initials in its place.
 *
 * The prototype fetches a placeholder avatar from an external host (placehold.co). Rendering
 * initials locally removes a third-party request from the critical path and looks identical.
 */

const SIZES = {
  sm: 'w-6 h-6 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-2xl',
};

export function Avatar({
  src,
  alt = '',
  initials,
  size = 'md',
  shape = 'circle',
  tone = 'brand',
  className,
}) {
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';

  if (src) {
    return (
      <img
        src={src}
        // Empty alt when the image carries no information beyond the adjacent name.
        alt={alt}
        className={cn('flex-shrink-0 object-cover', SIZES[size], shapeClass, className)}
      />
    );
  }

  const toneClass =
    tone === 'brand' ? 'bg-brand-blue text-white' : 'bg-slate-200 text-slate-600';

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex flex-shrink-0 items-center justify-center font-bold',
        SIZES[size],
        shapeClass,
        toneClass,
        className,
      )}
    >
      {initials}
    </div>
  );
}
