import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ORGANIZATION_TYPE_OPTIONS,
  EDUCATION_SERVICE_OPTIONS,
  DELIVERY_MODE_OPTIONS,
  COUNTRY_OPTIONS,
} from '@evallo/shared';
import { Button, Container, Icon } from '@/components/ui';
import { FormField, TextInput, Textarea, SelectInput, Checkbox } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchCompanyEditor, saveCompanyStep } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-02 — company setup wizard (PRD §7.2, §7.3).
 *
 * Draft-first: PRD §7.2 wants a credible page published quickly with "optional enrichment
 * available afterward", so a partial step is a valid save and the §7.3 requirements are enforced
 * only at publish time (REC-06). The step definitions and the publish checklist both come from
 * the server, so the wizard has one source of truth rather than a client-side copy.
 */
const CHECKBOX_SETS = {
  educationServices: EDUCATION_SERVICE_OPTIONS,
  deliveryModes: DELIVERY_MODE_OPTIONS,
};

export function CompanySetupPage() {
  const { companySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState({ status: 'loading' });
  const [draft, setDraft] = useState({});
  const [saveState, setSaveState] = useState('idle');
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const headingRef = useRef(null);

  const activeKey = searchParams.get('step');
  const steps = state.steps ?? [];
  const activeStep = steps.find((s) => s.key === activeKey) ?? steps[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();

    fetchCompanyEditor(companySlug, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, [companySlug]);

  const setField = useCallback((field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveState('idle');
  }, []);

  function valueFor(field) {
    if (field in draft) return draft[field];
    return state.company?.[field];
  }

  async function save() {
    if (!activeStep || inFlight.current) return false;
    inFlight.current = true;
    setSaveState('saving');
    setMessage(null);

    try {
      const next = await saveCompanyStep(companySlug, activeStep.key, draft);
      setState((current) => ({ ...current, ...next }));
      setDraft({});
      setSaveState('saved');
      setMessage('Saved.');
      return true;
    } catch (error) {
      setSaveState('error');
      setMessage(error.message ?? 'We could not save this step.');
      return false;
    } finally {
      inFlight.current = false;
    }
  }

  /** Switching steps persists pending edits first, so nothing typed is silently discarded. */
  async function goToStep(key) {
    if (key === activeStep?.key) return;
    if (Object.keys(draft).length > 0 && !(await save())) return;

    setSearchParams({ step: key });
    setDraft({});
    setSaveState('idle');
    setMessage(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading the setup wizard…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">
          {state.message ?? 'We could not load this company.'}
        </StatusRegion>
        <Button to={PATHS.APP_HOME} variant="primary" size="md" className="mt-6">
          Back to home
        </Button>
      </Container>
    );
  }

  const { company, checklist } = state;
  const index = steps.findIndex((s) => s.key === activeStep.key);
  const nextStep = steps[index + 1] ?? null;
  const isSaving = saveState === 'saving';
  /*
   * One screen, two jobs (REC-02 and REC-17).
   *
   * The fields, the endpoints and the publish checklist are identical whether a company is being
   * set up for the first time or edited afterwards, so this is the same editor rather than a second
   * copy of it. Only the framing changes: telling the owner of a LIVE page that "nothing is public"
   * would be false.
   */
  const isPublished = company.status === 'published';

  return (
    <Container className="py-32">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">
            {isPublished ? 'Company page' : 'Company setup'}
          </h1>
          <p className="mt-2 max-w-xl text-gray-600">
            {company.name} ·{' '}
            {isPublished
              ? 'edits save immediately and update your public page.'
              : 'everything saves as a draft. Nothing is public until you publish.'}
          </p>
        </div>
        <Button
          to={buildPath(PATHS.COMPANY_PREVIEW, { companySlug })}
          variant="outlineDark"
          size="md"
          radius="lg"
          className="shrink-0 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          {isPublished ? 'Preview' : 'Preview and publish'}
        </Button>
      </header>

      {checklist.blockers.length > 0 && (
        <StatusRegion tone="info" className="mb-8">
          {checklist.blockers.length} item{checklist.blockers.length === 1 ? '' : 's'} still needed
          before you can publish: {checklist.blockers.join(', ')}.
        </StatusRegion>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Setup steps">
          <ol className="space-y-1.5">
            {steps.map((step, i) => {
              const isActive = step.key === activeStep.key;
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    onClick={() => goToStep(step.key)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                      isActive
                        ? 'border-brand-blue bg-blue-50/60'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-brand-blue"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-brand-dark">
                        {step.title}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {step.requiredDone} of {step.requiredTotal} required
                      </span>
                    </span>
                    {step.complete && (
                      <Icon
                        name="circle-check"
                        label="Step complete"
                        className="shrink-0 text-sm text-green-600"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section
          aria-labelledby="step-heading"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6">
            <h2
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-bold text-brand-dark focus:outline-none"
            >
              {activeStep.title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">{activeStep.description}</p>
            <p className="mt-1 text-xs text-gray-400">
              Step {index + 1} of {steps.length}
            </p>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {activeStep.key === 'basics' && (
              <>
                <FormField label="Company name" name="name" required className="mb-5">
                  {(f) => (
                    <TextInput
                      {...f}
                      value={valueFor('name') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('name', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Organization type" name="organizationType" required className="mb-5">
                  {(f) => (
                    <SelectInput
                      {...f}
                      options={ORGANIZATION_TYPE_OPTIONS}
                      value={valueFor('organizationType') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('organizationType', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Website" name="website" hint="Optional." className="mb-5">
                  {(f) => (
                    <TextInput
                      {...f}
                      type="url"
                      placeholder="https://example.com"
                      value={valueFor('website') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('website', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Primary country" name="country" required className="mb-5">
                  {(f) => (
                    <SelectInput
                      {...f}
                      options={[{ value: '', label: 'Select…' }, ...COUNTRY_OPTIONS]}
                      value={valueFor('location')?.country ?? ''}
                      disabled={isSaving}
                      onChange={(e) =>
                        setField('location', { ...valueFor('location'), country: e.target.value })
                      }
                    />
                  )}
                </FormField>
                <FormField label="City or region" name="city" hint="Optional." className="mb-5">
                  {(f) => (
                    <TextInput
                      {...f}
                      value={valueFor('location')?.city ?? ''}
                      disabled={isSaving}
                      onChange={(e) =>
                        setField('location', { ...valueFor('location'), city: e.target.value })
                      }
                    />
                  )}
                </FormField>
              </>
            )}

            {activeStep.key === 'brand' && (
              <>
                <FormField label="Tagline" name="tagline" required className="mb-5"
                  hint="One line candidates see first.">
                  {(f) => (
                    <TextInput
                      {...f}
                      maxLength={160}
                      value={valueFor('tagline') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('tagline', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Short description" name="descriptionShort" required className="mb-5">
                  {(f) => (
                    <Textarea
                      {...f}
                      rows={3}
                      value={valueFor('descriptionShort') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('descriptionShort', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Full description" name="descriptionFull" hint="Optional." className="mb-5">
                  {(f) => (
                    <Textarea
                      {...f}
                      rows={6}
                      value={valueFor('descriptionFull') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('descriptionFull', e.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Logo URL" name="logoUrl"
                  hint="Optional — initials are generated from your name when absent." className="mb-5">
                  {(f) => (
                    <TextInput
                      {...f}
                      type="url"
                      value={valueFor('logoUrl') ?? ''}
                      disabled={isSaving}
                      onChange={(e) => setField('logoUrl', e.target.value)}
                    />
                  )}
                </FormField>
              </>
            )}

            {activeStep.key === 'footprint' &&
              ['educationServices', 'deliveryModes'].map((field) => (
                <FormField
                  key={field}
                  label={field === 'educationServices' ? 'Education services' : 'Delivery modes'}
                  name={field}
                  required={field === 'educationServices'}
                  className="mb-6"
                >
                  {({ hasError: _hasError, ...f }) => (
                    // `hasError` is for inputs, not a DOM attribute — never spread it on a fieldset.
                    <fieldset {...f} className="rounded-lg border border-gray-200 p-4">
                      <legend className="sr-only">
                        {field === 'educationServices' ? 'Education services' : 'Delivery modes'}
                      </legend>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {CHECKBOX_SETS[field].map((option) => {
                          const selected = valueFor(field) ?? [];
                          return (
                            <Checkbox
                              key={option.value}
                              label={option.label}
                              checked={selected.includes(option.value)}
                              disabled={isSaving}
                              onChange={(e) =>
                                setField(
                                  field,
                                  e.target.checked
                                    ? [...selected, option.value]
                                    : selected.filter((v) => v !== option.value),
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                </FormField>
              ))}

            {message && (
              <StatusRegion tone={saveState === 'error' ? 'error' : 'success'} className="mb-5">
                {message}
              </StatusRegion>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" size="md" radius="lg" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save step'}
              </Button>

              {nextStep ? (
                <Button
                  type="button"
                  variant="outlineDark"
                  size="md"
                  radius="lg"
                  className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                  disabled={isSaving}
                  onClick={async () => {
                    if (await save()) await goToStep(nextStep.key);
                  }}
                >
                  Save and continue
                  <Icon name="arrow-right" className="text-xs" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outlineDark"
                  size="md"
                  radius="lg"
                  className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                  disabled={isSaving}
                  onClick={async () => {
                    if (await save()) {
                      navigate(buildPath(PATHS.COMPANY_PREVIEW, { companySlug }));
                    }
                  }}
                >
                  Save and preview
                  <Icon name="arrow-right" className="text-xs" />
                </Button>
              )}
            </div>
          </form>
        </section>
      </div>
    </Container>
  );
}
