import { Button, Icon } from '@/components/ui';

/**
 * One "next setup action" on HOME-01 (PRD §5.2: "Home emphasizes next setup actions").
 *
 * Renders a link when `to` is given and a button when `onSelect` is — the distinction matters for
 * keyboard users and open-in-new-tab, and the underlying primitive already honours it.
 */
export function NextActionCard({ icon, title, description, cta, to, onSelect, busy, disabled }) {
  const headingId = `next-action-${icon}`;

  return (
    <li>
      <section
        aria-labelledby={headingId}
        className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <span
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-blue"
          aria-hidden="true"
        >
          <Icon name={icon} />
        </span>

        <h3 id={headingId} className="text-base font-bold text-brand-dark">
          {title}
        </h3>

        {/* flex-1 keeps every CTA on the same baseline regardless of description length. */}
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-gray-600">{description}</p>

        <Button
          {...(to ? { to } : { onClick: onSelect })}
          variant="primary"
          size="sm"
          radius="lg"
          fullWidth
          className="mt-5"
          disabled={disabled || busy}
        >
          {busy ? 'Working…' : cta}
        </Button>
      </section>
    </li>
  );
}
