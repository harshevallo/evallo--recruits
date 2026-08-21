import {
  CANDIDATE_ROLE_LABELS,
  SUBJECT_LABELS,
  LEARNER_SEGMENT_LABELS,
  AVAILABILITY_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_LABELS,
  COUNTRY_LABELS,
  TIMEZONE_LABELS,
  LANGUAGE_LABELS,
  EVIDENCE_VERIFICATION,
} from '@evallo/shared';
import { Avatar, Badge, Icon } from '@/components/ui';

/**
 * The portfolio renderer — one presentation layer over the candidate data, for every audience.
 *
 * ```
 *   Profile builder  →  candidate data  →  loadPortfolio()  →  PortfolioDocument  →  reader
 * ```
 *
 * The same component tree draws the candidate's own preview (CAN-03), the recruiter's evaluation
 * screen (REC-13) and the share link (ADR-019). PRD §8.8 requires the preview to show "the exact
 * same rendering and privacy state" a recruiter gets, and the only way to guarantee that over
 * time is for there to be one renderer rather than three that agree today.
 *
 * It is a DOCUMENT, not a form. No inputs, no toggles, no save. Editing lives in the builder;
 * the surrounding page owns whatever actions its audience is allowed (publish, share, shortlist),
 * and passes them in as `actions`. That separation is what stops the portfolio drifting back into
 * being a second builder.
 *
 * Absent means absent. A section whose data the visibility rules withheld is not rendered at all,
 * because the server never sent it — this component reconstructs no privacy rule and infers
 * nothing from an empty array.
 */

/* Matches the product's card language: white, hairline border, restrained shadow. */
const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm';
const MICRO_LABEL = 'text-[11px] font-bold uppercase tracking-wider text-gray-500';

const labelled = (values, labels) => (values ?? []).map((value) => labels?.[value] ?? humanise(value));

export function humanise(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function initialsOf(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "Bengaluru, India · IST" — where they are and when you can reach them (PRD §8.8). */
function locationLine(location) {
  if (!location) return null;
  const place = [location.region, COUNTRY_LABELS[location.country] ?? location.country]
    .filter(Boolean)
    .join(', ');
  const zone = TIMEZONE_LABELS[location.timezone] ?? location.timezone;
  return [place || null, zone || null].filter(Boolean).join(' · ') || null;
}

/**
 * "Mar 2019 — Present".
 *
 * `current` is stored rather than inferred from a missing end date, so "I still work here" and "I
 * have not filled this in" render differently — the second shows the start date alone.
 */
function dateRange(entry) {
  const format = (value) => {
    if (!value) return null;
    const [year, month] = String(value).split('-');
    if (!year) return null;
    if (!month) return year;
    const date = new Date(Number(year), Number(month) - 1, 1);
    return Number.isNaN(date.getTime())
      ? year
      : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };

  const start = format(entry.startDate);
  const end = entry.current ? 'Present' : format(entry.endDate);

  if (start && end) return `${start} — ${end}`;
  return start ?? end ?? null;
}

/* ── Building blocks ──────────────────────────────────────────────────────────────────────── */

/**
 * One portfolio section.
 *
 * Renders nothing when it has nothing to say. A portfolio with twelve headings and four filled
 * sections reads as an unfinished form; the same profile with four sections reads as a focused
 * one. `alwaysShow` exists for the two sections whose emptiness is itself information — the
 * candidate's own preview needs to see the gap they are being asked to fill.
 */
export function PortfolioSection({ id, title, subtitle, icon, empty, alwaysShow, children }) {
  if (empty && !alwaysShow) return null;

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`${CARD} scroll-mt-28 p-6 sm:p-7`}>
      <div className="mb-5 flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-blue-50 text-brand-blue">
            <Icon name={icon} className="text-sm" />
          </span>
        )}
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-lg font-bold text-brand-dark">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
          <p className="text-sm text-gray-600">Nothing added yet.</p>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function ChipGroup({ title, values, labels }) {
  if (!values?.length) return null;

  return (
    <div>
      <h3 className={`mb-2.5 ${MICRO_LABEL}`}>{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {labelled(values, labels).map((label) => (
          <li
            key={label}
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-brand-dark"
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextGroup({ title, body }) {
  if (!body) return null;

  return (
    <div>
      <h3 className={`mb-2 ${MICRO_LABEL}`}>{title}</h3>
      <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-700">{body}</p>
    </div>
  );
}

/**
 * PRD §14.2 per-item verification.
 *
 * Only a POSITIVE state is drawn. Nothing writes anything but `unverified` yet (issuer
 * verification is Phase 2), and stamping every entry "Unverified" would read as a finding about
 * the candidate rather than a gap in our tooling.
 */
function VerificationMark({ status }) {
  if (status !== EVIDENCE_VERIFICATION.VERIFIED) return null;

  return (
    <Badge tone="successLight" size="xs" radius="full" className="gap-1.5">
      <Icon name="circle-check" className="text-[10px]" />
      Verified
    </Badge>
  );
}

/** A timeline row: title line, meta line, prose, and a quantified outcome where one exists. */
function TimelineEntry({ title, subtitle, meta, description, outcome, verificationStatus, tail }) {
  return (
    <li className="relative pl-6">
      {/* The rail and its node. Purely decorative — the list semantics carry the structure. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-2 h-2 w-2 rounded-full bg-brand-blue ring-4 ring-blue-50"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-[3px] top-5 w-px bg-gray-200 last:hidden"
      />

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold text-brand-dark">{title}</h3>
        <VerificationMark status={verificationStatus} />
      </div>

      {subtitle && <p className="mt-0.5 text-sm font-medium text-gray-700">{subtitle}</p>}
      {meta.length > 0 && <p className="mt-1 text-xs text-gray-500">{meta.join('  ·  ')}</p>}

      {description && (
        <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {description}
        </p>
      )}

      {/*
        The measurable claim, lifted out of the prose deliberately.

        PRD §8.3 stores "quantified scale / outcomes" apart from the description because it is the
        thing a recruiter scans for. Burying it in a paragraph would waste the only structured
        signal on the entry.
      */}
      {outcome && (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-brand-dark">
          <Icon name="chart-line" className="mt-0.5 flex-none text-xs text-brand-blue" />
          <span>{outcome}</span>
        </p>
      )}

      {tail}
    </li>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────────────────────────── */

/**
 * The hero. Identity first, at a glance, with no decoration that competes with it.
 *
 * Deliberately NOT a giant marketing hero: it is a professional header of roughly the same weight
 * as the company profile header, so the two feel like one product.
 */
export function PortfolioHero({ header, statusSlot, actions }) {
  const place = locationLine(header.location);

  const facts = [
    header.yearsExperience != null && {
      label: 'Experience',
      value: `${header.yearsExperience} ${header.yearsExperience === 1 ? 'year' : 'years'}`,
    },
    header.availability && {
      label: 'Availability',
      value: AVAILABILITY_LABELS[header.availability] ?? humanise(header.availability),
    },
    header.deliveryModes?.length > 0 && {
      label: 'Works',
      value: labelled(header.deliveryModes, DELIVERY_MODE_LABELS).join(', '),
    },
  ].filter(Boolean);

  return (
    <header className={`${CARD} p-6 sm:p-8`}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar
          src={header.photoUrl}
          alt=""
          initials={initialsOf(header.name)}
          size="lg"
          shape="rounded"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">
              {header.name || 'Educator'}
            </h1>
            {/* Pronouns exactly as written — never inferred, never reformatted. */}
            {header.pronouns && (
              <span className="text-sm font-medium text-gray-500">({header.pronouns})</span>
            )}
            {statusSlot}
          </div>

          {header.headline && (
            <p className="mt-1.5 text-base text-gray-700 sm:text-lg">{header.headline}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-gray-500">
            {place && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="location-dot" className="text-xs text-gray-400" />
                {place}
              </span>
            )}
            {header.languages?.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="comments" className="text-xs text-gray-400" />
                Teaches in {labelled(header.languages, LANGUAGE_LABELS).join(', ')}
              </span>
            )}
          </div>

          {header.targetRoles?.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {header.targetRoles.map((role) => (
                <li
                  key={role}
                  className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue"
                >
                  {CANDIDATE_ROLE_LABELS[role] ?? humanise(role)}
                </li>
              ))}
            </ul>
          )}
        </div>

        {actions && <div className="flex w-full flex-none flex-col gap-2 sm:w-52">{actions}</div>}
      </div>

      {facts.length > 0 && (
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className={MICRO_LABEL}>{fact.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-brand-dark">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/**
 * Everything below the hero, in the order PRD §8.8 reads: who they are, what they know, what they
 * have done, what proves it, how they work, and how to reach them.
 *
 * @param {object} props.profile      The server's recruiter view
 * @param {boolean} [props.showEmpty] Draw empty sections rather than hiding them. True on the
 *                                    candidate's own preview, where a gap is actionable; false
 *                                    for a reader, to whom it is only noise.
 * @param {React.ReactNode} [props.contactSlot] Replaces the contact block — REC-13 draws its own
 *                                    with the "why you can see this" framing.
 */
export function PortfolioBody({ profile, showEmpty = false, contactSlot }) {
  const { header, introduction, expertise, evidence, practice, outcomes, contact } = profile;

  const hasExpertise =
    expertise?.subjects?.length ||
    expertise?.learnerSegments?.length ||
    expertise?.tests ||
    expertise?.curricula ||
    header.employmentTypes?.length;

  const impact = [...(outcomes?.statements ?? []), ...(outcomes?.fromExperience ?? [])];

  return (
    <>
      <PortfolioSection
        id="about"
        title="Professional summary"
        icon="user"
        empty={!introduction}
        alwaysShow={showEmpty}
      >
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-700">
          {introduction}
        </p>
      </PortfolioSection>

      <PortfolioSection
        id="expertise"
        title="Expertise"
        subtitle="What they teach, whom they teach, and how."
        icon="book-open"
        empty={!hasExpertise}
        alwaysShow={showEmpty}
      >
        <div className="space-y-6">
          <ChipGroup title="Subjects and tests" values={expertise?.subjects} labels={SUBJECT_LABELS} />
          <ChipGroup
            title="Learner levels"
            values={expertise?.learnerSegments}
            labels={LEARNER_SEGMENT_LABELS}
          />
          <TextGroup title="Tests prepared for" body={expertise?.tests} />
          <TextGroup title="Curricula and special populations" body={expertise?.curricula} />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ChipGroup
              title="Engagement"
              values={header.employmentTypes}
              labels={EMPLOYMENT_TYPE_LABELS}
            />
            <ChipGroup
              title="Delivery"
              values={header.deliveryModes}
              labels={DELIVERY_MODE_LABELS}
            />
          </div>
        </div>
      </PortfolioSection>

      <PortfolioSection
        id="experience"
        title="Experience"
        icon="briefcase"
        empty={!evidence?.experience?.length}
        alwaysShow={showEmpty}
      >
        <ol className="space-y-7">
          {(evidence?.experience ?? []).map((entry) => (
            <TimelineEntry
              key={entry.id}
              title={entry.role}
              subtitle={entry.organization}
              meta={[
                dateRange(entry),
                entry.location,
                entry.deliveryMode
                  ? DELIVERY_MODE_LABELS[entry.deliveryMode] ?? humanise(entry.deliveryMode)
                  : null,
              ].filter(Boolean)}
              description={entry.description}
              outcome={entry.outcome}
              verificationStatus={entry.verificationStatus}
            />
          ))}
        </ol>
      </PortfolioSection>

      <PortfolioSection
        id="education"
        title="Education"
        icon="graduation-cap"
        empty={!evidence?.education?.length}
        alwaysShow={showEmpty}
      >
        <ol className="space-y-7">
          {(evidence?.education ?? []).map((entry) => (
            <TimelineEntry
              key={entry.id}
              title={[entry.qualification, entry.fieldOfStudy].filter(Boolean).join(', ') ||
                entry.institution}
              subtitle={
                [entry.qualification, entry.fieldOfStudy].filter(Boolean).length
                  ? entry.institution
                  : null
              }
              meta={[dateRange(entry)].filter(Boolean)}
              description={entry.description}
              verificationStatus={entry.verificationStatus}
            />
          ))}
        </ol>
      </PortfolioSection>

      <PortfolioSection
        id="credentials"
        title="Credentials"
        subtitle="Licences, certifications, and memberships."
        icon="certificate"
        empty={!evidence?.credentials?.length}
        alwaysShow={showEmpty}
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(evidence?.credentials ?? []).map((entry) => (
            <li key={entry.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-brand-dark">{entry.name}</h3>
                <VerificationMark status={entry.verificationStatus} />
              </div>
              {entry.issuer && <p className="mt-1 text-sm text-gray-600">{entry.issuer}</p>}
              {(dateRange(entry) || entry.credentialType) && (
                <p className="mt-1 text-xs text-gray-500">
                  {[entry.credentialType ? humanise(entry.credentialType) : null, dateRange(entry)]
                    .filter(Boolean)
                    .join('  ·  ')}
                </p>
              )}
              {entry.result && (
                <p className="mt-2 text-sm font-semibold text-brand-dark">{entry.result}</p>
              )}
              {/*
                A link the candidate already hosts — there is no file storage in this API, so a
                "document uploaded" badge would be a claim we cannot back. `noopener` because the
                destination is third-party and out of our control.
              */}
              {entry.documentUrl && (
                <a
                  href={entry.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline"
                >
                  <Icon name="link" className="text-[10px]" />
                  View credential
                </a>
              )}
            </li>
          ))}
        </ul>
      </PortfolioSection>

      <PortfolioSection
        id="scores"
        title="Assessments and scores"
        icon="award"
        empty={!evidence?.scores?.length}
      >
        <ul className="flex flex-wrap gap-3">
          {(evidence?.scores ?? []).map((entry) => (
            <li
              key={entry.id}
              className="min-w-[10rem] rounded-xl border border-gray-200 bg-white px-4 py-3"
            >
              <p className={MICRO_LABEL}>{entry.name}</p>
              <p className="mt-1 text-xl font-bold text-brand-dark">{entry.result}</p>
              {entry.issuer && <p className="mt-0.5 text-xs text-gray-500">{entry.issuer}</p>}
            </li>
          ))}
        </ul>
      </PortfolioSection>

      <PortfolioSection
        id="practice"
        title="Teaching practice"
        subtitle="How they approach the work."
        icon="chalkboard-user"
        empty={!practice?.length}
        alwaysShow={showEmpty}
      >
        <div className="space-y-6">
          {(practice ?? []).map((item) => (
            <TextGroup key={item.key} title={item.label} body={item.body} />
          ))}
        </div>
      </PortfolioSection>

      <PortfolioSection
        id="outcomes"
        title="Outcomes and impact"
        subtitle="What changed because of them."
        icon="chart-line"
        empty={impact.length === 0}
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(outcomes?.statements ?? []).map((item) => (
            <li
              key={item.key}
              className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"
            >
              <p className={MICRO_LABEL}>{item.label}</p>
              <p className="mt-1.5 text-sm font-medium text-brand-dark">{item.body}</p>
            </li>
          ))}
          {(outcomes?.fromExperience ?? []).map((item) => (
            <li key={item.id} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <p className={MICRO_LABEL}>
                {item.role} · {item.organization}
              </p>
              <p className="mt-1.5 text-sm font-medium text-brand-dark">{item.outcome}</p>
            </li>
          ))}
        </ul>
      </PortfolioSection>

      <PortfolioSection
        id="media"
        title="Portfolio and media"
        subtitle="Teaching videos, lesson samples, and other evidence."
        icon="video"
        empty={!evidence?.media?.length}
        alwaysShow={showEmpty}
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(evidence?.media ?? []).map((item) => (
            <li key={item.id}>
              {/*
                A LINK, not an iframe. PRD §16.3 keeps embeds behind a provider allow-list; the
                server has already checked the host, and opening in a new tab keeps third-party
                script out of this page entirely rather than merely sandboxed within it.
              */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex h-full gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-blue/40 hover:bg-blue-50/40"
              >
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-slate-100 text-gray-500 transition-colors group-hover:bg-brand-blue group-hover:text-white">
                  <Icon name="circle-play" className="text-base" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-brand-dark">{item.title}</span>
                  {item.prompt && (
                    <span className="mt-0.5 block text-xs text-gray-500">{item.prompt}</span>
                  )}
                  {item.description && (
                    <span className="mt-1.5 block text-sm text-gray-600">{item.description}</span>
                  )}
                  {item.provider && (
                    <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {item.provider}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </PortfolioSection>

      {/*
        References are Phase 2 (PRD §20.3): there is no collection to read, so the server always
        sends an empty array. The section therefore only ever appears on the candidate's own
        preview, where `showEmpty` explains the gap rather than implying they supplied none.
      */}
      {showEmpty && (
        <PortfolioSection
          id="references"
          title="References"
          icon="comments"
          empty
          alwaysShow
        />
      )}

      {contactSlot ?? (
        <PortfolioSection id="contact" title="Contact" icon="link" empty={false}>
          {contact?.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="text-sm font-semibold text-brand-blue hover:underline"
            >
              {contact.email}
            </a>
          ) : (
            <p className="text-sm text-gray-600">
              Contact details are kept private. Reach this educator through Evallo Recruit.
            </p>
          )}
        </PortfolioSection>
      )}
    </>
  );
}

/**
 * The anchor rail beside the document.
 *
 * Built from the sections that actually rendered, so it can never link to a heading that is not
 * on the page. Hidden below `lg`, where the document is short enough to scroll.
 */
export function PortfolioNav({ profile, showEmpty = false, extraItems = [] }) {
  const { header, introduction, expertise, evidence, practice, outcomes } = profile;

  const impact = (outcomes?.statements?.length ?? 0) + (outcomes?.fromExperience?.length ?? 0);

  const items = [
    (introduction || showEmpty) && { id: 'about', label: 'Summary', icon: 'user' },
    (expertise?.subjects?.length ||
      expertise?.learnerSegments?.length ||
      expertise?.tests ||
      expertise?.curricula ||
      header.employmentTypes?.length ||
      showEmpty) && { id: 'expertise', label: 'Expertise', icon: 'book-open' },
    (evidence?.experience?.length || showEmpty) && {
      id: 'experience',
      label: 'Experience',
      icon: 'briefcase',
    },
    (evidence?.education?.length || showEmpty) && {
      id: 'education',
      label: 'Education',
      icon: 'graduation-cap',
    },
    (evidence?.credentials?.length || showEmpty) && {
      id: 'credentials',
      label: 'Credentials',
      icon: 'certificate',
    },
    evidence?.scores?.length && { id: 'scores', label: 'Scores', icon: 'award' },
    (practice?.length || showEmpty) && {
      id: 'practice',
      label: 'Practice',
      icon: 'chalkboard-user',
    },
    impact > 0 && { id: 'outcomes', label: 'Outcomes', icon: 'chart-line' },
    (evidence?.media?.length || showEmpty) && { id: 'media', label: 'Media', icon: 'video' },
    showEmpty && { id: 'references', label: 'References', icon: 'comments' },
    /*
     * Audience-specific sections, injected by the page that owns them — REC-13's "Interest in your
     * company" is meaningless to a share-link reader and must not appear on their rail. They land
     * before Contact because that is where the page renders them.
     */
    ...extraItems,
    { id: 'contact', label: 'Contact', icon: 'link' },
  ].filter(Boolean);

  return (
    <nav aria-label="Portfolio sections" className="hidden lg:block">
      <div className={`${CARD} sticky top-24 p-3`}>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="group flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-brand-blue"
              >
                <Icon
                  name={item.icon}
                  className="w-4 text-center text-gray-400 transition-colors group-hover:text-brand-blue"
                />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
