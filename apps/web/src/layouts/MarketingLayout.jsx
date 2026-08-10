import { Outlet } from 'react-router-dom';
import { MarketingNavbar } from './partials/MarketingNavbar';
import { MarketingFooter } from './partials/MarketingFooter';

/**
 * Chrome for the public marketing surface.
 *
 * @param {boolean} [minimalFooter]
 *   Set for the signed-in workspace. The full footer's link columns repeat what the workspace rail
 *   already lists, which made navigation appear twice on every page.
 *
 * @param {boolean} [transparentOnTop]
 *   Set ONLY for pages whose first section is a dark hero (currently just MKT-01). Light-background
 *   pages leave it off so the navbar stays solid and legible.
 *
 * SSR-safe zone (ADR-004): nothing here or below may read AuthContext, CompanyContext, or
 * browser-only APIs during render.
 */
export function MarketingLayout({ transparentOnTop = false, minimalFooter = false }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNavbar transparentOnTop={transparentOnTop} />

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      <MarketingFooter minimal={minimalFooter} />
    </div>
  );
}
