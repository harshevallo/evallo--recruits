import { cn } from '@/utils/cn';

/**
 * Eyebrow + title + optional subtitle.
 *
 * This component exists to fix a real defect centrally. The prototype marks up the eyebrow
 * ("For Educational Businesses") as an <h2> and the actual section heading as an <h3>, which
 * produces a nonsensical document outline for screen readers and search engines — and it does
 * it inconsistently across sections.
 *
 * Here the eyebrow is a <p> (it is styling, not structure) and the real heading takes the
 * correct level. The rendered appearance is unchanged.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  level = 2,
  align = 'center',
  tone = 'light',
  className,
}) {
  const Heading = `h${level}`;

  const alignment = align === 'center' ? 'text-center mx-auto' : 'text-left';
  const titleColor = tone === 'dark' ? 'text-white' : 'text-brand-dark';
  const subtitleColor = tone === 'dark' ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={cn(alignment, className)}>
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-blue">
          {eyebrow}
        </p>
      )}

      <Heading className={cn('text-3xl font-bold md:text-4xl', titleColor)}>{title}</Heading>

      {subtitle && <p className={cn('mt-4 text-lg', subtitleColor)}>{subtitle}</p>}
    </div>
  );
}
