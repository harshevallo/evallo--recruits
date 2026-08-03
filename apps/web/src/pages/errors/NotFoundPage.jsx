import { Link } from 'react-router-dom';
import { PATHS } from '@/router/paths';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue">404</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-md text-slate-600">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        to={PATHS.HOME}
        className="mt-8 rounded-full bg-brand-blue px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
      >
        Back to home
      </Link>
    </main>
  );
}
