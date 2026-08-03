import { Button, Icon } from '@/components/ui';

/**
 * One option on the AUTH-05 first-action router: illustration, title, description, primary CTA.
 *
 * The whole card is NOT a click target. Three stacked cards that each swallow a click make the
 * keyboard order ambiguous (card, then button, both doing the same thing) and make an accidental
 * tap on mobile pick a path for the user. The CTA is the single, explicit control.
 */
export function FirstActionChoice({ icon, title, description, cta, onSelect, disabled }) {
  const headingId = `first-action-${icon}`;

  return (
    <li>
      <section
        aria-labelledby={headingId}
        className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
      >
        <span
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-xl text-brand-blue"
          aria-hidden="true"
        >
          <Icon name={icon} />
        </span>

        <h2 id={headingId} className="text-lg font-bold text-brand-dark">
          {title}
        </h2>

        {/* mt-auto pins every CTA to the same baseline regardless of description length. */}
        <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{description}</p>

        <Button
          variant="primary"
          size="md"
          radius="lg"
          fullWidth
          className="mt-6"
          onClick={onSelect}
          disabled={disabled}
        >
          {cta}
        </Button>
      </section>
    </li>
  );
}
