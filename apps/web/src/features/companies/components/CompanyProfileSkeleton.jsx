import { Container } from '@/components/ui';
import { Skeleton } from '@/components/feedback/Skeleton';

/** Mirrors `CompanyProfileHeader`'s own spacing map — see the note there on why it is named. */
const TOP_SPACING = { navbar: 'pt-20', workspace: 'md:pt-20', none: '' };

/**
 * Loading state for `CompanyProfileView`.
 *
 * Shared for the same reason the view itself is: both company URLs load the same payload through
 * the same hook, so a skeleton written twice is two chances to stop matching the page it stands in
 * for. Shapes mirror the real thing — cover band, overlapping logo, content beside a 320px aside —
 * so nothing jumps when the data lands (PRD §19.1).
 */
export function CompanyProfileSkeleton({ topSpacing = 'navbar' }) {
  return (
    <>
      <div
        className={`border-b border-gray-200 bg-white ${
          TOP_SPACING[topSpacing] ?? TOP_SPACING.navbar
        }`}
      >
        {/*
          A plain div, not `Skeleton`. Skeleton's own `rounded bg-gray-200` cannot be overridden
          from `className` — `cn` is a plain join, so the winner is decided by stylesheet order,
          not by what is written last. The real cover is a solid square-cornered band.
        */}
        <div className="h-48 w-full animate-pulse bg-slate-800 md:h-64" aria-hidden="true" />

        <Container className="-mt-12 pb-10">
          <div className="flex flex-col items-start gap-6 md:flex-row">
            <Skeleton className="h-24 w-24 rounded-2xl border-4 border-white" />
            <div className="w-full flex-1 md:pt-14">
              <Skeleton className="mb-3 h-9 w-72 max-w-full" />
              <Skeleton className="mb-4 h-5 w-96 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <Skeleton className="mb-4 h-6 w-48" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </Container>
    </>
  );
}
