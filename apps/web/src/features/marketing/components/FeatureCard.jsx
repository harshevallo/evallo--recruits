import { Icon } from '@/components/ui';

/**
 * Icon + title + body card.
 *
 * One component with a `tone` prop rather than separate light and dark cards — the structure is
 * identical and only the surface colours differ.
 */
export function FeatureCard({ icon, title, children, tone = 'light' }) {
  if (tone === 'dark') {
    return (
      <article className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-brand-blue">
        <Icon
          name={icon}
          className="mb-4 text-3xl text-brand-blue transition-transform group-hover:scale-110"
        />
        <h3 className="mb-2 text-xl font-bold">{title}</h3>
        <p className="text-sm text-gray-600">{children}</p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 text-2xl text-brand-blue">
        <Icon name={icon} />
      </div>
      <h3 className="mb-3 text-xl font-bold text-brand-dark">{title}</h3>
      <p className="leading-relaxed text-gray-600">{children}</p>
    </article>
  );
}
