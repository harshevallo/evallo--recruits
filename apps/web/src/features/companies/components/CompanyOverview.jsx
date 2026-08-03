import {
  EDUCATION_SERVICE_LABELS,
  DELIVERY_MODE_LABELS,
  ORGANIZATION_TYPE_LABELS,
} from '@evallo/shared';
import { Badge, Icon } from '@/components/ui';

function Section({ title, children }) {
  if (!children) return null;
  return (
    <div className="border-t border-gray-100 py-6 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-lg font-bold text-brand-dark">{title}</h2>
      {children}
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

/** About, programs, and the company detail panel — PRD §7.4, §13. */
export function CompanyOverview({ company }) {
  const { description = {} } = company;
  const services = company.educationServices ?? [];
  const subjects = company.subjects ?? [];
  const delivery = company.deliveryModes ?? [];
  const location = [company.location?.city, company.location?.region, company.location?.country]
    .filter(Boolean)
    .join(', ');

  const hasContact = company.publicContact?.email || company.publicContact?.phone;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
        <Section title="About">
          {description.full || description.short ? (
            <p className="whitespace-pre-line leading-relaxed text-gray-600">
              {description.full || description.short}
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              This company has not added a description yet.
            </p>
          )}
        </Section>

        {description.mission && (
          <Section title="Mission">
            <p className="leading-relaxed text-gray-600">{description.mission}</p>
          </Section>
        )}

        {description.values && (
          <Section title="Values">
            <p className="leading-relaxed text-gray-600">{description.values}</p>
          </Section>
        )}

        {description.culture && (
          <Section title="Why work here">
            <p className="leading-relaxed text-gray-600">{description.culture}</p>
          </Section>
        )}

        {services.length > 0 && (
          <Section title="Programs and expertise">
            <div className="flex flex-wrap gap-2">
              {services.map((service) => (
                <Badge key={service} tone="neutral" size="lg" radius="md">
                  {EDUCATION_SERVICE_LABELS[service] ?? service}
                </Badge>
              ))}
            </div>

            {subjects.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {subjects.map((subject) => (
                  <Badge key={subject} tone="brand" size="sm" radius="md">
                    {subject}
                  </Badge>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>

      <aside className="space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-brand-dark">Company details</h2>
          <dl>
            <DetailRow label="Industry">
              {ORGANIZATION_TYPE_LABELS[company.organizationType] ?? company.organizationType}
            </DetailRow>
            <DetailRow label="Location">{location}</DetailRow>
            <DetailRow label="Company size">
              {company.sizeRange ? `${company.sizeRange} employees` : null}
            </DetailRow>
            <DetailRow label="Founded">{company.foundingYear}</DetailRow>
            <DetailRow label="Work model">
              {delivery.length > 0
                ? delivery.map((m) => DELIVERY_MODE_LABELS[m] ?? m).join(', ')
                : null}
            </DetailRow>
            <DetailRow label="Hiring">
              {company.isCurrentlyHiring
                ? `${company.openRoleCount} open ${company.openRoleCount === 1 ? 'role' : 'roles'}`
                : 'Not hiring'}
            </DetailRow>
          </dl>
        </div>

        {/* PRD §11.2 — in-platform contact is the default, so this block is often absent. */}
        {hasContact && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-brand-dark">Contact</h2>
            <ul className="space-y-2 text-sm">
              {company.publicContact.email && (
                <li>
                  <a
                    href={`mailto:${company.publicContact.email}`}
                    className="flex items-center gap-2 text-brand-blue hover:underline"
                  >
                    <Icon name="comments" /> {company.publicContact.email}
                  </a>
                </li>
              )}
              {company.publicContact.phone && (
                <li className="flex items-center gap-2 text-gray-600">
                  <Icon name="comments" /> {company.publicContact.phone}
                </li>
              )}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
