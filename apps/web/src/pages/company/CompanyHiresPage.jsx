import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchHires } from '@/services';
import { PATHS, buildPath } from '@/router/paths';

/**
 * REC-14 — the hiring record.
 *
 * ── Why this screen exists ────────────────────────────────────────────────────────────────────
 *
 * The pipeline board answers "what needs work?", so it hides closed entries by default and the
 * server backs that up with `active: true`. That is right for a board and wrong as the only door
 * to a hire: the moment a recruiter moved someone to Hired, that person left the board AND left
 * the header count, and the only way back was a checkbox labelled "Show closed" — which reads as
 * rejected/archived, not as the outcome you were working towards.
 *
 * So this is not a filtered board. It is the question a board cannot answer: who did we hire, into
 * what, starting when, decided by whom, and how long did it take.
 *
 * ── Nothing here is new data ──────────────────────────────────────────────────────────────────
 *
 * Every field was already captured. `roleTitle` and `startDate` are collected by the hire dialog;
 * `hiredAt` and `hiredBy` come from the `stageHistory` row the move already wrote. No model
 * changed — the facts were recorded and simply had nowhere to be read.
 */

/** ISO date (`2026-09-01`) or a timestamp → "1 Sep 2026". Returns null so callers can render a dash. */
function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function HireRow({ hire, companySlug }) {
  const startDate = formatDate(hire.startDate);
  const hiredAt = formatDate(hire.hiredAt);

  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar
          src={hire.candidate?.photoUrl ?? undefined}
          initials={(hire.candidate?.name ?? '?').slice(0, 1).toUpperCase()}
          size="md"
          alt=""
        />

        <div className="min-w-0">
          {/*
            The candidate page is the same one the board links to, so a hire is never a dead end —
            notes, history and messages all remain reachable from here.
          */}
          <Link
            to={buildPath(PATHS.COMPANY_CANDIDATE, {
              companySlug,
              candidateId: hire.candidate?.id,
            })}
            className="text-base font-semibold text-brand-dark hover:text-brand-blue hover:underline"
          >
            {hire.candidate?.name ?? 'Candidate'}
          </Link>

          {/*
            `roleTitle` is required by the server when moving to Hired, so it is effectively always
            present — the fallback covers entries written before that rule existed.
          */}
          <p className="mt-0.5 break-words text-sm text-gray-700">
            {hire.roleTitle ?? <span className="italic text-gray-500">Role not recorded</span>}
          </p>

          <p className="mt-1 text-xs text-gray-600">
            {startDate ? `Starts ${startDate}` : 'Start date not set'}
            {hiredAt && ` · Hired ${hiredAt}`}
            {hire.hiredBy?.name && ` by ${hire.hiredBy.name}`}
          </p>
        </div>
      </div>

      {/* Time-to-hire: the one number a pilot actually reports, and it is already derivable. */}
      {hire.daysToHire !== null && hire.daysToHire !== undefined && (
        <div className="flex-shrink-0 text-left sm:text-right">
          <p className="text-lg font-bold text-brand-dark">{hire.daysToHire}</p>
          <p className="text-xs text-gray-600">
            {hire.daysToHire === 1 ? 'day to hire' : 'days to hire'}
          </p>
        </div>
      )}
    </li>
  );
}

export function CompanyHiresPage() {
  const { companySlug } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(
    async (signal) => {
      try {
        const data = await fetchHires(companySlug, { signal });
        setState({ status: 'ready', ...data });
      } catch (error) {
        if (signal?.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      }
    },
    [companySlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your hires…</span>
          <Skeleton className="h-10 w-56 rounded-lg" />
          <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load your hires.'}</StatusRegion>
      </Container>
    );
  }

  const { hires, total } = state;

  return (
    <Container className="py-32">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Hires</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          {total === 0
            ? 'Everyone you hire through the pipeline is recorded here.'
            : `${total} ${total === 1 ? 'person' : 'people'} hired through your pipeline.`}
        </p>
      </header>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
          <p className="text-base font-semibold text-brand-dark">No hires yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            When you move someone to <strong>Hired</strong> on the pipeline, they appear here with
            the role, their start date, and who made the decision.
          </p>
          <Button
            to={buildPath(PATHS.COMPANY_PIPELINE, { companySlug })}
            variant="primary"
            size="md"
            radius="lg"
            className="mt-6"
          >
            Open the pipeline <Icon name="arrow-right" className="text-sm" />
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {hires.map((hire) => (
            <HireRow key={hire.id} hire={hire} companySlug={companySlug} />
          ))}
        </ul>
      )}
    </Container>
  );
}
