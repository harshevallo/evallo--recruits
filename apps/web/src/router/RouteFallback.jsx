import { Container } from '@/components/ui';
import { Skeleton } from '@/components/feedback/Skeleton';

/**
 * What a lazily-loaded route shows while its chunk downloads.
 *
 * Route-level code splitting means a screen can be one network round trip away, so every layout
 * that renders a split route wraps its `<Outlet/>` in `<Suspense fallback={<RouteFallback/>}>`.
 * The boundary sits INSIDE each layout on purpose: the navigation chrome stays mounted, so only
 * the page area swaps, and nothing flashes back to a blank document.
 *
 * It is announced, not just drawn — `role="status"` with an off-screen label, so a screen-reader
 * user hears that something is loading rather than meeting silence.
 */
export function RouteFallback({ className = 'py-24' }) {
  return (
    <Container className={className}>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading page…</span>
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="mt-6 h-4 w-full max-w-xl rounded" />
        <Skeleton className="mt-3 h-4 w-full max-w-md rounded" />
        <Skeleton className="mt-10 h-48 w-full rounded-2xl" />
      </div>
    </Container>
  );
}
