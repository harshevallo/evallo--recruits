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
  /* The company profile hero, where the logo overlaps the cover band. */
  xl: 'w-24 h-24 text-3xl',
};

/*
 * `cn` is a plain join, not tailwind-merge — two competing `rounded-*` classes would be resolved
 * by stylesheet order rather than by the order they are written. So every radius this component
 * supports is a NAMED shape rather than something a caller passes through `className`.
 */
const SHAPES = {
  circle: 'rounded-full',
  rounded: 'rounded-lg',
  card: 'rounded-2xl',
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
  /* Unknown values fall back to `rounded`, which is what the old boolean did for everything
     that was not `circle` — `square` and `rectangular` are both passed in today. */
  const shapeClass = SHAPES[shape] ?? SHAPES.rounded;

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
