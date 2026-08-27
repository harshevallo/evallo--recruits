import { ORGANIZATION_TYPE_LABELS } from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';

function formatLocation(location) {
  if (!location) return null;
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

/** The website URL as a candidate reads it — no scheme, no trailing slash. */
function displayHost(website) {
  try {
    return new URL(website).host.replace(/^www\./, '');
  } catch {
    /* A company may have typed "sevensquare.edu" with no scheme; show it as given. */
    return website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

/**
 * Hero block — PRD §7.4 (logo, name, tagline, location, type, website, hiring state).
 *
 * ── Why the cover band, and what it replaced ──────────────────────────────────────────────────
 *
 * This used to be `.hero-pattern` — a white panel with two faint blue radials — and it never drew
 * `coverImageUrl`, even though the field has been on the model and in `PUBLIC_PROFILE_FIELDS` the
 * whole time. Every company that uploaded a cover had it silently discarded. The reference puts
 * the cover where it belongs: a band the identity block overlaps, so the logo reads as sitting on
 * the company's own page rather than floating above a gradient.
 *
 * ── Contrast, which is the thing that keeps breaking here ─────────────────────────────────────
 *
 * Nothing is drawn ON the cover. Name, tagline, and the meta row all sit on white BELOW it, which
 * is what makes them safe: an arbitrary uploaded photograph cannot be contrast-checked in advance,
 * so no text is ever placed over one. The band keeps a `bg-slate-800` floor for the no-cover case
 * and for the moment before the image decodes, and the gradient exists only to stop a bright photo
 * meeting the white page on a hard line.
 *
 * ── `topSpacing`, and why it is not a `className` ─────────────────────────────────────────────
 *
 * The band is the first thing on the page and the navbar is fixed, so something has to clear it —
 * but WHAT has to clear it differs by shell. On the public page nothing sits above this, so it
 * clears the full `h-20` itself. Inside the candidate workspace the layout already renders a
 * sidebar trigger above it on small screens, which does the clearing there, so only the desktop
 * offset is needed.
 *
 * It is a named prop rather than a pass-through `className` because `cn` is a plain join: passing
 * `pt-0` next to a built-in `pt-20` leaves both classes on the element and lets stylesheet order
 * decide, which resolves the wrong way. Exactly one class is applied here instead.
 */
const TOP_SPACING = {
  /** MarketingLayout — a fixed `h-20` navbar and nothing else above the band. */
  navbar: 'pt-20',
  /** CandidateWorkspaceLayout — its own trigger clears the navbar below `md`. */
  workspace: 'md:pt-20',
  /** REC-06's preview panel — embedded mid-page, with nothing fixed above it to clear. */
  none: '',
};

/**
 * @param {React.ReactNode} [actions]
 *   Replaces the default "Express interest" button. The signed-in page has its own set (Save,
 *   Block, interest state), and they belong to that page's relationship state — not to a component
 *   that also renders anonymously.
 */
export function CompanyProfileHeader({
  company,
  onExpressInterest,
  actions,
  topSpacing = 'navbar',
}) {
  const location = formatLocation(company.location);
  const canExpressInterest = company.isCurrentlyHiring || company.acceptsGeneralInterest;

  return (
    <section
      id="hero"
      className={`relative border-b border-gray-200 bg-white ${TOP_SPACING[topSpacing] ?? TOP_SPACING.navbar}`}
    >
      <div className="relative h-48 w-full overflow-hidden bg-slate-800 md:h-64">
        {company.coverImageUrl && (
          <img
            src={company.coverImageUrl}
            alt=""
            /*
              Decorative: the company is already named in the <h1> directly below, so a real alt
              would make a screen reader announce the organisation twice before the heading.
            */
            aria-hidden="true"
            className="h-full w-full object-cover opacity-60"
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
          aria-hidden="true"
        />
      </div>

      {/* Default width, matching the page body below — the reference's `max-w-4xl` does not apply
          here because `CompanyOverview` keeps its 320px aside (see `CompanyProfilePage`). A
          narrower hero would leave the logo inset from the content it introduces. */}
      <Container className="relative -mt-12 pb-10">
        <div className="flex flex-col items-start gap-6 md:flex-row">
          <Avatar
            src={company.logoUrl}
            initials={company.initials}
            size="xl"
            shape="card"
            tone="brand"
            /* No background here — `tone` owns it, and a second `bg-*` would collide (see Avatar). */
            className="border-4 border-white shadow-lg"
          />

          <div className="w-full flex-1 md:pt-14">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  {/*
                    `break-words` because a company name is user-supplied and unbounded — a single
                    long unbroken word (a domain-style name) would otherwise overflow the row.
                  */}
                  <h1 className="break-words text-3xl font-bold tracking-tight text-brand-dark">
                    {company.name}
                  </h1>
                  {company.isVerified && (
                    <Badge tone="brandOutline" size="xs" radius="sm" weight="bold">
                      <Icon name="shield-halved" className="text-[10px]" /> Verified
                    </Badge>
                  )}
                </div>

                {company.tagline && (
                  <p className="mb-4 text-base font-medium text-gray-600">{company.tagline}</p>
                )}

                {/*
                  gray-600, not gray-500 — this row is small, dense, and the only place several of
                  these facts appear. gray-500 on white measures 4.83:1, which passes but leaves no
                  margin at this size; hierarchy is carried by `text-sm` against the tagline
                  instead of by a lighter grey.
                */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Icon name="building" className="text-gray-400" />
                    {ORGANIZATION_TYPE_LABELS[company.organizationType] ??
                      company.organizationType}
                  </span>
                  {company.sizeRange && (
                    <span className="flex items-center gap-1.5">
                      <Icon name="users" className="text-gray-400" />
                      {company.sizeRange} employees
                    </span>
                  )}
                  {location && (
                    <span className="flex items-center gap-1.5">
                      <Icon name="location-dot" className="text-gray-400" />
                      {location}
                    </span>
                  )}
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center gap-1.5 hover:text-brand-blue"
                    >
                      <Icon name="globe" className="text-gray-400" />
                      {displayHost(company.website)}
                    </a>
                  )}
                </div>
              </div>

              {/*
                The reference parks the primary action in a left rail this page does not have, so
                it stays here — the only place on the profile guaranteed to be above the fold.
                PRD §9.3: interest is offered when the company is hiring, or when it accepts
                general interest while not actively hiring.
              */}
              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                {company.isCurrentlyHiring ? (
                  <Badge tone="successLight" size="sm" radius="full" weight="bold">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    Currently hiring
                  </Badge>
                ) : (
                  <Badge tone="neutral" size="sm" radius="full">
                    Not hiring right now
                  </Badge>
                )}

                {actions ??
                  (canExpressInterest && (
                    <Button variant="primary" size="md" radius="lg" onClick={onExpressInterest}>
                      Express interest <Icon name="arrow-right" className="text-xs" />
                    </Button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
