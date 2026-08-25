import { ORGANIZATION_TYPE_LABELS } from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';

function formatLocation(location) {
  if (!location) return null;
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

/**
 * Hero block — PRD §7.4 (logo, name, tagline, location, type, website, hiring state).
 *
 * ── The hero is LIGHT, and this block used to assume it was dark ──────────────────────────────
 *
 * `.hero-pattern` paints `colors.white` with two 6–8% blue radials over it. Every text colour here
 * was chosen for a dark hero, so on that white surface the company name rendered `text-white` on
 * `rgb(255,255,255)` — a contrast ratio of **1.00:1**, invisible rather than merely low. The
 * tagline and the meta row were `text-gray-400`, measured at 2.54:1, under the 4.5:1 AA floor.
 *
 * The colours below are the ones `CandidateCompanyPage` already uses to render this same content
 * on a light surface — `text-brand-dark` for the name, `text-gray-600` for the tagline, and the
 * `!border-gray-300 !text-brand-dark` override on `outlineDark`. Nothing new was invented and the
 * gradient was not touched; this block was simply brought onto the background it actually sits on.
 *
 * If the hero is ever made dark again, these are what have to change back — together.
 */
export function CompanyProfileHeader({ company, onExpressInterest }) {
  const location = formatLocation(company.location);

  return (
    <section className="hero-pattern pb-12 pt-32">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-5">
            <Avatar
              src={company.logoUrl}
              initials={company.initials}
              size="lg"
              shape="rounded"
              tone="brand"
              className="shadow-inner"
            />

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {/*
                  `break-words` because a company name is user-supplied and unbounded. Without it a
                  single long unbroken word (a domain-style name) overflows the flex row instead of
                  wrapping, and the fix for contrast would just expose a different defect.
                */}
                <h1 className="text-3xl font-bold tracking-tight text-brand-dark break-words md:text-4xl">
                  {company.name}
                </h1>
                {company.isVerified && (
                  <Badge tone="brand" size="sm" radius="full">
                    <Icon name="shield-halved" /> Verified
                  </Badge>
                )}
              </div>

              {company.tagline && (
                <p className="mb-3 text-lg text-gray-600">{company.tagline}</p>
              )}

              {/*
                gray-600, not gray-500. Against flat white gray-500 measures 4.83:1 and looks
                safe — but the background is not flat white. Where the radials are strongest the
                pixel is rgb(235,244,253), and gray-500 falls to 4.35:1 there, under the 4.5 AA
                floor. gray-600 holds 6.8:1 at that same worst point. Hierarchy is carried by
                size instead: this row is `text-sm` against the tagline's `text-lg`.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                <span>
                  {ORGANIZATION_TYPE_LABELS[company.organizationType] ??
                    company.organizationType}
                </span>
                {location && <span>{location}</span>}
                {company.sizeRange && <span>{company.sizeRange} employees</span>}
                {company.foundingYear && <span>Founded {company.foundingYear}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col items-stretch gap-3 md:items-end">
            {company.isCurrentlyHiring ? (
              <Badge tone="successDark" size="md" radius="full" weight="bold">
                Currently hiring
              </Badge>
            ) : (
              <Badge tone="neutral" size="md" radius="full" className="!bg-gray-800 !border-gray-700 !text-gray-300">
                Not hiring right now
              </Badge>
            )}

            {/*
              PRD §9.3 — interest is offered when the company is hiring, or when it accepts
              general interest while not actively hiring.
            */}
            {(company.isCurrentlyHiring || company.acceptsGeneralInterest) && (
              <Button variant="primary" size="md" onClick={onExpressInterest}>
                I&apos;m interested <Icon name="arrow-right" className="text-sm" />
              </Button>
            )}

            {company.website && (
              <Button
                href={company.website}
                variant="outlineDark"
                size="sm"
                /* `outlineDark` is white-on-transparent — also invisible here. Same override the
                   candidate-facing company page uses for this variant on a light surface. */
                className="justify-center !border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Visit website
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
