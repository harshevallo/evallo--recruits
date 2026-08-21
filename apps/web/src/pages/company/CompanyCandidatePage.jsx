import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  CANDIDATE_ROLE_LABELS,
  AVAILABILITY_LABELS,
  COUNTRY_LABELS,
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
} from '@evallo/shared';
import { PIPELINE_STAGE_LABELS } from '@evallo/shared';
import { Avatar, BackLink, Badge, Button, Container, Icon, Modal } from '@/components/ui';
import { Textarea } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  fetchCandidate,
  fetchSavedCandidates,
  saveCandidate,
  unsaveCandidate,
  addToPipeline,
  fetchPipeline,
  startCompanyConversation,
  fetchCandidateNotes,
  createCandidateNote,
  deleteCandidateNote,
} from '@/services';
import { PortfolioBody, PortfolioNav } from '@/features/candidate/portfolio/PortfolioDocument';
import { useCompany } from '@/context/CompanyContext';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-13 — candidate viewer (PRD §7.10, §8.8).
 *
 * An EVALUATION screen. It reads; it does not edit, message, or move anyone through a pipeline.
 * There is deliberately not a single input, toggle or save control on this page — a recruiter
 * looking at someone else's profile should never be one mis-click from appearing to change it.
 *
 * Everything rendered comes from `toRecruiterView()`, the same server-side rendering CAN-03 shows
 * the candidate about themselves. This page therefore decides nothing about visibility: a field
 * that is absent was withheld by the candidate's own settings, and the page simply does not draw
 * it. No privacy rule is reconstructed here from raw data.
 */

/** Human wording for how contact sharing is configured, from the candidate's point of view. */
const CONTACT_RULE_TEXT = {
  [CONTACT_VISIBILITY.HIDDEN]: 'This person keeps their contact details private.',
  [CONTACT_VISIBILITY.AFTER_INTEREST]:
    'Contact details are shared only with companies they have approached.',
  [CONTACT_VISIBILITY.ON_REQUEST]: 'Contact details are shared when they approve a request.',
  [CONTACT_VISIBILITY.AUTHORIZED_RECRUITERS]: 'They have chosen to share contact details.',
};

/* Surfaces, matched to the product's card language: white, hairline border, restrained shadow. */
const CARD = 'rounded-2xl border border-gray-200 bg-white shadow-sm';
const MICRO_LABEL = 'text-[11px] font-bold uppercase tracking-wider text-gray-500';

/** Initials for a candidate with no photo. Mirrors how companies fall back on the public side. */
function initialsOf(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function humanise(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function Section({ id, title, subtitle, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={`${CARD} scroll-mt-28 p-7`}>
      <div className="mb-5">
        <h2 id={`${id}-heading`} className="text-lg font-bold text-brand-dark">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function CompanyCandidatePage() {
  const { companySlug, candidateId } = useParams();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });
  const { can } = useCompany();
  const mayWriteNotes = can('note:write');

  /* Where the recruiter came from, recorded in the access log (PRD §21.4). */
  const source = searchParams.get('source') ?? 'direct';

  /* Recruiter-workspace state: shortlist, pipeline position, internal notes, composer. */
  const [saved, setSaved] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [composing, setComposing] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  const load = useCallback(
    async (signal) => {
      const data = await fetchCandidate(companySlug, candidateId, source, { signal });
      setState({ status: 'ready', data });
    },
    [companySlug, candidateId, source],
  );

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal).catch((error) => {
      if (controller.signal.aborted || error.name === 'CanceledError') return;
      setState({ status: 'error', status404: error.status === 404, message: error.message });
    });

    return () => controller.abort();
  }, [load]);

  /**
   * The workspace records attached to this candidate.
   *
   * Loaded separately from the profile and tolerant of failure: a viewer without `pipeline:view`
   * still gets the profile, just without pipeline state. Nothing here is required to render.
   */
  const loadWorkspace = useCallback(async () => {
    const [savedList, pipeline, noteList] = await Promise.allSettled([
      fetchSavedCandidates(companySlug),
      fetchPipeline(companySlug, { includeClosed: false }),
      fetchCandidateNotes(companySlug, candidateId),
    ]);

    if (savedList.status === 'fulfilled') {
      setSaved((savedList.value.saved ?? []).some((row) => row.candidate.id === candidateId));
    }

    if (pipeline.status === 'fulfilled') {
      const match = (pipeline.value.stages ?? [])
        .flatMap((stage) => stage.entries)
        .find((entry) => entry.candidate.id === candidateId);
      setPipelineStage(match?.stage ?? null);
    }

    if (noteList.status === 'fulfilled') setNotes(noteList.value.notes ?? []);
  }, [companySlug, candidateId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  async function toggleSaved() {
    const wasSaved = saved;
    setActionBusy(true);
    setSaved(!wasSaved);
    try {
      if (wasSaved) await unsaveCandidate(companySlug, candidateId);
      else await saveCandidate(companySlug, candidateId);
      setActionFeedback({
        tone: 'success',
        text: wasSaved ? 'Removed from your shortlist.' : 'Saved to your shortlist.',
      });
    } catch (error) {
      setSaved(wasSaved);
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setActionBusy(false);
    }
  }

  async function addCandidate() {
    setActionBusy(true);
    try {
      const { entry } = await addToPipeline(companySlug, { candidateId, source: 'search' });
      setPipelineStage(entry.stage);
      setActionFeedback({
        tone: 'success',
        text: `Added to ${PIPELINE_STAGE_LABELS[entry.stage] ?? 'the pipeline'}.`,
      });
    } catch (error) {
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not add them.' });
    } finally {
      setActionBusy(false);
    }
  }

  async function sendFirstMessage() {
    if (!composing?.body.trim()) return;
    setActionBusy(true);
    try {
      await startCompanyConversation(companySlug, { candidateId, body: composing.body.trim() });
      setComposing(null);
      setActionFeedback({ tone: 'success', text: 'Message sent. It is now in your Messages.' });
    } catch (error) {
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not send that.' });
    } finally {
      setActionBusy(false);
    }
  }

  async function addNote(event) {
    event.preventDefault();
    if (!noteDraft.trim() || actionBusy) return;
    setActionBusy(true);
    try {
      const { note } = await createCandidateNote(companySlug, candidateId, noteDraft.trim());
      setNotes((current) => [note, ...current]);
      setNoteDraft('');
    } catch (error) {
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not save that note.' });
    } finally {
      setActionBusy(false);
    }
  }

  async function removeNote(noteId) {
    setActionBusy(true);
    try {
      await deleteCandidateNote(companySlug, noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
    } catch (error) {
      setActionFeedback({ tone: 'error', text: error.message ?? 'We could not remove that note.' });
    } finally {
      setActionBusy(false);
    }
  }

  /* Back to wherever they came from — the inbox sets source=interest, search sets source=search. */
  const backTo =
    source === 'interest'
      ? { to: buildPath(PATHS.COMPANY_INTERESTS, { companySlug }), label: 'Back to inbox' }
      : { to: buildPath(PATHS.COMPANY_SEARCH, { companySlug }), label: 'Back to search' };

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite" className="space-y-6">
          <span className="sr-only">Loading this candidate…</span>
          <Skeleton className="h-36 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
            <Skeleton className="hidden h-64 w-full rounded-2xl lg:block" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        </div>
      </Container>
    );
  }

  /*
   * Unavailable and forbidden are ONE state, because the server deliberately cannot tell them
   * apart — a 404 here may mean no such person, or a person who has not shared with this company.
   * Phrasing it as the candidate's choice rather than an error is both accurate and the only
   * wording that does not leak which of the two it was.
   */
  if (state.status === 'error') {
    return (
      <Container size="prose" className="py-32">
        <div className={`${CARD} p-10 text-center`}>
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-gray-400">
            <Icon name="shield-halved" className="text-xl" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-brand-dark">
            {state.status404
              ? 'This profile is not available to you'
              : 'We could not load this profile'}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-gray-600">
            {state.status404
              ? 'It may have been withdrawn from search, shared only with other companies, or never published. Candidates control who can see them.'
              : (state.message ?? 'Please try again.')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button to={backTo.to} variant="primary" size="md" radius="lg">
              {backTo.label}
            </Button>
            <Button
              to={buildPath(PATHS.COMPANY_HOME, { companySlug })}
              variant="outlineDark"
              size="md"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            >
              Company home
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  const { profile, access, interests, lastActiveAt } = state.data;
  const { header, contact } = profile;

  /*
   * The section rail is built by the shared renderer from the sections that actually drew, so it
   * can never link to a heading that is not on the page. "Interest in your company" is this
   * screen's alone — it means nothing to a candidate previewing themselves or to a share-link
   * reader — so it is injected rather than living in the shared component.
   */
  const extraNavItems = interests.length > 0
    ? [{ id: 'relationship', label: 'Interest in you', icon: 'comments' }]
    : [];

  const metaLine = [
    header.location?.country
      ? [header.location.region, COUNTRY_LABELS[header.location.country] ?? header.location.country]
          .filter(Boolean)
          .join(', ')
      : null,
    typeof header.yearsExperience === 'number' ? `${header.yearsExperience} years experience` : null,
    header.availability ? AVAILABILITY_LABELS[header.availability] : null,
  ].filter(Boolean);

  return (
    <Container className="py-32">
      <nav aria-label="Breadcrumb" className="mb-5">
        <BackLink to={backTo.to} label={backTo.label} />
      </nav>

      {/* Profile header — the anchor of the page, and the only place identity is stated. */}
      <header className={`${CARD} mb-6 p-7`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar src={header.photoUrl} alt="" initials={initialsOf(header.name)} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-brand-dark sm:text-3xl">
                {header.name || 'Educator'}
              </h1>
              {header.status === CANDIDATE_VISIBILITY.PAUSED && (
                <Badge tone="neutral" size="sm" radius="full">
                  Paused
                </Badge>
              )}
              {access.viaGrant && (
                <Badge tone="successLight" size="sm" radius="full">
                  Shared with you
                </Badge>
              )}
            </div>

            {header.headline && (
              <p className="mt-1.5 text-base text-gray-700 sm:text-lg">{header.headline}</p>
            )}

            {metaLine.length > 0 && (
              <p className="mt-2.5 text-sm text-gray-500">{metaLine.join('  ·  ')}</p>
            )}

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

          {/*
            Recruiter actions. Each one persists: shortlist row, pipeline entry, real conversation.
            The email button appears only when the candidate's own contact rule revealed an address
            — this screen never derives that from the viewer's permission.
          */}
          <div className="flex w-full flex-none flex-col gap-2 sm:w-48">
            <Button
              type="button"
              variant="primary"
              size="md"
              radius="lg"
              onClick={() => setComposing({ body: '' })}
            >
              Message
            </Button>

            <Button
              type="button"
              variant="outlineDark"
              size="md"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              disabled={actionBusy}
              onClick={toggleSaved}
            >
              {saved ? 'Saved ✓' : 'Save to shortlist'}
            </Button>

            {pipelineStage ? (
              <Link
                to={buildPath(PATHS.COMPANY_PIPELINE, { companySlug })}
                className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold text-gray-600 transition-colors hover:text-brand-blue"
              >
                In {PIPELINE_STAGE_LABELS[pipelineStage] ?? 'pipeline'} — open board
              </Link>
            ) : (
              <Button
                type="button"
                variant="outlineDark"
                size="md"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
                disabled={actionBusy}
                onClick={addCandidate}
              >
                Add to pipeline
              </Button>
            )}

            {contact?.email && (
              <Button
                to={`mailto:${contact.email}`}
                variant="outlineDark"
                size="md"
                radius="lg"
                className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Email
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr]">
        <PortfolioNav profile={profile} extraItems={extraNavItems} />

        <div className="min-w-0 space-y-6">
          {/*
            The portfolio itself, drawn by the shared renderer.

            This screen used to hand-roll four sections over the same payload and stub the fifth
            with "Evidence provided." — while `toRecruiterView` reported evidence as four
            permanently empty arrays, so no recruiter ever saw an experience entry a candidate had
            written. Both halves are fixed: the server projects the real evidence layer, and this
            page renders it through the SAME component the candidate previews. PRD §8.8 requires
            those two to match, and one component is the only way to keep them matching.

            `contactSlot` carries this audience's extras — the interest history and the "why you
            can see this" panel — so they land where the recruiter expects them without the shared
            renderer needing to know a recruiter exists.
          */}
          <PortfolioBody
            profile={profile}
            contactSlot={
              <>
          {interests.length > 0 && (
            <Section
              id="relationship"
              title="Interest in your company"
              subtitle="What they sent you, and where it stands."
            >
              <ul className="space-y-3">
                {interests.map((interest) => (
                  <li key={interest.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        tone={interest.isOpen ? 'successLight' : 'neutral'}
                        size="sm"
                        radius="full"
                      >
                        {humanise(interest.status)}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(interest.submittedAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {interest.message && (
                      <blockquote className="mt-3 border-l-2 border-gray-200 pl-3 text-sm italic text-gray-600">
                        {interest.message}
                      </blockquote>
                    )}
                    {interest.isWithdrawn && (
                      <p className="mt-3 text-xs font-medium text-gray-500">
                        Withdrawn — no further outreach.
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              <Button
                to={buildPath(PATHS.COMPANY_INTERESTS, { companySlug })}
                variant="outlineDark"
                size="sm"
                radius="lg"
                className="mt-5 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
              >
                Manage in inbox
              </Button>
            </Section>
          )}

          {/* Contact and provenance sit last: they explain the page rather than being read first. */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section aria-labelledby="contact-heading" className={`${CARD} p-7`}>
              <h2 id="contact-heading" className="mb-4 text-lg font-bold text-brand-dark">
                Contact
              </h2>
              {contact?.email ? (
                <>
                  <a
                    href={`mailto:${contact.email}`}
                    className="break-all text-sm font-semibold text-brand-blue hover:underline"
                  >
                    {contact.email}
                  </a>
                  <p className="mt-2 text-xs text-gray-500">
                    {CONTACT_RULE_TEXT[access.contactRule]}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600">
                  {CONTACT_RULE_TEXT[access.contactRule] ??
                    'This person keeps their contact details private.'}
                </p>
              )}
            </section>

            <section
              aria-labelledby="access-heading"
              className="rounded-2xl border border-brand-blue/20 bg-blue-50/20 p-7 shadow-sm"
            >
              <h2 id="access-heading" className="mb-4 text-lg font-bold text-brand-dark">
                Why you can see this
              </h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className={MICRO_LABEL}>Their visibility</dt>
                  <dd className="mt-0.5 text-brand-dark">{humanise(access.visibility)}</dd>
                </div>
                {access.viaGrant && (
                  <div>
                    <dt className={MICRO_LABEL}>Shared with you</dt>
                    <dd className="mt-0.5 text-brand-dark">
                      Through their expression of interest. They can withdraw this at any time.
                    </dd>
                  </div>
                )}
                {lastActiveAt && (
                  <div>
                    <dt className={MICRO_LABEL}>Last active</dt>
                    <dd className="mt-0.5 text-brand-dark">
                      {new Date(lastActiveAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {/*
              Internal notes (PRD §11.2, §21.4).

              These live in their own collection and there is no candidate-facing endpoint that can
              read them — the guarantee that they never reach the candidate is structural, not a
              filter someone has to remember. The panel says so, because a recruiter needs to trust
              it to use it honestly.
            */}
            <section
              aria-labelledby="notes-heading"
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 id="notes-heading" className="text-base font-bold text-brand-dark">
                Internal notes
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Your team only. The candidate never sees these.
              </p>

              {mayWriteNotes && (
                <form noValidate onSubmit={addNote} className="mt-4">
                  <label htmlFor="note-body" className="sr-only">
                    Add a note
                  </label>
                  <Textarea
                    id="note-body"
                    name="note-body"
                    rows={3}
                    placeholder="What did you notice?"
                    value={noteDraft}
                    disabled={actionBusy}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      radius="lg"
                      disabled={actionBusy || !noteDraft.trim()}
                    >
                      {actionBusy ? 'Saving…' : 'Add note'}
                    </Button>
                  </div>
                </form>
              )}

              {notes.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No notes yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {notes.map((note) => (
                    <li
                      key={note.id}
                      className="group rounded-xl border border-gray-200 bg-slate-50/60 p-3.5"
                    >
                      <p className="whitespace-pre-wrap break-words text-sm text-brand-dark">
                        {note.body}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-gray-500">
                          {note.authorName ?? 'A teammate'} ·{' '}
                          {new Date(note.createdAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        {/* Only the author may delete — the server enforces it too. */}
                        <button
                          type="button"
                          onClick={() => removeNote(note.id)}
                          disabled={actionBusy}
                          className="text-[11px] font-semibold text-gray-400 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
              </>
            }
          />
        </div>
      </div>

      {actionFeedback && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <StatusRegion tone={actionFeedback.tone}>{actionFeedback.text}</StatusRegion>
        </div>
      )}

      <Modal
        open={Boolean(composing)}
        onClose={() => setComposing(null)}
        title={`Message ${header.name?.split(' ')[0] || 'this candidate'}`}
        description="They will see your company name with this message. Keep it about the role."
      >
        <label htmlFor="viewer-message" className="mb-1.5 block text-sm font-semibold text-gray-700">
          Your message
        </label>
        <Textarea
          id="viewer-message"
          name="viewer-message"
          rows={5}
          placeholder="Introduce your company and the role you have in mind…"
          value={composing?.body ?? ''}
          disabled={actionBusy}
          onChange={(event) => setComposing((current) => ({ ...current, body: event.target.value }))}
        />

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setComposing(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={actionBusy || !composing?.body?.trim()}
            onClick={sendFirstMessage}
          >
            {actionBusy ? 'Sending…' : 'Send message'}
          </Button>
        </div>
      </Modal>
    </Container>
  );
}
