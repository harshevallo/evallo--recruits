import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ScrollToTop } from '@/router/ScrollToTop';
import { ScrollToHash } from '@/router/ScrollToHash';
import { CompanyProvider } from '@/context/CompanyContext';
import { RouteFallback } from '@/router/RouteFallback';

/**
 * Wraps every route with scroll behaviour and the skip link.
 *
 * CompanyProvider lives here rather than in AppProviders because it reads the active company
 * from the URL, which requires being inside the router. Outside a company route it simply
 * resolves to no active company.
 *
 * The Suspense here is a BACKSTOP for code splitting. Each layout has its own boundary so that
 * navigation chrome survives a chunk fetch; this one only catches a split route that is not
 * inside a layout, which would otherwise throw "a component suspended while responding to
 * synchronous input".
 */
export function RootLayout() {
  return (
    <CompanyProvider>
      <ScrollToTop />
      <ScrollToHash />

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </CompanyProvider>
  );
}
