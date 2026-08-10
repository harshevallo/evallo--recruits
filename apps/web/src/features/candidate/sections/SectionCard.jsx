import { Icon } from '@/components/ui';

/**
 * The builder's panel surface (CAN-02).
 *
 * Every section is built from these rather than one card per screen, because the reference groups
 * a section's questions into named modules — "Employment Parameters", "Core Methodology" — and a
 * single undifferentiated card cannot express that grouping.
 *
 * `tone="accent"` is the role-conditional variant: a tinted, blue-bordered panel that marks a
 * block as belonging to the roles the candidate picked rather than to everyone.
 */
export function SectionCard({ title, description, icon, tone = 'default', className = '', children }) {
  const isAccent = tone === 'accent';

  return (
    <section
      className={`rounded-2xl border p-6 shadow-sm sm:p-8 ${
        isAccent ? 'border-brand-blue/20 bg-blue-50/20' : 'border-gray-200 bg-white'
      } ${className}`}
    >
      {title && (
        <header className={description ? 'mb-6' : 'mb-4'}>
          <h3
            className={`flex items-center gap-2 text-base font-bold text-brand-dark ${
              description ? '' : `border-b pb-3 ${isAccent ? 'border-brand-blue/10' : 'border-gray-100'}`
            }`}
          >
            {icon && <Icon name={icon} className="text-brand-blue" />}
            {title}
          </h3>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </header>
      )}

      {children}
    </section>
  );
}
