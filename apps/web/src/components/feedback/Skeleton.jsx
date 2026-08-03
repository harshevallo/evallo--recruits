import { cn } from '@/utils/cn';

/**
 * Loading placeholder.
 *
 * Sized to match the real content so nothing shifts when data arrives — PRD §19.1 requires
 * validation and loading states that do not cause layout jumps.
 */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-gray-200', className)} aria-hidden="true" />;
}

/** Card-shaped skeleton matching CompanyCard's dimensions. */
export function CompanyCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-4">
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-4 h-4 w-4/5" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}
