import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '@/router/RouteFallback';
import { MarketingNavbar } from './partials/MarketingNavbar';
import { MarketingFooter } from './partials/MarketingFooter';

/**
 * Chrome for the public marketing surface, and — with `footer={false}` — for the signed-in app.
 *
 * @param {boolean} [footer=true]
 *   Whether to render the marketing footer.
 *
 *   **`false` for the whole authenticated application.** A footer is a page-level affordance: it
 *   belongs under a document a visitor has finished reading, where the next thing they might want
 *   is another page. A workspace is not a document. Its navigation lives in the rail, it is
 *   frequently a fixed-height screen (messages, the pipeline board), and a strip of marketing and
 *   legal links at the bottom of a candidate pipeline is chrome the person there never wants.
 *
 *   Public pages keep the full footer: for a visitor those columns are the site's navigation, and
 *   PRD §17 counts them as internal linking for search. This prop is the whole separation — the
 *   `MarketingFooter` component is untouched and still used.
 *
 * @param {boolean} [transparentOnTop]
 *   Set ONLY for pages whose first section is a dark hero (currently just MKT-01). Light-background
 *   pages leave it off so the navbar stays solid and legible.
 *
 * SSR-safe zone (ADR-004): nothing here or below may read AuthContext, CompanyContext, or
 * browser-only APIs during render.
 */
export function MarketingLayout({ transparentOnTop = false, footer = true }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNavbar transparentOnTop={transparentOnTop} />

      <main id="main-content" className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      {footer && <MarketingFooter />}
    </div>
  );
}
