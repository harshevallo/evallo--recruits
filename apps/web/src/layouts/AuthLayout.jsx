import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/ui';

/**
 * Centred single-task layout for the authentication screens.
 *
 * PRD §19.1: one principal task per onboarding page, generous white space, no navigation
 * competing with the task.
 */
/**
 * @param {object} props
 * @param {'form'|'wide'} [props.width]  `wide` is for AUTH-05, whose three side-by-side choices
 *   do not fit the single-column form measure. Everything else keeps the narrow measure.
 */
export function AuthLayout({ width = 'form' }) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-light">
      <header className="px-6 py-6">
        <Logo tone="dark" />
      </header>

      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-8">
        <div className={width === 'wide' ? 'w-full max-w-5xl' : 'w-full max-w-md'}>
          <Outlet />
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-gray-500">
        &copy; 2026 Evallo. All rights reserved.
      </footer>
    </div>
  );
}
