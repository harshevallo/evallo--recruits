import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ORGANIZATION_TYPE_OPTIONS,
  EDUCATION_SERVICE_OPTIONS,
  DELIVERY_MODE_OPTIONS,
  LEARNER_SEGMENT_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  COUNTRY_OPTIONS,
} from '@evallo/shared';
import { Avatar, Button, Container, Icon } from '@/components/ui';
import {
  FormField,
  TextInput,
  Textarea,
  SelectInput,
  ComboboxInput,
  CheckCardGroup,
  TagInput,
} from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchCompanyEditor, saveCompanyStep } from '@/services';
import { missingRequiredFields } from '@/features/companies/requiredFields';
import { PATHS, buildPath } from '@/router/paths';

/**
 * The three multi-selects, and how each is drawn.
 *
 * Layout follows vocabulary size, not decoration. Twelve education services need a compact
 * two-column list; three delivery modes read better as a row of pills; eight learner segments are
 * worth tile-sized targets because they are the field that matches a company to an educator.
 */
const CHOICE_FIELDS = {
  educationServices: {
    legend: 'Education services',
    hint: 'What your organisation actually delivers. At least one is required to publish.',
    options: EDUCATION_SERVICE_OPTIONS,
    layout: 'grid',
  },
  deliveryModes: {
    legend: 'Delivery model',
    hint: 'How teaching happens. Pick every mode you offer.',
    options: DELIVERY_MODE_OPTIONS,
    layout: 'pill',
  },
  learnerSegments: {
    legend: 'Primary learner segments',
    hint: 'Who you teach. Educators describe themselves with this same vocabulary, so it is what matches them to you.',
    options: LEARNER_SEGMENT_OPTIONS,
    layout: 'tile',
  },
};

/** How many metric tiles the public profile draws. Mirrors `COMPANY_CONTENT_LIMITS.metrics`. */
const MAX_METRICS = 4;

/**
 * The logo preview's fallback, matching what the server generates.
 *
 * `companyInitials` on the API takes the first letter of the first two WORDS — "Seven Square
 * Learning" is "SS", not "SE". Slicing two characters off the name would show the preview one
 * thing and every other surface another.
 */
function companyInitials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * The rest of company setup, as the reference draws it — steps 5 to 7.
 *
 * These are NOT wizard steps and are deliberately not rebuilt as any. Hiring intent (REC-05),
 * inviting the team (REC-07) and publishing (REC-06) are existing screens with their own routes,
 * permissions and tests; duplicating them inside this form to match a picture would be three more
 * copies to keep in sync, which is the exact failure this codebase has already paid for once.
 *
 * So the rail shows the whole journey — a company owner should be able to see that hiring and
 * publishing come next — and each one is a link to the screen that already owns it.
 */
const ONWARD_STEPS = [
  {
    key: 'hiring',
    title: 'Hiring intent',
    description: 'Declare your open roles',
    path: PATHS.COMPANY_HIRING,
  },
  {
    key: 'team',
    title: 'Invite team',
    description: 'Add recruiters and managers',
    path: PATHS.COMPANY_TEAM,
  },
  {
    key: 'publish',
    title: 'Publish',
    description: 'Review and launch',
    path: PATHS.COMPANY_PREVIEW,
  },
];

/**
 * The reference's "Draft Saved" chip, reporting the REAL save state rather than a decoration.
 *
 * The reference shows it statically. Showing a permanent "Draft Saved" would be a claim the page
 * cannot support — it is exactly wrong in the one moment that matters, when a save has just
 * failed — so it reads from `saveState` and says "Not saved" when that is the truth.
 */
function SaveIndicator({ saveState }) {
  const STATES = {
    idle: { icon: 'pen', text: 'Draft', tone: 'text-gray-500' },
    saving: { icon: 'bolt', text: 'Saving…', tone: 'text-gray-500' },
    saved: { icon: 'circle-check', text: 'Draft saved', tone: 'text-green-600' },
    error: { icon: 'file-shield', text: 'Not saved', tone: 'text-red-600' },
  };
  const { icon, text, tone } = STATES[saveState] ?? STATES.idle;

  return (
    <span
      className={`hidden items-center gap-1.5 text-xs font-medium sm:flex ${tone}`}
      role="status"
      aria-live="polite"
    >
      <Icon name={icon} className="text-[10px]" />
      {text}
    </span>
  );
}

/**
 * The trust-metric tiles — a repeater, because both halves are free text and a company needs
 * between zero and four of them.
 *
 * A row with only one half filled is dropped by the server (`saveCompanyStep`), so the empty row
 * this starts with costs nothing if it is never used.
 */
function MetricsEditor({ metrics, disabled, onChange }) {
  const rows = metrics.length > 0 ? metrics : [{ value: '', label: '' }];

  const update = (index, key, next) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: next } : row)));

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        /* Keyed by position: a metric row has no id, and its only mutation is removal. */
        <div key={index} className="flex items-start gap-2">
          <TextInput
            id={`metric-value-${index}`}
            aria-label={`Metric ${index + 1} figure`}
            placeholder="180 pts"
            maxLength={24}
            className="sm:w-40"
            value={row.value ?? ''}
            disabled={disabled}
            onChange={(e) => update(index, 'value', e.target.value)}
          />
          <TextInput
            id={`metric-label-${index}`}
            aria-label={`Metric ${index + 1} label`}
            placeholder="Median SAT gain"
            maxLength={60}
            value={row.label ?? ''}
            disabled={disabled}
            onChange={(e) => update(index, 'label', e.target.value)}
          />
          <button
            type="button"
            aria-label={`Remove metric ${index + 1}`}
            disabled={disabled || rows.length === 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="mt-1 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="trash" className="text-sm" />
          </button>
        </div>
      ))}

      {rows.length < MAX_METRICS && (
        <Button
          type="button"
          variant="link"
          size="none"
          radius="none"
          className="text-sm font-semibold"
          disabled={disabled}
          onClick={() => onChange([...rows, { value: '', label: '' }])}
        >
          <Icon name="plus" className="text-xs" /> Add metric
        </Button>
      )}
    </div>
  );
}

/**
 * REC-02 — company setup wizard (PRD §7.2, §7.3).
 *
 * Draft-first: PRD §7.2 wants a credible page published quickly with "optional enrichment
 * available afterward", so a partial step is a valid save and the §7.3 requirements are enforced
 * only at publish time (REC-06). The step definitions and the publish checklist both come from
 * the server, so the wizard has one source of truth rather than a client-side copy.
 *
 * ── Layout ────────────────────────────────────────────────────────────────────────────────────
 *
 * The approved reference is a two-column wizard: a numbered step rail on the left, and on the
 * right a page-level heading with the fields in a single white card beneath it. That is what this
 * renders — inside the company workspace rail, which stays exactly as it was. The reference's own
 * top bar (logo, "Save & Exit", the draft chip) maps onto the workspace navbar plus this page's
 * header row, rather than becoming a second bar underneath the first.
 */
export function CompanySetupPage() {
  const { companySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState({ status: 'loading' });
  const [draft, setDraft] = useState({});
  const [saveState, setSaveState] = useState('idle');
  const [message, setMessage] = useState(null);
  /** Field-keyed, exactly like every other form in the app: `{ tagline: 'Tagline is required.' }`. */
  const [errors, setErrors] = useState({});
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

    /*
     * Clear this field's error as soon as it is edited.
     *
     * Leaving it until the next submit means a field the user has just fixed keeps its red border
     * and its message while they type — the form accusing them of a problem they have already
     * solved. `country` is written through the `location` object, so it clears under its own name.
     */
    setErrors((current) => {
      const key = field === 'location' ? 'country' : field;
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  function valueFor(field) {
    if (field in draft) return draft[field];
    return state.company?.[field];
  }

  /** Toggling one value inside a multi-select, without the caller restating the spread. */
  function toggleChoice(field, value, checked) {
    const current = valueFor(field) ?? [];
    setField(field, checked ? [...current, value] : current.filter((v) => v !== value));
  }

  /**
   * Saves the active step.
   *
   * ── The required-field gate ───────────────────────────────────────────────────────────────
   *
   * Every control marked with a `*` is checked BEFORE the request goes out. The asterisks come
   * from `required` on `FormField`, which draws the marker and sets `aria-required`, while
   * `<form noValidate>` disables the browser's native enforcement — so without this check a
   * required field could be blank and Save would still report "Saved.", truthfully, because the
   * server accepts a partial step by design.
   *
   * ── `enforceRequired`, and why navigation opts out ────────────────────────────────────────
   *
   * `goToStep` also calls this, to persist pending edits before moving away. That path passes
   * `false`. Blocking it would leave someone who typed a tagline but no description unable to
   * save AND unable to leave without losing the tagline — a trap, and a silent data loss nobody
   * asked for. Clicking Save is an assertion that the step is done; clicking another step in the
   * rail is not.
   *
   * PRD §7.2 draft-first is unchanged on the server: `saveCompanyStep` still accepts a partial
   * step, so nothing about publish validation or the API contract moved.
   */
  async function save({ enforceRequired = true } = {}) {
    if (!activeStep || inFlight.current) return false;

    if (enforceRequired) {
      const { errors: missing, labels } = missingRequiredFields({
        checklistItems: state.checklist?.items,
        stepKey: activeStep.key,
        valueFor,
      });
      const fields = Object.keys(missing);

      if (fields.length > 0) {
        setErrors(missing);
        setSaveState('error');
        /* Mirrors the preview screen's phrasing, built from the same server labels. */
        setMessage(`Still needed before you can save this step: ${labels.join(', ')}.`);

        /*
         * Move focus to the first offender. Without this a keyboard or screen-reader user is told
         * something is wrong and left at the bottom of the form to hunt for it. `FormField` owns
         * the id scheme, so this is the id it generated.
         */
        requestAnimationFrame(() => {
          document.getElementById(`field-${fields[0]}`)?.focus();
        });

        /* No request is sent, and the caller sees a failure — so it does not navigate onward. */
        return false;
      }
    }

    inFlight.current = true;
    setSaveState('saving');
    setMessage(null);
    setErrors({});

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
    if (Object.keys(draft).length > 0 && !(await save({ enforceRequired: false }))) return;

    setSearchParams({ step: key });
    setDraft({});
    setSaveState('idle');
    setMessage(null);
    /* Errors belong to the step that produced them. */
    setErrors({});
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  /**
   * Leaving the wizard for another screen — "Save and exit", and the three onward rail links.
   *
   * Pending edits are persisted first, and a FAILED save cancels the navigation, so nothing typed
   * is lost by clicking away. `enforceRequired: false` for the same reason `goToStep` uses it:
   * leaving is not an assertion that the step is finished.
   */
  async function leaveTo(path) {
    if (Object.keys(draft).length > 0 && !(await save({ enforceRequired: false }))) return;
    navigate(buildPath(path, { companySlug }));
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-28">
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
      <Container className="py-28">
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
  const prevStep = steps[index - 1] ?? null;
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
    <Container className="py-28">
      {/*
        The reference's top bar, minus the parts the workspace navbar already provides. What is
        left is the context (which company, and whether it is live), the real save state, and the
        two ways out — exit, and preview.
      */}
      <header className="mb-8 flex flex-col gap-4 border-b border-gray-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {isPublished ? 'Company page' : 'Company setup'}
          </p>
          <p className="mt-1 truncate text-lg font-bold text-brand-dark">{company.name}</p>
          <p className="mt-0.5 text-sm text-gray-600">
            {isPublished
              ? 'Edits save immediately and update your public page.'
              : 'Everything saves as a draft. Nothing is public until you publish.'}
          </p>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
          <SaveIndicator saveState={saveState} />
          <Button
            type="button"
            variant="outlineDark"
            size="none"
            radius="lg"
            className="px-4 py-2 text-sm font-semibold !border-gray-300 !text-brand-dark hover:!bg-gray-50"
            disabled={isSaving}
            onClick={() => leaveTo(PATHS.COMPANY_HOME)}
          >
            Save and exit
          </Button>
          <Button
            to={buildPath(PATHS.COMPANY_PREVIEW, { companySlug })}
            variant="dark"
            size="none"
            radius="lg"
            className="px-4 py-2 text-sm font-semibold"
          >
            {isPublished ? 'Preview' : 'Preview and publish'}
          </Button>
        </div>
      </header>

      {checklist.blockers.length > 0 && (
        <StatusRegion tone="info" className="mb-8">
          {checklist.blockers.length} item{checklist.blockers.length === 1 ? '' : 's'} still needed
          before you can publish: {checklist.blockers.join(', ')}.
        </StatusRegion>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Setup steps">
          <h2 className="mb-6 text-xs font-bold uppercase tracking-wider text-gray-400">
            Company setup
          </h2>

          {/*
            A vertical rail behind the step numbers, drawn with `before:` on the list rather than a
            spacer element: `left-3.5` puts it through the centre of the 7×7 indicators, and `-z-10`
            keeps it behind them so each number sits ON the line instead of beside it.
          */}
          <ol className="relative space-y-6 before:absolute before:inset-y-0 before:left-3.5 before:-z-10 before:w-px before:bg-gray-200">
            {steps.map((step, i) => {
              const isActive = step.key === activeStep.key;

              /*
                Three indicator states, straight from the reference:
                  complete → solid blue, ringed in white so it reads as "banked"
                  active   → solid blue, ringed in blue-50 so the current step is distinguishable
                  upcoming → grey with a border
                The `ring-4` is what masks the rail behind each number.
              */
              const indicator = step.complete
                ? 'bg-brand-blue text-white ring-white'
                : isActive
                  ? 'bg-brand-blue text-white ring-blue-50'
                  : 'border border-gray-200 bg-gray-100 text-gray-400 ring-white';

              return (
                <li key={step.key}>
                  <button
                    type="button"
                    onClick={() => goToStep(step.key)}
                    aria-current={isActive ? 'step' : undefined}
                    className="group flex w-full items-start gap-4 rounded-lg text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
                  >
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-4 transition-colors ${indicator}`}
                      aria-hidden="true"
                    >
                      {step.complete && !isActive ? <Icon name="circle-check" /> : i + 1}
                    </span>

                    <span className="min-w-0 flex-1 pt-1">
                      <span
                        className={`block truncate text-sm font-bold transition-colors group-hover:text-brand-blue ${
                          isActive ? 'text-brand-blue' : 'text-brand-dark'
                        }`}
                      >
                        {step.title}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {step.requiredTotal > 0
                          ? `${step.requiredDone} of ${step.requiredTotal} required`
                          : 'Optional'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            {/* Steps 5–7: the rest of the journey, each owned by an existing screen. */}
            {ONWARD_STEPS.map((step, i) => (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => leaveTo(step.path)}
                  className="group flex w-full items-start gap-4 rounded-lg text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
                >
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-bold text-gray-400 ring-4 ring-white transition-colors group-hover:border-brand-blue/50"
                    aria-hidden="true"
                  >
                    {steps.length + i + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-500 transition-colors group-hover:text-brand-blue">
                      {step.title}
                      <Icon name="arrow-right" className="text-[10px]" />
                    </span>
                    <span className="block text-xs text-gray-400">{step.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          {/*
            The reference puts the step title OUTSIDE the card, as the page heading, with the
            fields alone inside it. That is what makes the card read as a form rather than as a
            panel with a title bar.
          */}
          <div className="mb-8">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mb-2 text-2xl font-bold tracking-tight text-brand-dark focus:outline-none md:text-3xl"
            >
              {activeStep.title}
            </h1>
            <p className="text-base text-gray-500">{activeStep.description}</p>
            <p className="mt-1 text-xs text-gray-400">
              Step {index + 1} of {steps.length + ONWARD_STEPS.length}
            </p>
          </div>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              {activeStep.key === 'basics' && (
                <>
                  <FormField label="Company name" name="name" required error={errors.name}>
                    {(f) => (
                      <TextInput
                        {...f}
                        placeholder="e.g. Seven Square Learning"
                        value={valueFor('name') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('name', e.target.value)}
                      />
                    )}
                  </FormField>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                      label="Organization type"
                      name="organizationType"
                      required
                      error={errors.organizationType}
                    >
                      {(f) => (
                        <SelectInput
                          {...f}
                          options={[
                            { value: '', label: 'Select type…' },
                            ...ORGANIZATION_TYPE_OPTIONS,
                          ]}
                          value={valueFor('organizationType') ?? ''}
                          disabled={isSaving}
                          onChange={(e) => setField('organizationType', e.target.value)}
                        />
                      )}
                    </FormField>

                    <FormField label="Website" name="website" hint="Optional.">
                      {(f) => (
                        <TextInput
                          {...f}
                          type="url"
                          placeholder="https://www.example.com"
                          value={valueFor('website') ?? ''}
                          disabled={isSaving}
                          onChange={(e) => setField('website', e.target.value)}
                        />
                      )}
                    </FormField>
                  </div>

                  <FormField
                    label="Primary country"
                    name="country"
                    required
                    error={errors.country}
                  >
                    {(f) => (
                      /*
                        Searchable, not a native select. The country vocabulary is all 249 ISO
                        territories, and a 249-row dropdown is a scroll, not a choice — the same
                        control the candidate builder and account settings already use.
                      */
                      <ComboboxInput
                        {...f}
                        options={COUNTRY_OPTIONS}
                        listboxLabel="Primary country"
                        searchPlaceholder="Search countries…"
                        emptyMessage="No countries match that search."
                        value={valueFor('location')?.country ?? ''}
                        disabled={isSaving}
                        onChange={(next) =>
                          setField('location', { ...valueFor('location'), country: next })
                        }
                      />
                    )}
                  </FormField>

                  <FormField label="City or region" name="city" hint="Optional.">
                    {(f) => (
                      <TextInput
                        {...f}
                        placeholder="City, state"
                        value={valueFor('location')?.city ?? ''}
                        disabled={isSaving}
                        onChange={(e) =>
                          setField('location', { ...valueFor('location'), city: e.target.value })
                        }
                      />
                    )}
                  </FormField>

                  {/*
                    The reference makes the slug an editable field. It is shown here and NOT
                    editable, because changing it would break every link already shared to the old
                    address — 301 redirect handling from `slugHistory` is B-11 and is not built.
                    An input that cannot safely save is worse than a fact you can copy.
                  */}
                  <div>
                    <p className="mb-1.5 block text-sm font-semibold text-gray-700">
                      Public address
                    </p>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <Icon name="link" className="shrink-0 text-xs text-gray-400" />
                      <code className="truncate text-sm font-medium text-brand-dark">
                        /companies/{company.slug}
                      </code>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Generated from your company name. Contact support to change it — existing
                      links to the old address would otherwise stop working.
                    </p>
                  </div>
                </>
              )}

              {activeStep.key === 'brand' && (
                <>
                  {/*
                    The reference's logo block, with a live preview instead of a file picker.

                    There is deliberately no "Browse files" button: company logo upload has no
                    backend. `mediaAssets` is keyed by `ownerUserId` and the write route is
                    `/api/me/photo` — a personal asset, not a company one — and object storage is
                    D-02, still undecided. A picker that opened a dialog and then dropped the file
                    would be worse than the URL field, so the shape is kept and the control is one
                    that actually works.
                  */}
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <Avatar
                      src={valueFor('logoUrl') || undefined}
                      initials={companyInitials(valueFor('name') ?? company.name)}
                      size="xl"
                      shape="card"
                      tone="brand"
                      className="border border-gray-200"
                    />
                    <div className="min-w-0 flex-1">
                      <FormField
                        label="Company logo"
                        name="logoUrl"
                        hint="Paste a square image URL. Without one, your initials are used."
                      >
                        {(f) => (
                          <TextInput
                            {...f}
                            type="url"
                            placeholder="https://example.com/logo.png"
                            value={valueFor('logoUrl') ?? ''}
                            disabled={isSaving}
                            onChange={(e) => setField('logoUrl', e.target.value)}
                          />
                        )}
                      </FormField>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  <FormField
                    label="Short tagline"
                    name="tagline"
                    required
                    error={errors.tagline}
                    hint="One line candidates see first — “Empowering students to reach the Ivy League.”"
                  >
                    {(f) => (
                      <TextInput
                        {...f}
                        maxLength={160}
                        placeholder="A one-sentence summary of your mission."
                        value={valueFor('tagline') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('tagline', e.target.value)}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Short description"
                    name="descriptionShort"
                    required
                    error={errors.descriptionShort}
                    hint="Two or three lines. This is what the directory shows."
                  >
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

                  <FormField
                    label="Full company description"
                    name="descriptionFull"
                    hint="Optional. Your culture, teaching philosophy, and what makes working here good."
                  >
                    {(f) => (
                      <Textarea
                        {...f}
                        rows={6}
                        placeholder="We are a premium tutoring agency based in…"
                        value={valueFor('descriptionFull') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('descriptionFull', e.target.value)}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Cover image URL"
                    name="coverImageUrl"
                    hint="Optional — the banner behind your logo. Wide images work best (about 3:1)."
                  >
                    {(f) => (
                      <TextInput
                        {...f}
                        type="url"
                        placeholder="https://example.com/cover.jpg"
                        value={valueFor('coverImageUrl') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('coverImageUrl', e.target.value)}
                      />
                    )}
                  </FormField>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField
                      label="Company size"
                      name="sizeRange"
                      hint="Shown as “51–200 employees”."
                    >
                      {(f) => (
                        <SelectInput
                          {...f}
                          options={[
                            { value: '', label: 'Prefer not to say' },
                            ...COMPANY_SIZE_OPTIONS,
                          ]}
                          value={valueFor('sizeRange') ?? ''}
                          disabled={isSaving}
                          onChange={(e) => setField('sizeRange', e.target.value)}
                        />
                      )}
                    </FormField>

                    <FormField label="Founding year" name="foundingYear" hint="Optional.">
                      {(f) => (
                        <TextInput
                          {...f}
                          type="number"
                          inputMode="numeric"
                          min={1000}
                          max={new Date().getFullYear()}
                          placeholder="e.g. 2015"
                          value={valueFor('foundingYear') ?? ''}
                          disabled={isSaving}
                          onChange={(e) =>
                            /* Empty clears the field; the model stores a Number, not "". */
                            setField(
                              'foundingYear',
                              e.target.value === '' ? null : Number(e.target.value),
                            )
                          }
                        />
                      )}
                    </FormField>
                  </div>

                  {/*
                    A fieldset, not a `FormField`. `FormField` renders one `<label htmlFor>` for one
                    control; this is a repeater of up to eight inputs, so that label would point at
                    an id nothing renders and name none of them. The rows carry their own
                    `aria-label`s, the legend names the group, and the caveat is wired in with
                    `aria-describedby` so "these are not verified" is announced, not only seen.
                  */}
                  <fieldset aria-describedby="metrics-hint">
                    <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
                      Trust metrics
                    </legend>
                    <p id="metrics-hint" className="mb-3 text-xs text-gray-500">
                      Up to {MAX_METRICS} figures you stand behind. These are shown as your own
                      claim — they are not verified — and a row needs both halves to appear.
                    </p>
                    <MetricsEditor
                      metrics={valueFor('metrics') ?? []}
                      disabled={isSaving}
                      onChange={(next) => setField('metrics', next)}
                    />
                  </fieldset>
                </>
              )}

              {activeStep.key === 'footprint' && (
                <>
                  {['deliveryModes', 'learnerSegments', 'educationServices'].map((field) => (
                    <CheckCardGroup
                      key={field}
                      /* Matches the id `save()` focuses when this field is the missing one. */
                      id={`field-${field}`}
                      required={field === 'educationServices'}
                      legend={CHOICE_FIELDS[field].legend}
                      hint={CHOICE_FIELDS[field].hint}
                      options={CHOICE_FIELDS[field].options}
                      layout={CHOICE_FIELDS[field].layout}
                      selected={valueFor(field) ?? []}
                      disabled={isSaving}
                      hasError={Boolean(errors[field])}
                      describedBy={errors[field] ? `${field}-error` : undefined}
                      onToggle={(value, checked) => toggleChoice(field, value, checked)}
                    />
                  ))}

                  {errors.educationServices && (
                    <p id="educationServices-error" className="text-sm text-red-600">
                      {errors.educationServices}
                    </p>
                  )}

                  <FormField
                    label="Programs, subjects and tests"
                    name="subjects"
                    hint="Type and press Enter. E.g. SAT, ACT, IB Physics, College Essays."
                  >
                    {(f) => (
                      <TagInput
                        {...f}
                        placeholder="Add a program…"
                        value={valueFor('subjects') ?? []}
                        disabled={isSaving}
                        onChange={(next) => setField('subjects', next)}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Service regions"
                    name="serviceRegions"
                    hint="Optional — where you deliver, if it is wider than your base."
                  >
                    {(f) => (
                      <TagInput
                        {...f}
                        placeholder="Add a region…"
                        value={valueFor('serviceRegions') ?? []}
                        disabled={isSaving}
                        onChange={(next) => setField('serviceRegions', next)}
                      />
                    )}
                  </FormField>
                </>
              )}

              {activeStep.key === 'culture' && (
                <>
                  {/*
                    Nothing on this step is on the publish checklist (PRD §7.3 requires none of it),
                    so none of these carry a `required` marker and Save never blocks here.
                  */}
                  <FormField
                    label="Teaching philosophy"
                    name="descriptionPhilosophy"
                    hint="How you teach, in your own words. Optional."
                  >
                    {(f) => (
                      <Textarea
                        {...f}
                        rows={4}
                        placeholder="We diagnose before we teach…"
                        value={valueFor('descriptionPhilosophy') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('descriptionPhilosophy', e.target.value)}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Why work here"
                    name="descriptionCulture"
                    hint="What working for you is actually like. Optional."
                  >
                    {(f) => (
                      <Textarea
                        {...f}
                        rows={4}
                        value={valueFor('descriptionCulture') ?? ''}
                        disabled={isSaving}
                        onChange={(e) => setField('descriptionCulture', e.target.value)}
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Pull quote"
                    name="pullQuoteText"
                    hint="One line, highlighted on your page. Clearing it removes the quote entirely."
                  >
                    {(f) => (
                      <Textarea
                        {...f}
                        rows={2}
                        maxLength={280}
                        placeholder="We build independent thinkers, not just test-takers."
                        value={valueFor('pullQuote')?.text ?? ''}
                        disabled={isSaving}
                        onChange={(e) =>
                          setField('pullQuote', { ...valueFor('pullQuote'), text: e.target.value })
                        }
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Quote attribution"
                    name="pullQuoteAttribution"
                    hint="Optional — a person or a team. Leave blank for an institutional voice."
                  >
                    {(f) => (
                      <TextInput
                        {...f}
                        maxLength={120}
                        placeholder="Founding instructor team"
                        value={valueFor('pullQuote')?.attribution ?? ''}
                        disabled={isSaving}
                        onChange={(e) =>
                          setField('pullQuote', {
                            ...valueFor('pullQuote'),
                            attribution: e.target.value,
                          })
                        }
                      />
                    )}
                  </FormField>

                  <FormField
                    label="Educator perks"
                    name="perks"
                    hint="Type and press Enter. E.g. Annual training budget, Flexible remote hours."
                  >
                    {(f) => (
                      <TagInput
                        {...f}
                        placeholder="Add a perk…"
                        maxTags={12}
                        value={valueFor('perks') ?? []}
                        disabled={isSaving}
                        onChange={(next) => setField('perks', next)}
                      />
                    )}
                  </FormField>
                </>
              )}
            </div>

            {message && (
              <StatusRegion tone={saveState === 'error' ? 'error' : 'success'} className="mt-6">
                {message}
              </StatusRegion>
            )}

            {/*
              The reference's footer bar: Back on the left, the forward action on the right.

              Both save. Back uses `goToStep`, which persists pending edits before moving, so
              going back never discards what is on screen; the forward action asserts the step is
              done and therefore enforces the required fields first.
            */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-6">
              {prevStep ? (
                <Button
                  type="button"
                  variant="link"
                  size="none"
                  radius="lg"
                  className="px-5 py-3 text-sm font-semibold !text-gray-600 hover:!bg-gray-100 hover:!text-brand-dark"
                  disabled={isSaving}
                  onClick={() => goToStep(prevStep.key)}
                >
                  <Icon name="arrow-right" className="rotate-180 text-xs" />
                  Back
                </Button>
              ) : (
                /* Keeps the forward action hard right on the first step. */
                <span aria-hidden="true" />
              )}

              <Button
                type="button"
                variant="dark"
                size="none"
                radius="lg"
                className="flex items-center gap-2 px-8 py-3 text-sm font-bold shadow-sm hover:bg-black"
                disabled={isSaving}
                onClick={async () => {
                  if (!(await save())) return;
                  if (nextStep) await goToStep(nextStep.key);
                  else navigate(buildPath(PATHS.COMPANY_HIRING, { companySlug }));
                }}
              >
                {isSaving ? 'Saving…' : 'Save and continue'}
                <Icon name="arrow-right" className="text-xs" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Container>
  );
}
