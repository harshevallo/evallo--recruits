import { cn } from '@/utils/cn';

/**
 * Page width and horizontal gutters.
 *
 * `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` appears six times verbatim in the prototype.
 */
export function Container({ as: Component = 'div', size = 'default', className, children }) {
  const widths = {
    default: 'max-w-7xl',
    narrow: 'max-w-4xl',
    prose: 'max-w-2xl',
  };

  return (
    <Component className={cn('mx-auto px-4 sm:px-6 lg:px-8', widths[size], className)}>
      {children}
    </Component>
  );
}
