import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';

/**
 * Full-height application shell for CAN-02 (PRD §8.3).
 *
 * The builder is a workbench, not a page: a long, ordered task where "which section am I in" and
 * "how do I leave without losing anything" must stay on screen no matter how far down the form you
 * are. That is why it does not use `MarketingLayout` — it owns the viewport instead of scrolling
 * inside a document, and it carries neither the marketing navbar nor the candidate rail.
 *
 * The whole arrangement is three flex rules, not positioning tricks:
 *
 *   - this element is `h-screen` and `overflow-hidden`, so the document itself can never scroll;
 *   - the page's top bar is `flex-none`, so it keeps its 4rem and stays out of the scroll region;
 *   - the body below is `flex-1 min-h-0`, which is what lets its children scroll rather than
 *     stretch — without `min-h-0` a flex child refuses to shrink below its content and the
 *     overflow escapes to the document, which is the bug that makes "fixed" sidebars drift.
 *
 * Route-level code splitting means the page arrives lazily, so the fallback has to live here:
 * `MarketingLayout`'s Suspense boundary no longer wraps this route.
 */
export function BuilderLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50/50">
      <Suspense fallback={<RouteFallback className="flex-1 py-24" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
