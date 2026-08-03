import { cn } from '@/utils/cn';

/**
 * Page section with consistent vertical rhythm and a background tone.
 *
 * `id` doubles as the in-page anchor target (#businesses, #educators, #features, #get-started).
 */

const TONES = {
  white: 'bg-white',
  light: 'bg-brand-light',
  dark: 'bg-brand-dark text-white',
  brand: 'bg-brand-blue text-white',
};

export function Section({ id, tone = 'white', className, children }) {
  return (
    <section id={id} className={cn('py-24', TONES[tone], className)}>
      {children}
    </section>
  );
}
