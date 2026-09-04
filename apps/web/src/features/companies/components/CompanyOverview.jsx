import {
  EDUCATION_SERVICE_LABELS,
  DELIVERY_MODE_LABELS,
  LEARNER_SEGMENT_LABELS,
} from '@evallo/shared';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';

/**
 * One block of the profile.
 *
 * Renders nothing when it has no children, so a sparse company page closes up rather than
 * showing a heading over an empty space. Every caller below relies on that: the conditions are
 * expressed as "is there content", not as a chain of `&&` around the heading.
 *
 * `editHref` is the REC-06 affordance. When absent — which is always, on PUB-02 and CAN-06 —
 * nothing about this renders, so the public page carries no trace of an editing surface.
 */
function Section({ id, title, editHref, children }) {
  if (!children) return null;
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-brand-dark">{title}</h2>
        {editHref && <EditLink to={editHref} label={title} />}
      </div>
      {children}
    </section>
  );
}

/**
 * "Edit" beside a section heading, on the recruiter's preview only.
 *
 * ── Why it is always visible, and not hover-only ──────────────────────────────────────────────
 *
 * The reference reveals these on hover (`body.admin-mode .editable-section:hover`). Hover does not
 * exist on a touch screen and cannot be reached from a keyboard, so a hover-only control is one
 * that a phone or a keyboard user simply does not have. It stays quiet instead — small, grey, and
 * only darkening on hover and focus — which costs the preview very little and keeps the control
 * operable for everyone.
 *
 * The accessible name carries the section ("Edit company overview"); several of these sit on one
 * page, and a list of five identical "Edit" links is unusable in a screen reader's link list.
 */
function EditLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-colors hover:border-brand-blue hover:text-brand-blue focus-visible:border-brand-blue focus-visible:text-brand-blue"
    >
      <Icon name="pen" className="text-[10px]" />
      Edit
      <span className="sr-only"> {label.toLowerCase()}</span>
    </Link>
  );
}

/** A titled sub-block inside a section — "Our teaching philosophy", "Mission". */
function Passage({ title, children }) {
  if (!children) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold text-brand-dark">{title}</h3>
      <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-gray-600">
        {children}
      </p>
    </div>
  );
}

/** A chip card — "Programs and subjects", "Learner segments". */
function ChipCard({ icon, title, chips }) {
  if (chips.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-dark">
        <Icon name={icon} className="text-gray-400" /> {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-brand-dark">{children}</dd>
    </div>
  );
}

/**
 * About, trust metrics, education footprint, culture, and the company detail panel —
 * PRD §7.4, §13.
 *
 * ── Shared by three routes ────────────────────────────────────────────────────────────────────
 *
 * PUB-02 (public), CAN-06 (signed-in candidate), and REC-06 (recruiter preview) all draw the
 * company with this one component, against the one `serialisePublicCompany` payload. REC-06 in
 * particular MUST match PUB-02 exactly — a recruiter approves what they see here and publishes it
 * — so anything that varies between the three belongs in the page, never in this file.
 *
 * ── Why the details panel stayed ──────────────────────────────────────────────────────────────
 *
 * The HTML reference has no right-hand column: it moves industry, size, founding year and work
 * model into a meta row under the company name and drops the rest. That row cannot hold all six,
 * and "work model" and "founded" are exactly the facts a candidate scans for before reading a
 * word of prose. So the reference's section rhythm is adopted and the panel is kept — which is
 * also why the page renders at `max-w-7xl` rather than the reference's `max-w-4xl`: minus a
 * 320px aside, the reading column lands at roughly the reference's own measure.
 */
export function CompanyOverview({ company, editStepHref }) {
  /* `editStepHref` is REC-06-only (see `Section`); undefined everywhere else. */
  const editHref = (stepKey) => editStepHref?.(stepKey);

  const { description = {} } = company;
  const services = company.educationServices ?? [];
  const subjects = company.subjects ?? [];
  const segments = company.learnerSegments ?? [];
  const delivery = company.deliveryModes ?? [];
  const metrics = company.metrics ?? [];
  const perks = company.perks ?? [];
  const quote = company.pullQuote;

  const hasContact = company.publicContact?.email || company.publicContact?.phone;
  const about = description.full || description.short;

  const programChips = [
    ...services.map((service) => EDUCATION_SERVICE_LABELS[service] ?? service),
    ...subjects,
  ];
  const segmentChips = segments.map((segment) => LEARNER_SEGMENT_LABELS[segment] ?? segment);

  /* The culture block is several optional parts; it is only worth a heading if one of them exists. */
  /* See the panel below: it now holds only what the hero does not already state, so for a sparse
     company it can legitimately have no rows at all. */
  const hasDetails = Boolean(company.foundingYear || delivery.length > 0);

  const hasAside = hasDetails || hasContact;

  const hasCulture = Boolean(
    quote?.text || description.philosophy || description.culture || description.mission ||
      description.values || perks.length > 0,
  );

  return (
    <div className={`grid grid-cols-1 gap-8 ${hasAside ? 'lg:grid-cols-[1fr_320px]' : ''}`}>
      <div className="space-y-16">
        <Section id="overview" title="Company overview" editHref={editHref('brand')}>
          {about ? (
            <div className="max-w-prose whitespace-pre-line leading-relaxed text-gray-600">{about}</div>
          ) : (
            <p className="text-sm text-gray-500">This company has not added a description yet.</p>
          )}

          {/*
            Self-reported figures (see `metricSchema`), so they are presented as the company's own
            claim — no verification tick, and they feed nothing but this grid.

            Two columns before `xl`, not four. Beside the 320px aside the reading column is around
            560px until then, and a four-across grid there gives each tile ~130px — narrow enough
            that "Median SAT gain" wraps to three lines and the number stops being the thing you
            see first.
          */}
          {metrics.length > 0 && (
            <dl className="mt-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
              {metrics.map((metric) => (
                <div
                  key={`${metric.value}-${metric.label}`}
                  className="rounded-xl border border-gray-200 bg-white p-4 text-center"
                >
                  <dd className="mb-1 text-2xl font-bold text-brand-dark">{metric.value}</dd>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {metric.label}
                  </dt>
                </div>
              ))}
            </dl>
          )}
        </Section>

        <Section id="expertise" title="Education footprint" editHref={editHref('footprint')}>
          {programChips.length > 0 || segmentChips.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ChipCard icon="book-open" title="Programs and subjects" chips={programChips} />
              <ChipCard icon="users" title="Learner segments" chips={segmentChips} />
            </div>
          ) : null}
        </Section>

        {hasCulture && (
          <Section id="culture" title={`Life at ${company.name}`} editHref={editHref('culture')}>
            <div className="space-y-6">
              {quote?.text && (
                <figure className="rounded-xl bg-brand-blue p-6 text-white shadow-sm">
                  <Icon name="quote" className="mb-3 text-blue-200" />
                  <blockquote className="max-w-prose text-base font-medium leading-relaxed sm:text-lg">
                    {quote.text}
                  </blockquote>
                  {quote.attribution && (
                    <figcaption className="mt-3 text-xs font-medium text-blue-100">
                      — {quote.attribution}
                    </figcaption>
                  )}
                </figure>
              )}

              <Passage title="Our teaching philosophy">{description.philosophy}</Passage>
              <Passage title="Why work here">{description.culture}</Passage>
              <Passage title="Mission">{description.mission}</Passage>
              <Passage title="Values">{description.values}</Passage>

              {perks.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-brand-dark">Educator perks</h3>
                  <ul className="flex flex-wrap gap-x-4 gap-y-2">
                    {perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-2 text-sm text-gray-600">
                        <Icon name="circle-check" className="shrink-0 text-green-500" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>

      {hasAside && (
        <aside className="space-y-6">
          {hasDetails && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-brand-dark">Company details</h2>
                {editStepHref && <EditLink to={editHref('basics')} label="Company details" />}
              </div>
              <dl>
                <DetailRow label="Founded">{company.foundingYear}</DetailRow>
                <DetailRow label="Work model">
                  {delivery.length > 0
                    ? delivery.map((m) => DELIVERY_MODE_LABELS[m] ?? m).join(', ')
                    : null}
                </DetailRow>
              </dl>
            </div>
          )}

          {/* PRD §11.2 — in-platform contact is the default, so this block is often absent. */}
          {hasContact && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-lg font-bold text-brand-dark">Contact</h2>
              <ul className="space-y-2 text-sm">
                {company.publicContact.email && (
                  <li>
                    <a
                      href={`mailto:${company.publicContact.email}`}
                      className="flex items-center gap-2 break-all text-brand-blue hover:underline"
                    >
                      <Icon name="comments" className="shrink-0" /> {company.publicContact.email}
                    </a>
                  </li>
                )}
                {company.publicContact.phone && (
                  <li className="flex items-center gap-2 text-gray-600">
                    <Icon name="comments" className="shrink-0" /> {company.publicContact.phone}
                  </li>
                )}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
