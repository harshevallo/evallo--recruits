import { Link } from 'react-router-dom';
import { PATHS } from '@/router/paths';
import { cn } from '@/utils/cn';

/**
 * Evallo Recruit wordmark: square "E" mark plus the two-tone name.
 *
 * Used in the navbar (colour flips on scroll) and the footer.
 */

const SIZES = {
  sm: { mark: 'w-6 h-6 text-sm rounded', text: 'text-xl' },
  md: { mark: 'w-8 h-8 text-xl rounded-lg', text: 'text-2xl' },
};

export function Logo({ size = 'md', tone = 'light', asLink = true, className }) {
  const dimensions = SIZES[size];
  const wordColor = tone === 'light' ? 'text-white' : 'text-brand-dark';

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex flex-shrink-0 items-center justify-center bg-brand-blue font-bold text-white',
          dimensions.mark,
        )}
      >
        E
      </span>
      <span
        className={cn(
          'font-bold tracking-tight transition-colors duration-300',
          dimensions.text,
          wordColor,
        )}
      >
        Evallo<span className="text-brand-blue">Recruit</span>
      </span>
    </>
  );

  const classes = cn('flex flex-shrink-0 items-center gap-2', className);

  if (!asLink) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link to={PATHS.HOME} className={classes} aria-label="Evallo Recruit — home">
      {content}
    </Link>
  );
}
