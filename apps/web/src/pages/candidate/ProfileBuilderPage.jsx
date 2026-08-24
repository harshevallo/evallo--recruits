import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Icon, Logo, Modal } from '@/components/ui';
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

/**
 * Ties the section form to its submit button, which lives outside the form in the footer bar.
 * One id is enough: only ever one question section is mounted at a time.
 */
const SECTION_FORM_ID = 'builder-section-form';

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
function renderQuestionSection(section, layout) {
  switch (section.key) {
    case 'professional_identity':
      return <IdentitySection layout={layout} />;
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
 * How much of the profile is built, plus what still blocks publication.
 *
 * Two different questions, reported separately on purpose. `percent` answers "how far through the
 * builder am I" and moves as sections are completed. `outstanding` stays tied to the SAME
 * `publishBlockers` the publish gate enforces, so the nudge beneath the bar can never invite
 * someone to publish something the API would refuse (PRD §8.5, I-04a).
 */
function readinessOf(builder) {
  /*
   * Completion across every content section, not just the ones publication requires.
   *
   * It used to measure publish readiness — required sections only. Sections 4 to 8 are all
   * `optional: true`, so answering the first three filled the bar to 100% while five sections sat
   * untouched. A meter that reads "done" over an unfinished profile is worse than no meter: it
   * removes the reason to continue.
   *
   * Publish & Visibility is excluded because it is not a section to fill in — it is the act of
   * publishing what the other seven contain, and the server reports it as never `complete`. Leaving
   * it in would cap an otherwise finished profile at 87%.
   *
   * Counting SECTIONS rather than questions is deliberate: the entry sections report
   * `answered === total` even when empty (both are the entry count), so a question-weighted
   * average would score an untouched Experience section as fully answered.
   */
  const content = builder.sections.filter((section) => section.kind !== 'visibility');
  const completed = content.filter((section) => section.complete).length;

  const outstanding = builder.publishBlockers.length;
  const unanswered = builder.sections.reduce(
    (total, section) => total + Math.max(0, section.total - section.answered),
    0,
  );

  return {
    percent: content.length === 0 ? 0 : Math.round((completed / content.length) * 100),
    completed,
    sectionCount: content.length,
    outstanding,
    unanswered,
  };
}

export function ProfileBuilderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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
  /* The shell owns the viewport, so section changes scroll THIS pane — `window` no longer moves. */
  const mainRef = useRef(null);

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
   * The navigation half, on its own.
   *
   * Split out from `goToSection` because a caller that has JUST saved must not save again. React
   * has not re-rendered by then, so `draft` still reads as dirty in this closure — routing the
   * primary action through `goToSection` fired a second, identical PATCH for the same section.
   */
  function moveToSection(key) {
    if (key === activeSection?.key) return;

    setSearchParams({ section: key });
    setDraft({});
    setErrors({});
    setSaveState('idle');
    setSaveMessage(null);
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // Move focus to the new section so keyboard and screen-reader users follow the change.
    requestAnimationFrame(() => headingRef.current?.focus());
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

    moveToSection(key);
  }

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6 md:p-10">
          <StatusRegion tone="error">{loadError}</StatusRegion>
          <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
            Back to candidate home
          </Button>
        </div>
      </div>
    );
  }

  if (!builder || !activeSection) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6 md:p-10" role="status" aria-live="polite">
          <span className="sr-only">Loading the profile builder…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </div>
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

  /**
   * The section's ONE primary action: validate, save, then advance — in that order, and only in
   * that order. A failed save (validation `details` from the API, or a network error) returns
   * false and leaves us here, with `saveMessage` and the per-question errors already on screen,
   * because being carried to the next section is exactly how a candidate loses track of what went
   * wrong. `save()` is also the sole writer: it guards on `inFlight`, so a second click while the
   * request is open is a no-op rather than a duplicate PATCH.
   */
  async function saveAndAdvance() {
    if (!(await save())) return;
    if (nextSection) moveToSection(nextSection.key);
  }

  /* Only question sections hold an unsaved draft; entries and visibility write as you edit. */
  const savesDraft = activeSection.kind === 'questions';

  /**
   * Bottom-of-pane navigation: Back on the left, ONE forward action on the right, on every
   * section.
   *
   * It used to be three different buttons wearing three different labels, and the differences
   * tracked an implementation detail rather than anything the candidate could see:
   *
   *   question sections   "Save and Next"                  (has a draft to flush)
   *   entry sections      "Next: Portfolio & Media"        (saves as you edit, so no "Save")
   *   the last section    — nothing at all —               (no next section to point at)
   *
   * Three problems, in the order a candidate hits them. The label changed as you walked through
   * the builder, so the button you had learned moved and renamed itself. Its text was a different
   * SIZE from Back beside it (`text-base` against `text-sm`), which read as two unrelated
   * controls. And the final section — Publish & Visibility — ended the flow with an empty right
   * side, so the one screen where you most want a way out had none.
   *
   * Now: same place, same typography as Back, same arrow, one label per situation —
   * "Save and Next" while there is somewhere to go, "Save & exit" on the last section.
   *
   * "Save and Next" is honest on every section, not just the ones with a form. Question sections
   * submit and save; every other path goes through `goToSection`, which flushes a pending draft
   * before it moves. There is no section where pressing it leaves work unsaved.
   */
  const isLastSection = !nextSection;

  /* One typography contract for both buttons, so they read as a pair rather than two widgets. */
  const FOOTER_BUTTON = 'rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors';

  /**
   * The forward button is the SAME SHAPE on every section and in every state.
   *
   * Two things used to move it. Its label carried the destination — "Next: Portfolio & Media" — so
   * the button grew and shrank with the name of whatever came next. And mid-save it swapped to
   * "Saving…" and dropped its arrow, so the control a candidate had just pressed visibly resized
   * under the cursor, on every section, every time.
   *
   * `min-w` fixes the width to the widest label this button can hold, and the icon slot is never
   * empty — the arrow is replaced by a spinner rather than removed. So the geometry is identical
   * across all eight sections and across idle / saving / disabled, which is the point: the button
   * you learn on Identity is the same object on Credentials.
   *
   * `justify-center` matters once the width is fixed: without it the shorter saving label would
   * sit left inside a wider box.
   */
  const FORWARD_BUTTON =
    `${FOOTER_BUTTON} inline-flex min-w-[11.5rem] items-center justify-center gap-2 ` +
    'bg-brand-dark px-6 text-white shadow-lg hover:bg-black ' +
    'disabled:cursor-not-allowed disabled:opacity-60';

  /*
   * The last section is the terminal step, and "Skip" is not what it does.
   *
   * Publish & Visibility has no section after it and holds no draft — it is a view onto the CAN-04
   * settings, which write as you change them. So there is nothing to save on the way out and
   * nowhere to skip to. The action that already exists in the product for leaving the builder is
   * Save & exit (the top bar's, with its confirmation), and the footer hands over to exactly that
   * rather than inventing a second way out.
   */
  const forwardLabel = isLastSection ? 'Save & exit' : 'Save and Next';
  const forwardIcon = isLastSection ? 'circle-check' : 'arrow-right';

  const footerNav = (
    <div className="mt-8 flex items-center justify-between gap-3">
      {previousSection ? (
        <button
          type="button"
          onClick={() => goToSection(previousSection.key)}
          className={`${FOOTER_BUTTON} text-gray-600 hover:bg-gray-200/60`}
        >
          Back
        </button>
      ) : (
        <span />
      )}

      {/*
        `type="submit"` with `form=` only where a form exists. That keeps the button and the Enter
        key on ONE path with one save between them, and it is what lets the control sit out here
        in the footer while belonging to the form above.

        Everywhere else it is a plain button, because there is no form to submit — the handler
        below still routes through the same save-then-move logic.
      */}
      <button
        type={savesDraft && !isLastSection ? 'submit' : 'button'}
        form={savesDraft && !isLastSection ? SECTION_FORM_ID : undefined}
        disabled={isSaving}
        onClick={
          savesDraft && !isLastSection
            ? undefined
            : () => {
                /*
                 * The last section hands over to the SAME confirmation the top bar uses, rather
                 * than exiting outright. One exit, one confirmation, whichever control you reach
                 * for — and a long form should not lose work to a mis-click.
                 */
                if (isLastSection) setConfirmExit(true);
                else goToSection(nextSection.key);
              }
        }
        className={FORWARD_BUTTON}
      >
        {isSaving ? 'Saving…' : forwardLabel}
        {isSaving ? (
          /* Occupies the arrow's slot, so nothing reflows while the request is open. */
          <span
            aria-hidden="true"
            className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        ) : (
          <Icon name={forwardIcon} className="text-xs" />
        )}
      </button>
    </div>
  );

  return (
    <>
      {/*
        The application bar. `flex-none` keeps it out of the scrolling region, so it holds its 4rem
        without `position: fixed` and without the content needing a matching top offset.

        It carries what a long form must never hide: where you are, whether your work is safe, and
        the two ways out. The old page heading ("Profile builder") is gone — the bar already says
        what this screen is, and the section title below is the real heading.
      */}
      <header className="h-16 flex-none border-b border-gray-200 bg-white">
        <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {/*
              The way out, on the left, at every width.
              This shell replaces the app navbar and the candidate rail, so it is the ONLY chrome on
              the screen — and its other exits ("Exit to profile" below, Preview, Save & exit) are
              either desktop-only or ask a question first. Without this a phone had no way back at
              all except the browser's own button.
            */}
            <Link
              to={PATHS.CANDIDATE_HOME}
              aria-label="Back to your candidate profile"
              className="-ml-1 flex flex-none items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-dark lg:hidden"
            >
              <Icon name="chevron-left" />
            </Link>

            {/*
              The wordmark yields first. This row has to hold a back control, the product identity
              and two actions inside 375px, and of those the identity is the one already answered by
              the section heading directly below — whereas dropping an action would remove a way out.
            */}
            <span className="hidden sm:block">
              <Logo tone="dark" />
            </span>
            <span className="hidden h-6 w-px flex-none bg-gray-200 sm:block" />
            <span className="hidden items-center gap-2 truncate text-sm font-semibold text-brand-dark sm:flex">
              <Icon name="user-pen" className="text-brand-blue" />
              Candidate profile builder
            </span>
          </div>

          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <span className="mr-1 hidden items-center gap-1.5 text-xs font-medium text-gray-500 md:flex">
              <span className="h-2 w-2 flex-none rounded-full bg-emerald-500" aria-hidden="true" />
              <span role="status">{isSaving ? 'Saving…' : 'Saved to cloud'}</span>
            </span>
            <Button
              to={PATHS.CANDIDATE_HOME}
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!hidden !border-gray-300 !bg-white !text-brand-dark hover:!bg-gray-50 lg:!inline-flex"
            >
              Exit to profile
            </Button>
            <Button
              to={PATHS.CANDIDATE_PROFILE_PREVIEW}
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !bg-white !text-brand-dark hover:!bg-gray-50"
            >
              Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              radius="lg"
              className="!bg-brand-dark hover:!bg-black"
              onClick={() => setConfirmExit(true)}
              disabled={isSaving}
            >
              Save &amp; exit
            </Button>
          </div>
        </div>
      </header>

      {/*
        `min-h-0` is what makes the two panes scroll instead of stretching. A flex child defaults to
        `min-height: auto`, refuses to shrink below its content, and pushes the overflow out to the
        document — which is exactly how a "fixed" sidebar ends up drifting up the page.
      */}
      <div className="flex min-h-0 flex-1">
        {/*
          Section rail. Stationary because it is a sibling of the scrolling pane rather than part of
          it, and independently scrollable so eight sections plus the strength meter stay reachable
          on a short screen without moving the content.
        */}
        <aside className="hidden w-72 flex-none overflow-y-auto border-r border-gray-200 bg-white md:block">
          <div className="p-5">
            {/* Profile strength — the same honest number, back beside the sections it describes. */}
            <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Profile strength
                </h2>
                <span className="text-xs font-bold text-brand-blue">
                  {readiness.completed} of {readiness.sectionCount} · {readiness.percent}%
                </span>
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
                    {readiness.unanswered === 1 ? 'answer' : 'answers'} left if you want a fuller
                    profile.
                  </>
                ) : (
                  <>Everything is answered. You can publish whenever you are ready.</>
                )}
              </p>
            </div>

            <nav aria-label="Profile sections">
              <ol className="space-y-1">
                {sections.map((section) => {
                  const isActive = section.key === activeSection.key;
                  const label = SECTION_META[section.key]?.nav ?? section.title;

                  return (
                    <li key={section.key}>
                      <button
                        type="button"
                        onClick={() => goToSection(section.key)}
                        aria-current={isActive ? 'step' : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 ${
                          isActive
                            ? 'bg-blue-50 font-semibold text-brand-blue'
                            : 'font-medium text-gray-600 hover:bg-gray-50 hover:text-brand-dark'
                        }`}
                      >
                        <Icon
                          name={SECTION_META[section.key]?.icon ?? 'circle-check'}
                          className={`w-4 flex-none text-xs ${
                            isActive ? 'text-brand-blue' : 'text-gray-400'
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>

                        {/* Done / started / untouched, exactly as the strip showed it. */}
                        {section.kind === 'visibility' ? null : section.complete ? (
                          <Icon
                            name="circle-check"
                            label="Section complete"
                            className="flex-none text-xs text-emerald-500"
                          />
                        ) : section.answered > 0 ? (
                          <span
                            className="h-1.5 w-1.5 flex-none rounded-full bg-amber-400"
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
          </div>
        </aside>

        {/* The one scrolling region on the screen. */}
        <main id="main-content" ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6 pb-32 md:p-10">
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
                /*
                  The submit button for this form is "Save and Next", down in `footerNav` — the
                  section used to carry both a "Save section" button here AND a "Next" button
                  below, which made saving and moving on look like two decisions when it is one.
                */
                <form
                  id={SECTION_FORM_ID}
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveAndAdvance();
                  }}
                >
                  {renderQuestionSection(activeSection, layout)}

                  {saveMessage && (
                    <StatusRegion
                      tone={saveState === 'error' ? 'error' : 'success'}
                      className="mt-6"
                    >
                      {saveMessage}
                    </StatusRegion>
                  )}
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
    </>
  );
}
