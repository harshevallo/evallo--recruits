import { Outlet } from 'react-router-dom';
import { ScrollToTop } from '@/router/ScrollToTop';
import { ScrollToHash } from '@/router/ScrollToHash';
import { CompanyProvider } from '@/context/CompanyContext';

/**
 * Wraps every route with scroll behaviour and the skip link.
 *
 * CompanyProvider lives here rather than in AppProviders because it reads the active company
 * from the URL, which requires being inside the router. Outside a company route it simply
 * resolves to no active company.
 */
export function RootLayout() {
  return (
    <CompanyProvider>
      <ScrollToTop />
      <ScrollToHash />

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Outlet />
    </CompanyProvider>
  );
}
