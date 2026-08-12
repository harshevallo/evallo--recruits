import { Badge, Button, Container } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { PATHS } from '@/router/paths';

/**
 * One page component for every legal document (`/terms`, `/privacy`).
 *
 * Two states, and the distinction is the point:
 *
 * - **published** — renders the approved document: a contents list, `<h2>` per section, and the
 *   effective date. Adding that content is a change to `content/legal/`, not to this file.
 * - **pending_approval** — says so plainly. It does NOT paraphrase, summarise or stand in for the
 *   policy, because inventing legal language is worse than admitting the document is not ready,
 *   and a page that reads like terms would be relied on as terms.
 *
 * Replaces `PlaceholderPage` on these two routes. The difference is not cosmetic: this is the
 * real destination with the real structure, so publishing the approved text is a content drop.
 */
export function LegalDocumentPage({ document }) {
  const isPublished = document.status === 'published' && document.sections.length > 0;

  return (
    <Container size="prose" className="py-24 sm:py-32">
      <header className="border-b border-gray-200 pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark sm:text-4xl">
            {document.title}
          </h1>
          {!isPublished && (
            <Badge tone="neutral" size="sm" radius="full">
              Not yet published
            </Badge>
          )}
        </div>

        <p className="text-gray-600">{document.summary}</p>

        {isPublished && document.effectiveDate && (
          <p className="mt-4 text-sm text-gray-500">
            Effective{' '}
            <time dateTime={document.effectiveDate}>
              {new Date(document.effectiveDate).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          </p>
        )}
      </header>

      {isPublished ? (
        <>
          <nav aria-label={`${document.title} contents`} className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Contents
            </h2>
            <ol className="mt-3 space-y-2">
              {document.sections.map((section, index) => (
                <li key={section.id} className="text-sm">
                  <a
                    href={`#${section.id}`}
                    className="text-brand-blue underline-offset-2 hover:underline"
                  >
                    {index + 1}. {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 space-y-12">
            {document.sections.map((section) => (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
                <h2
                  id={`${section.id}-heading`}
                  className="text-xl font-bold tracking-tight text-brand-dark"
                >
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={index} className="leading-relaxed text-gray-700">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-10">
          <StatusRegion tone="info">
            The approved {document.title.toLowerCase()} has not been published yet. We will not
            show draft or example legal text in its place.
          </StatusRegion>

          <div className="mt-8 space-y-4 text-gray-700">
            <p>
              This page is the permanent home for the document. When the approved text is
              published it appears here, at this address, and any link that already points here
              keeps working.
            </p>
            <p>
              If you need the current terms before then — for example before signing up on behalf
              of an organisation — please ask us and we will send you what applies today.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Button to={PATHS.CONTACT} variant="primary" size="md" radius="lg">
              Contact us
            </Button>
            <Button
              to={document.key === 'terms' ? PATHS.PRIVACY : PATHS.TERMS}
              variant="outlineDark"
              size="md"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            >
              {document.key === 'terms' ? 'Privacy Policy' : 'Terms of Service'}
            </Button>
          </div>
        </div>
      )}
    </Container>
  );
}
