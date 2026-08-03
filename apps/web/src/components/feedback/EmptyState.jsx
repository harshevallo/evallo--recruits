import { Icon } from '@/components/ui';

/**
 * Shown when a query returns nothing. Always offers a way forward — an empty screen with no
 * action is a dead end.
 */
export function EmptyState({ icon = 'filter', title, description, action }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-2xl text-brand-blue">
        <Icon name={icon} />
      </div>

      <h2 className="text-lg font-bold text-brand-dark">{title}</h2>

      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{description}</p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
