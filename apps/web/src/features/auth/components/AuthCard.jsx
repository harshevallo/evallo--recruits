/**
 * Shared shell for the auth screens: title, subtitle, body, and an optional footer link.
 * Keeps SignIn/SignUp/Forgot/Reset visually consistent without duplicating layout.
 */
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight text-brand-dark">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-gray-600">{subtitle}</p>}

      <div className="mt-6">{children}</div>

      {footer && <div className="mt-6 text-center text-sm text-gray-600">{footer}</div>}
    </div>
  );
}

/** "or" divider between social and email auth. */
export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">or</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
