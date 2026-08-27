import {
  SUBJECT_LABELS,
  COUNTRY_LABELS,
  AVAILABILITY_LABELS,
  PIPELINE_STAGE_LABELS,
} from '@evallo/shared';
import { Avatar, Button, Icon } from '@/components/ui';

/** Initials for the photo fallback — a candidate may share a name and no picture. */
function initialsFor(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * "Active this week", from `lastActiveAt`.
 *
 * The reference draws a green dot labelled "Online Now". We do not track presence and should not
 * imply it — a recruiter who reads "online now" expects a reply in minutes. Recency is the honest
 * version of the same signal, and it is only shown when it is actually recent: no dot is better
 * than a dot that means nothing.
 */
function recency(lastActiveAt) {
  if (!lastActiveAt) return null;

  const days = Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return null;
  if (days <= 7) return { dot: 'bg-green-500', text: 'Active this week' };
  if (days <= 30) return { dot: 'bg-amber-400', text: 'Active this month' };
  return null;
}

/**
 * One candidate, as a recruiter search result — REC-12 (PRD §7.7, §10, §21.4).
 *
 * ── What this card deliberately does NOT show ─────────────────────────────────────────────────
 *
 * The approved reference puts two blocks on this card that are not built here, and neither
 * omission is a styling shortcut:
 *
 * **"Platform Verified Credentials"** — chips reading "1590 (Official)", "M.Ed. Harvard",
 * "Background Cleared". Nothing in this product verifies any of that. Evidence verification
 * labels are B-04 and unbuilt, so there is no field anywhere that could distinguish a checked
 * background from a claimed one. Rendering those badges would be asserting a verification we have
 * never performed, about a real person, to someone deciding whether to hire them. The slot is kept
 * and filled with something true: **why this person matched the search**, which PRD §21.4 requires
 * be shown anyway.
 *
 * **The teaching-sample video** — `evidence.media` exists, but on the FULL profile (REC-13), not
 * here. `toSearchCard` drops the evidence block on purpose: this screen is discovery, and its own
 * comment says a card is "a reason to open a profile, not a substitute for opening one". Surfacing
 * evidence on a search result is a §21.4 decision, not a layout one. The candidate's own
 * introduction fills that panel instead — the thing they wrote to be read first.
 *
 * Everything else from the reference is here and works: the photo, the recency dot, the meta row,
 * the heart, and a footer of real actions.
 */
export function CandidateResultCard({
  card,
  profileHref,
  isSaved,
  pipelineStage,
  busy,
  onToggleSave,
  onAddToPipeline,
  onMessage,
  matchReasons = [],
}) {
  const { header } = card;
  const name = header.name || 'Educator';
  const active = recency(card.lastActiveAt);

  const meta = [
    header.location?.country
      ? [header.location.city, COUNTRY_LABELS[header.location.country] ?? header.location.country]
          .filter(Boolean)
          .join(', ')
      : null,
    typeof header.yearsExperience === 'number' ? `${header.yearsExperience} years exp.` : null,
    header.availability ? AVAILABILITY_LABELS[header.availability] : null,
  ].filter(Boolean);

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:shadow-xl">
      <div className="flex-1 p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-4">
            <div className="relative flex-none">
              <Avatar
                src={header.photoUrl}
                initials={initialsFor(name)}
                size="lg"
                tone="brand"
                className="ring-2 ring-gray-100"
              />
              {active && (
                <span
                  title={active.text}
                  className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white ${active.dot}`}
                >
                  <span className="sr-only">{active.text}</span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-brand-dark">{name}</h3>
              {header.headline && (
                <p className="mt-0.5 text-sm font-medium text-gray-600">{header.headline}</p>
              )}

              {meta.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {header.location?.country && (
                    <span className="flex items-center gap-1">
                      <Icon name="location-dot" className="text-[10px]" />
                      {meta[0]}
                    </span>
                  )}
                  {typeof header.yearsExperience === 'number' && (
                    <span className="flex items-center gap-1">
                      <Icon name="briefcase" className="text-[10px]" />
                      {header.yearsExperience} years exp.
                    </span>
                  )}
                  {header.availability && (
                    <span className="flex items-center gap-1">
                      <Icon name="bolt" className="text-[10px]" />
                      {AVAILABILITY_LABELS[header.availability]}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/*
            The reference's heart. Saving is SILENT to the candidate (PRD §21.4) — nothing here
            notifies them — so the control needs no confirmation, only a clear state.
          */}
          <button
            type="button"
            disabled={busy}
            onClick={onToggleSave}
            aria-pressed={isSaved}
            aria-label={isSaved ? `Remove ${name} from your shortlist` : `Save ${name} to your shortlist`}
            className={`flex-none rounded-lg p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-not-allowed disabled:opacity-50 ${
              isSaved ? 'text-red-500 hover:text-red-600' : 'text-gray-300 hover:text-red-500'
            }`}
          >
            <Icon name="heart" className="text-lg" />
          </button>
        </div>

        {card.expertise?.subjects?.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Subjects
            </p>
            <div className="flex flex-wrap gap-2">
              {card.expertise.subjects.slice(0, 6).map((subject) => (
                <span
                  key={subject}
                  className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {SUBJECT_LABELS[subject] ?? subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {/*
          The reference's credentials block, carrying what is actually true: PRD §21.4 requires a
          recruiter be told WHY a record satisfied their criteria, and the server computes it in
          `explainMatch`. Same two-tone chip treatment, real content.
        */}
        {matchReasons.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Why they match your search
            </p>
            <div className="flex flex-wrap gap-2">
              {matchReasons.map((reason) => (
                <span
                  key={reason.label}
                  className="flex items-center overflow-hidden rounded border border-brand-blue/20 bg-brand-blue/5"
                >
                  <span className="bg-brand-blue px-2 py-1 text-xs font-medium text-white">
                    {reason.label}
                  </span>
                  <span className="bg-white px-2 py-1 text-xs font-bold text-brand-dark">
                    {reason.values}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/*
          The reference's media panel. The candidate's own introduction sits here instead of a
          video — see the note on this component about why evidence is not on a search card.
        */}
        {card.introduction && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              In their words
            </p>
            <p className="line-clamp-3 text-sm leading-relaxed text-gray-700">
              {card.introduction}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-gray-100 bg-gray-50/50 p-4">
        <Button
          to={profileHref}
          variant="outlineDark"
          size="none"
          radius="lg"
          className="flex-1 justify-center px-4 py-2 text-sm font-semibold !border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          View full profile
        </Button>

        <Button
          type="button"
          variant="primary"
          size="none"
          radius="lg"
          className="flex-1 justify-center px-4 py-2 text-sm font-semibold"
          onClick={onMessage}
        >
          Message educator
        </Button>

        {/*
          Not in the reference, and kept: the pipeline is how a recruiter actually works a
          shortlist, and dropping a working control to match a picture would be a real regression.
          It reads as state once they are in one, rather than offering to add them twice.
        */}
        {pipelineStage ? (
          <span className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-xs font-semibold text-gray-600">
            In {PIPELINE_STAGE_LABELS[pipelineStage] ?? 'pipeline'}
          </span>
        ) : (
          <Button
            type="button"
            variant="link"
            size="none"
            radius="lg"
            className="w-full justify-center px-4 py-1.5 text-xs font-semibold"
            disabled={busy}
            onClick={onAddToPipeline}
          >
            <Icon name="plus" className="text-[10px]" /> Add to pipeline
          </Button>
        )}
      </div>
    </li>
  );
}
