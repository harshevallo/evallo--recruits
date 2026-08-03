import { ORGANIZATION_TYPE_LABELS } from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';

function formatLocation(location) {
  if (!location) return null;
  return [location.city, location.region, location.country].filter(Boolean).join(', ');
}

/** Hero block — PRD §7.4 (logo, name, tagline, location, type, website, hiring state). */
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
                <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                  {company.name}
                </h1>
                {company.isVerified && (
                  <Badge tone="brand" size="sm" radius="full">
                    <Icon name="shield-halved" /> Verified
                  </Badge>
                )}
              </div>

              {company.tagline && (
                <p className="mb-3 text-lg text-gray-400">{company.tagline}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
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
                className="justify-center"
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
