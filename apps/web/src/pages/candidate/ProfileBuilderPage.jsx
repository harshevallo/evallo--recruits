import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { EntrySection } from '@/features/candidate/components/EntrySection';
import { VisibilitySection } from '@/features/candidate/components/VisibilitySection';
import { questionLayout } from '@/features/candidate/sections/questionLayout';
import { IdentitySection } from '@/features/candidate/sections/IdentitySection';
import { PreferencesSection } from '@/features/candidate/sections/PreferencesSection';
import { ExpertiseSection } from '@/features/candidate/sections/ExpertiseSection';
import { PracticeSection } from '@/features/candidate/sections/PracticeSection';
import { PortfolioSection } from '@/features/candidate/sections/PortfolioSection';
import { CredentialsSection } from '@/features/candidate/sections/CredentialsSection';
import { useAuth } from '@/context/AuthContext';
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

/**
 * How the reference design names and draws each step: sidebar label, page title, and glyph, keyed
 * by section key. Presentation only — the bank still owns the sections and every question. A
 * section the map does not know falls back to its server title, so a bank revision cannot break
 * the sidebar.
 */
const SECTION_META = {
  professional_identity: { nav: 'Identity', title: 'Professional Identity', icon: 'id-card' },
  role_preferences: { nav: 'Preferences', title: 'Role & Preferences', icon: 'bullseye' },
  teaching_expertise: { nav: 'Expertise', title: 'Teaching Expertise', icon: 'book-open' },
  experience_education: {
    nav: 'Experience & Edu',
    title: 'Experience & Education',
    icon: 'briefcase',
  },
  teaching_practice: {
    nav: 'Teaching Practice',
    title: 'Teaching Practice',
    icon: 'chalkboard-user',
  },
  media: { nav: 'Portfolio & Media', title: 'Portfolio & Media', icon: 'video' },
  credential: { nav: 'Credentials & Scores', title: 'Credentials & Scores', icon: 'certificate' },
  visibility: { nav: 'Publish & Visibility', title: 'Publish & Visibility', icon: 'eye' },
};

/** The reference's sidebar order. Anything the server adds later is appended after these. */
const SECTION_ORDER = [
  'professional_identity',
  'role_preferences',
  'teaching_expertise',
  'experience_education',
  'teaching_practice',
  'media',
  'credential',
  'visibility',
];

/**
 * Sections a recruiter weighs heavily even though publication does not require them.
 * Teaching practice and video are what separate two otherwise identical profiles.
 */
const RECRUITER_PRIORITY = new Set(['teaching_practice', 'media']);

/** List headings inside Experience & Education, matching the reference's two sub-lists. */
const ENTRY_GROUP_TITLES = { experience: 'Work Experience', education: 'Education' };

/**
 * The layout for a question section.
 *
 * Each section of the builder is a different screen, not the same form with different questions:
 * identity pairs fields around a photo, preferences splits into a role picker and an employment
 * panel, expertise runs three titled blocks under one card, practice adds a role-conditional
 * panel. A section the map does not know still renders — as its questions in order — so a bank
 * revision that adds a section is never a blank screen.
 */
function renderQuestionSection(section, layout, user) {
  switch (section.key) {
    case 'professional_identity':
      return <IdentitySection layout={layout} user={user} />;
    case 'role_preferences':
      return <PreferencesSection layout={layout} />;
    case 'teaching_expertise':
      return <ExpertiseSection layout={layout} />;
    case 'teaching_practice':
      return <PracticeSection layout={layout} />;
    default:
      return (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          {layout.rest()}
        </div>
      );
  }
}

/**
 * The sections as the reference presents them, derived from the sections the server owns.
 *
 * The one structural difference: the server stores experience and education as two entry
 * collections (ADR-008), but the design shows them as ONE step — "Experience & Edu" — with two
 * lists. Merging is display-time only; each list still talks to its own collection, so nothing
 * about the API or the data changes shape.
 */
function displaySectionsOf(builder) {
  const byKey = new Map(builder.sections.map((section) => [section.key, section]));

  const experience = byKey.get('experience');
  const education = byKey.get('education');
  if (experience && education) {
    byKey.delete('experience');
    byKey.delete('education');
    byKey.set('experience_education', {
      key: 'experience_education',
      kind: 'entries-group',
      title: 'Experience & Education',
      description: 'Build the structured history that replaces a standard resume.',
      optional: experience.optional && education.optional,
      parts: [experience, education],
      questions: [],
      answered: experience.answered + education.answered,
      total: experience.total + education.total,
      complete: experience.complete && education.complete,
    });
  }

  const ordered = SECTION_ORDER.map((key) => byKey.get(key)).filter(Boolean);
  const known = new Set(SECTION_ORDER);
  const rest = [...byKey.values()].filter((section) => !known.has(section.key));
  return [...ordered, ...rest];
}

/**
 * Publish readiness, derived from the SAME `publishBlockers` the publish gate uses.
 *
 * The design labels the meter "Profile Strength", but the number measures one honest thing:
 * whether the answers PRD §8.5 requires are present. `unanswered` is reported separately so the
 * nudge can talk about optional answers without conflating them with the publish gate (I-04a).
 */
function readinessOf(builder) {
  const required = builder.sections
    .filter((section) => !section.optional)
    .reduce((total, section) => total + section.total, 0);

  const outstanding = builder.publishBlockers.length;
  const unanswered = builder.sections.reduce(
    (total, section) => total + Math.max(0, section.total - section.answered),
    0,
  );

  if (required === 0) return { percent: 0, outstanding, unanswered };

  const answered = Math.max(0, required - outstanding);
  return { percent: Math.round((answered / required) * 100), outstanding, unanswered };
}

export function ProfileBuilderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [builder, setBuilder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveMessage, setSaveMessage] = useState(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [toast, setToast] = useState(null);

  const inFlight = useRef(false);
  const headingRef = useRef(null);

  const sections = useMemo(() => (builder ? displaySectionsOf(builder) : []), [builder]);

  // Old links may still say ?section=experience or =education; both live in the merged step now.
  const requestedKey = searchParams.get('section');
  const activeKey =
    requestedKey === 'experience' || requestedKey === 'education'
      ? 'experience_education'
      : requestedKey;
  const activeSection = sections.find((s) => s.key === activeKey) ?? sections[0] ?? null;

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

  /** The toast is transient, as in the reference — it removes itself rather than lingering. */
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /**
   * Re-reads the whole builder after an entry is added, edited or removed.
   *
   * The entry lives in its own collection, but the section counts and the readiness meter are
   * computed server-side from everything at once — so refetching is what keeps the sidebar
   * honest rather than patching a count locally and hoping it matches.
   */
  const reload = useCallback(async () => {
    setBuilder(await fetchProfileBuilder());
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
    if (!activeSection || inFlight.current) return false;

    // Only question sections carry a savable draft; entries and visibility save themselves.
    if (activeSection.kind !== 'questions') {
      if (thenExit) navigate(PATHS.CANDIDATE_HOME);
      return true;
    }
    inFlight.current = true;
    setSaveState('saving');
    setSaveMessage(null);

    // Send the whole visible section, so clearing a field persists as cleared.
    const values = Object.fromEntries(activeSection.questions.map((q) => [q.key, valueFor(q)]));

    try {
      const next = await saveProfileSection(activeSection.key, values);
      setBuilder(next);
      setDraft({});
      setErrors({});
      setSaveState('saved');
      setSaveMessage('Saved.');
      setToast('Saved to your profile');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Move focus to the new section so keyboard and screen-reader users follow the change.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (loadError) {
    return (
      <Container className="py-32">
        <div className="mx-auto max-w-3xl">
          <StatusRegion tone="error">{loadError}</StatusRegion>
          <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
            Back to candidate home
          </Button>
        </div>
      </Container>
    );
  }

  if (!builder || !activeSection) {
    return (
      <Container className="py-32">
        <div className="mx-auto max-w-3xl" role="status" aria-live="polite">
          <span className="sr-only">Loading the profile builder…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  const index = sections.findIndex((s) => s.key === activeSection.key);
  const previousSection = sections[index - 1] ?? null;
  const nextSection = sections[index + 1] ?? null;
  const isSaving = saveState === 'saving';
  const readiness = readinessOf(builder);
  const meta = SECTION_META[activeSection.key] ?? {};

  // Rebuilt each render: it closes over the current draft values, and it tracks which questions a
  // layout has placed so `rest()` can catch the ones it did not.
  const layout = questionLayout({
    questions: activeSection.questions ?? [],
    valueFor,
    errors,
    disabled: isSaving,
    onChange: handleChange,
  });

  /** Bottom-of-pane navigation, shared by every section shape: Back on the left, Next on the right. */
  const footerNav = (
    <div className="mt-8 flex items-center justify-between gap-3">
      {previousSection ? (
        <button
          type="button"
          onClick={() => goToSection(previousSection.key)}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200/60"
        >
          Back
        </button>
      ) : (
        <span />
      )}

      {nextSection && (
        <Button
          type="button"
          variant="primary"
          size="md"
          radius="lg"
          disabled={isSaving}
          className="!bg-brand-dark !px-7 !py-3 hover:!bg-black"
          onClick={async () => {
            // Only advance if the save succeeded — otherwise the user would be carried away
            // from validation errors they cannot see. Non-question sections save themselves.
            if (await save()) await goToSection(nextSection.key);
          }}
        >
          Next: {SECTION_META[nextSection.key]?.title ?? nextSection.title}
          <Icon name="arrow-right" className="text-xs" />
        </Button>
      )}
    </div>
  );

  return (
    <Container className="py-32">
      {/*
        One shell, one rail.

        This screen used to own the whole viewport: its own top bar, its own fixed rail, its own
        scrolling pane. Beside the candidate rail that read as two sidebars fighting each other, and
        moving between it and any other candidate screen swapped the entire chrome. It now lives in
        the same shell as CAN-01/03/04 — the app navbar and the candidate rail — and the eight
        sections become a horizontal strip rather than a second column.
      */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Profile builder</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
            <span
              className="h-2 w-2 flex-none rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <span role="status">{isSaving ? 'Saving…' : 'Saved to cloud'}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            to={PATHS.CANDIDATE_PROFILE_PREVIEW}
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !bg-white !text-brand-dark hover:!bg-gray-50"
          >
            Preview profile
          </Button>
          <Button
            variant="primary"
            size="sm"
            radius="lg"
            className="!bg-brand-dark hover:!bg-black"
            onClick={() => setConfirmExit(true)}
            disabled={isSaving}
          >
            Save & exit
          </Button>
        </div>
      </header>

      {/* Profile strength — the same honest number, now above the sections rather than beside them. */}
      <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Profile strength
          </h2>
          <span className="text-xs font-bold text-brand-blue">{readiness.percent}%</span>
        </div>

        <div
          className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuenow={readiness.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile strength"
        >
          <div
            className="h-2 rounded-full bg-brand-blue transition-all duration-500"
            style={{ width: `${readiness.percent}%` }}
          />
        </div>

        <p className="text-[11px] leading-tight text-gray-500">
          {readiness.outstanding > 0 ? (
            <>
              Add{' '}
              <strong className="font-semibold text-brand-dark">
                {builder.publishBlockers[0]}
              </strong>{' '}
              {readiness.outstanding > 1
                ? `and ${readiness.outstanding - 1} more to publish.`
                : 'to publish.'}
            </>
          ) : readiness.unanswered > 0 ? (
            <>
              Ready to publish. {readiness.unanswered} optional{' '}
              {readiness.unanswered === 1 ? 'answer' : 'answers'} left if you want a fuller profile.
            </>
          ) : (
            <>Everything is answered. You can publish whenever you are ready.</>
          )}
        </p>
      </div>

      {/*
        Section navigation — horizontal, and scrolling sideways rather than collapsing, so every one
        of the eight stays reachable at any width. A second vertical column here is exactly what made
        this screen feel like it had two sidebars.
      */}
      <nav aria-label="Profile sections" className="mb-8 border-b border-gray-200">
        <ol className="-mb-px flex gap-1 overflow-x-auto pb-1">
          {sections.map((section) => {
            const isActive = section.key === activeSection.key;
            const label = SECTION_META[section.key]?.nav ?? section.title;

            return (
              <li key={section.key} className="flex-none">
                <button
                  type="button"
                  onClick={() => goToSection(section.key)}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                    isActive
                      ? 'border-brand-blue font-semibold text-brand-blue'
                      : 'border-transparent font-medium text-gray-600 hover:text-brand-dark'
                  }`}
                >
                  <Icon
                    name={SECTION_META[section.key]?.icon ?? 'circle-check'}
                    className={`text-xs ${isActive ? 'text-brand-blue' : 'text-gray-400'}`}
                  />
                  {label}

                  {/* Done / started / untouched, exactly as the rail showed it. */}
                  {section.kind === 'visibility' ? null : section.complete ? (
                    <Icon
                      name="circle-check"
                      label="Section complete"
                      className="text-xs text-emerald-500"
                    />
                  ) : section.answered > 0 ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-400"
                      role="img"
                      aria-label="Section started"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div>
        <main id="main-content">
          <div className="max-w-3xl">
            {/* Kept for narrow screens as a second way into a section, beside the scrolling strip. */}
            <div className="mb-6 md:hidden">
              <label
                htmlFor="mobile-section"
                className="mb-1.5 block text-sm font-semibold text-gray-700"
              >
                Section
              </label>
              <SelectInput
                id="mobile-section"
                name="mobile-section"
                options={sections.map((section) => ({
                  value: section.key,
                  label: SECTION_META[section.key]?.title ?? section.title,
                }))}
                value={activeSection.key}
                onChange={(event) => goToSection(event.target.value)}
              />
            </div>

            <section aria-labelledby="section-heading">
              <div className="mb-8">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  {/*
                    The section title IS the page title here — the shell has no separate page
                    heading, so making this an h2 left the document with no h1 at all.
                  */}
                  <h1
                    id="section-heading"
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-2xl font-bold tracking-tight text-brand-dark focus:outline-none md:text-3xl"
                  >
                    {meta.title ?? activeSection.title}
                  </h1>
                  {activeSection.optional && (
                    <Badge tone="neutral" size="sm" radius="full">
                      Optional
                    </Badge>
                  )}
                  {/*
                    Optional and high-value are not a contradiction, and the pair is the honest
                    reading: nothing here blocks publication, but it is what a recruiter actually
                    stops to read. Saying only "Optional" invites skipping the best section.
                  */}
                  {RECRUITER_PRIORITY.has(activeSection.key) && (
                    <span className="inline-flex items-center gap-1 rounded border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700">
                      <Icon name="bolt" className="text-[9px] text-purple-500" />
                      Recruiter priority
                    </span>
                  )}
                </div>
                {activeSection.description && (
                  <p className="text-base text-gray-500">{activeSection.description}</p>
                )}
              </div>

              {/*
                Four shapes of section, because the data has four shapes. Question sections are a
                form whose LAYOUT is per-section (see sections/): the bank owns which questions
                exist, each layout owns where they sit. Evidence sections (ADR-008) are lists of
                records — experience and education share one screen, while media and credentials
                each get their own, since a video reads as a thumbnail and a credential as a trust
                row. Visibility is a view onto the CAN-04 settings.
              */}
              {activeSection.kind === 'visibility' ? (
                <VisibilitySection publishBlockers={builder.publishBlockers} onChanged={reload} />
              ) : activeSection.kind === 'entries-group' ? (
                <div className="space-y-10">
                  {activeSection.parts.map((part) => (
                    <EntrySection
                      key={part.key}
                      title={ENTRY_GROUP_TITLES[part.key] ?? part.title}
                      entryKind={part.entryKind}
                      entries={part.entries}
                      onChanged={reload}
                    />
                  ))}
                </div>
              ) : activeSection.kind === 'entries' ? (
                activeSection.entryKind === 'media' ? (
                  <PortfolioSection entries={activeSection.entries} onChanged={reload} />
                ) : (
                  <CredentialsSection entries={activeSection.entries} onChanged={reload} />
                )
              ) : (
                <form
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                >
                  {renderQuestionSection(activeSection, layout, user)}

                  {saveMessage && (
                    <StatusRegion
                      tone={saveState === 'error' ? 'error' : 'success'}
                      className="mt-6"
                    >
                      {saveMessage}
                    </StatusRegion>
                  )}

                  <div className="mt-6 flex justify-end">
                    <Button
                      type="submit"
                      variant="outlineDark"
                      size="md"
                      radius="lg"
                      className="!border-gray-300 !bg-white !text-brand-dark hover:!bg-gray-50"
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving…' : 'Save section'}
                    </Button>
                  </div>
                </form>
              )}

              {footerNav}
            </section>
          </div>
        </main>
      </div>

      {/*
        Save-and-exit confirmation. A long form should not lose work to a mis-click, and the
        reference confirms here for the same reason — "Continue editing" is the important button.
      */}
      <Modal
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        title="Save progress and exit?"
        description="Your answers are kept as a draft. Nothing is visible to a company until you publish."
      >
        <div className="flex flex-col gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            className="!bg-brand-dark hover:!bg-black"
            disabled={isSaving}
            onClick={() => save({ thenExit: true })}
          >
            {isSaving ? 'Saving…' : 'Save & Exit'}
          </Button>
          <Button
            type="button"
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirmExit(false)}
          >
            Continue editing
          </Button>
        </div>
      </Modal>

      {/* Transient confirmation, announced politely so a screen reader does not miss it. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-gray-700 bg-gray-900 px-5 py-2.5 text-xs font-medium text-white shadow-xl"
        >
          <span className="flex items-center gap-2.5">
            <Icon name="circle-check" className="text-emerald-400" />
            {toast}
          </span>
        </div>
      )}
    </Container>
  );
}
