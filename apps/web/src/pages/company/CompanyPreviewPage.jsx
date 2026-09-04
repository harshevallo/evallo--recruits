import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { CompanyProfileView } from '@/features/companies/components/CompanyProfileView';
import { fetchCompanyPreview, publishCompany, unpublishCompany } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-06 — preview and publish (PRD §7.2, §9.3).
 *
 * The preview is rendered from `serialisePublicCompany` — the SAME server serialiser PUB-02 uses —
 * and drawn by the SAME `CompanyProfileView` that PUB-02 and CAN-06 draw. Neither the data nor the
 * rendering is duplicated, so what a recruiter reviews here is what the public gets.
 *
 * That claim used to be only half true. The body was shared but the surrounding panel was built by
 * hand here — its own cover band, its own name-and-tagline header, its own roles heading — so the
 * moment the public page changed, the "preview" was previewing something else.
 *
 * Publishing is the only transition that makes the page anonymously readable; unpublishing
 * returns it to draft and withdraws it from the directory (§9.3).
 */
export function CompanyPreviewPage() {
  const { companySlug } = useParams();

  const [state, setState] = useState({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchCompanyPreview(companySlug, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, [companySlug]);

  async function reload() {
    setState({ status: 'ready', ...(await fetchCompanyPreview(companySlug)) });
  }

  async function handlePublish(shouldPublish) {
    setBusy(true);
    setFeedback(null);
    try {
      if (shouldPublish) await publishCompany(companySlug);
      else await unpublishCompany(companySlug);

      await reload();
      setFeedback({
        tone: 'success',
        text: shouldPublish
          ? 'Published. Your page is now live in the public directory.'
          : 'Unpublished. The page is a draft again and no longer publicly visible.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error.details?.publish ?? error.message ?? 'We could not update the page.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading the preview…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load this page.'}</StatusRegion>
        <Button to={PATHS.APP_HOME} variant="primary" size="md" className="mt-6">
          Back to home
        </Button>
      </Container>
    );
  }

  const { preview, publish, status, publicUrl } = state;
  const isPublished = status === 'published';

  /*
   * Each section of the preview links to the wizard step that owns it. The wizard reads `?step=`
   * from the query string, and `COMPANY_WIZARD_STEPS` on the server is what decides which fields
   * a step can write — so these keys are the server's, not a second list maintained here.
   */
  const stepHref = (stepKey) =>
    `${buildPath(PATHS.COMPANY_SETUP, { companySlug })}?step=${stepKey}`;

  return (
    <Container className="py-32">
      {/*
        One step up out of this screen, at the TOP — the affordance SET-01 established and that
        `BackLink` exists for. It was a bordered button at the very bottom of the page, which is
        the one place a "go back" control is no use: you have to read or scroll past everything
        first to find out how to leave.
      */}
      <BackLink to={PATHS.APP_HOME} label="Back to home" className="mb-6" />

      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-brand-dark">
              Preview and publish
            </h1>
            <Badge tone={isPublished ? 'successLight' : 'neutral'} size="sm" radius="full">
              {isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
          <p className="max-w-xl text-gray-600">
            This is exactly what a candidate sees — the same rendering the public page uses.
          </p>
        </div>

        <Button
          to={buildPath(PATHS.COMPANY_SETUP, { companySlug })}
          variant="outlineDark"
          size="md"
          radius="lg"
          className="shrink-0 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          Edit details
        </Button>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      <section
        aria-labelledby="publish-heading"
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="publish-heading" className="text-lg font-bold text-brand-dark">
          {isPublished ? 'Your page is live' : 'Publish your page'}
        </h2>

        {publish.canPublish ? (
          <p className="mt-2 text-sm text-gray-600">
            {isPublished ? (
              <>
                Anyone can view it at{' '}
                <Link to={publicUrl} className="font-medium text-brand-blue hover:underline">
                  {publicUrl}
                </Link>
                .
              </>
            ) : (
              'Everything required is in place.'
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Still needed before you can publish: {publish.blockers.join(', ')}.
          </p>
        )}

        {/* PRD §7.3 requirements, named rather than scored. */}
        <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {publish.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.done ? (
                <Icon name="circle-check" label="Done" className="text-sm text-green-600" />
              ) : (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gray-300"
                  aria-hidden="true"
                />
              )}
              <span className={item.done ? 'text-gray-500 line-through' : 'text-brand-dark'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          {isPublished ? (
            <>
              <Button
                variant="outlineDark"
                size="md"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                disabled={busy}
                onClick={() => handlePublish(false)}
              >
                Unpublish
              </Button>
              <Button to={publicUrl} variant="primary" size="md" radius="lg">
                View public page
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="md"
              radius="lg"
              disabled={!publish.canPublish || busy}
              onClick={() => handlePublish(true)}
            >
              {busy ? 'Publishing…' : 'Publish page'}
            </Button>
          )}

          {!publish.canPublish && (
            <Button
              to={buildPath(PATHS.COMPANY_SETUP, { companySlug })}
              variant="link"
              size="none"
              radius="none"
              className="self-center text-sm font-medium"
            >
              Finish setup
              <Icon name="arrow-right" className="text-xs" />
            </Button>
          )}
        </div>
      </section>

      {/*
        The public rendering itself — the SAME `CompanyProfileView` PUB-02 and CAN-06 draw, not a
        third arrangement of the same children.

        It used to be a hand-built panel here: its own cover band, its own name-and-tagline header,
        its own roles heading. That is how a "preview" ends up not matching what publishes — and it
        did, the moment the public page was rebuilt. The only additions now are the ones a preview
        legitimately has: the per-section Edit links, and no interest affordance, since a recruiter
        cannot apply to their own roles.
      */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Public view
      </p>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <CompanyProfileView
          company={preview}
          topSpacing="none"
          editStepHref={stepHref}
        />
      </div>
    </Container>
  );
}
