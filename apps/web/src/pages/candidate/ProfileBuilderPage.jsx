import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { BuilderQuestion } from '@/features/candidate/components/BuilderQuestion';
import { fetchProfileBuilder, saveProfileSection } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * CAN-02 — profile builder (PRD §8.3).
 *
 * Section navigation, per-section progress, save and exit, dynamic questions, validation, and a
 * link to the preview. The sections and questions are question-bank configuration (ADR-007), so
 * this page renders whatever the server sends rather than hard-coding the form.
 *
 * Drafting is never blocked: a partial section saves, and `requiredForPublish` shows as guidance
 * rather than a gate. That is PRD §8.3's "skip optional sections and return later".
 */
export function ProfileBuilderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [builder, setBuilder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveMessage, setSaveMessage] = useState(null);

  const inFlight = useRef(false);
  const headingRef = useRef(null);

  const activeKey = searchParams.get('section');
  const activeSection =
    builder?.sections.find((s) => s.key === activeKey) ?? builder?.sections[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();

    fetchProfileBuilder({ signal: controller.signal })
      .then(setBuilder)
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setLoadError(error.message ?? 'We could not load the profile builder.');
      });

    return () => controller.abort();
  }, []);

  /** Editing a field clears its own error but keeps the rest — errors are per question. */
  const handleChange = useCallback((key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSaveState('idle');
  }, []);

  /** Everything the section currently shows: saved values overlaid with unsaved edits. */
  function valueFor(question) {
    return question.key in draft ? draft[question.key] : question.value;
  }

  async function save({ thenExit = false } = {}) {
    if (!activeSection || inFlight.current) return;
    inFlight.current = true;
    setSaveState('saving');
    setSaveMessage(null);

    // Send the whole visible section, so clearing a field persists as cleared.
    const values = Object.fromEntries(
      activeSection.questions.map((q) => [q.key, valueFor(q)]),
    );

    try {
      const next = await saveProfileSection(activeSection.key, values);
      setBuilder(next);
      setDraft({});
      setErrors({});
      setSaveState('saved');
      setSaveMessage('Saved.');
      if (thenExit) navigate(PATHS.CANDIDATE_HOME);
      return true;
    } catch (error) {
      setErrors(error.details ?? {});
      setSaveState('error');
      setSaveMessage(
        error.details
          ? 'Some answers need attention.'
          : (error.message ?? 'We could not save this section.'),
      );
      return false;
    } finally {
      inFlight.current = false;
    }
  }

  /**
   * Switching sections persists any pending edits first.
   *
   * Silently discarding them would lose the candidate's work — PRD §19 asks for recoverable
   * drafts, and a partial section is already a valid save, so there is nothing to gain by
   * throwing the input away. If the pending edits fail validation we stay put and show the
   * errors rather than navigating away from them.
   */
  async function goToSection(key) {
    if (key === activeSection?.key) return;

    if (Object.keys(draft).length > 0) {
      const saved = await save();
      if (!saved) return;
    }

    setSearchParams({ section: key });
    setDraft({});
    setErrors({});
    setSaveState('idle');
    setSaveMessage(null);
    // Move focus to the new section so keyboard and screen-reader users follow the change.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (loadError) {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{loadError}</StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  if (!builder || !activeSection) {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading the profile builder…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  const index = builder.sections.findIndex((s) => s.key === activeSection.key);
  const nextSection = builder.sections[index + 1] ?? null;
  const isSaving = saveState === 'saving';

  return (
    <Container className="py-32">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Profile builder</h1>
          <p className="mt-2 max-w-xl text-gray-600">
            Work through it in any order. Everything saves as a draft — nothing is visible to a
            company until you publish.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <Button
            to={PATHS.CANDIDATE_PROFILE_PREVIEW}
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
          >
            Preview
          </Button>
          <Button
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => save({ thenExit: true })}
            disabled={isSaving}
          >
            Save and exit
          </Button>
        </div>
      </header>

      {builder.publishBlockers.length > 0 && (
        <StatusRegion tone="info" className="mb-8">
          {builder.publishBlockers.length} answer
          {builder.publishBlockers.length === 1 ? '' : 's'} still needed before you can publish:{' '}
          {builder.publishBlockers.join(', ')}.
        </StatusRegion>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        {/* Section navigation with per-section progress (PRD §8.3). */}
        <nav aria-label="Profile sections">
          <ol className="space-y-1.5">
            {builder.sections.map((section) => {
              const isActive = section.key === activeSection.key;
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => goToSection(section.key)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                      isActive
                        ? 'border-brand-blue bg-blue-50/60'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-brand-dark">
                        {section.title}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {section.answered} of {section.total}
                        {section.optional ? ' · optional' : ''}
                      </span>
                    </span>
                    {section.complete && (
                      <Icon
                        name="circle-check"
                        label="Section complete"
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
          aria-labelledby="section-heading"
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-3">
              <h2
                id="section-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-bold text-brand-dark focus:outline-none"
              >
                {activeSection.title}
              </h2>
              {activeSection.optional && (
                <Badge tone="neutral" size="sm" radius="full">
                  Optional
                </Badge>
              )}
            </div>
            {activeSection.description && (
              <p className="text-sm text-gray-600">{activeSection.description}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Step {index + 1} of {builder.sections.length}
            </p>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {activeSection.questions.map((question) => (
              <BuilderQuestion
                key={question.key}
                question={question}
                value={valueFor(question)}
                error={errors[question.key]}
                disabled={isSaving}
                onChange={handleChange}
              />
            ))}

            {saveMessage && (
              <StatusRegion tone={saveState === 'error' ? 'error' : 'success'} className="mb-5">
                {saveMessage}
              </StatusRegion>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" size="md" radius="lg" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save section'}
              </Button>

              {nextSection && (
                <Button
                  type="button"
                  variant="outlineDark"
                  size="md"
                  radius="lg"
                  className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                  disabled={isSaving}
                  onClick={async () => {
                    // Only advance if the save succeeded — otherwise the user would be carried
                    // away from validation errors they cannot see.
                    if (await save()) await goToSection(nextSection.key);
                  }}
                >
                  Save and continue
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
