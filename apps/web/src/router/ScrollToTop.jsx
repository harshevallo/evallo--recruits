import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the top on navigation.
 *
 * React Router preserves scroll position across route changes, which is right for a back/forward
 * navigation and wrong for a forward one — landing halfway down a new page. Hash navigations are
 * skipped so ScrollToHash can handle them.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}
