import { useEffect, useState } from 'react';
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
} from '@evallo/shared';
import { Avatar, Badge, Button, Container, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchProfilePreview, publishProfile } from '@/services';
import { PATHS } from '@/router/paths';

const labelled = (values, labels) => (values ?? []).map((v) => labels[v] ?? v);

/** PRD §8.8 header line: where the candidate is, and which time zone they work in. */
function locationLine(location) {
  if (!location) return null;
  const place = [location.region, COUNTRY_LABELS[location.country] ?? location.country]
    .filter(Boolean)
    .join(', ');
  const zone = TIMEZONE_LABELS[location.timezone] ?? location.timezone;
  return [place || null, zone || null].filter(Boolean).join(' · ') || null;
}

/**
 * CAN-03 — profile preview (PRD §8.2, §8.8).
 *
 * Shows the **exact** recruiter rendering, produced by the same server-side serialiser a recruiter
 * will read (`toRecruiterView`). PRD §8.8 requires the preview to match the real thing including
 * its privacy state, so anything withheld is drawn as a labelled indicator rather than silently
 * omitted — otherwise a candidate could not tell what a company actually sees.
 */
export function ProfilePreviewPage() {
  const [state, setState] = useState({ status: 'loading' });
  const [publishState, setPublishState] = useState({ busy: false, message: null, tone: 'success' });

  useEffect(() => {
    const controller = new AbortController();

    fetchProfilePreview({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', ...data }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', message: error.message });
      });

    return () => controller.abort();
  }, []);

  async function handlePublish(status) {
    setPublishState({ busy: true, message: null, tone: 'success' });
    try {
      const data = await publishProfile(status);
      setState({ status: 'ready', ...data });
      setPublishState({
        busy: false,
        tone: 'success',
        message:
          status === 'private'
            ? 'Published privately. You can share it with a company by expressing interest.'
            : 'Published. Recruiters can now find you in search.',
      });
    } catch (error) {
      setPublishState({
        busy: false,
        tone: 'error',
        message: error.details?.publish ?? error.message ?? 'We could not publish your profile.',
      });
    }
  }

  if (state.status === 'loading') {
    return (
      <Container className="py-32">
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your preview…</span>
          <Skeleton className="h-10 w-72 rounded-lg" />
          <Skeleton className="mt-8 h-96 w-full rounded-2xl" />
        </div>
      </Container>
    );
  }

  if (state.status === 'error') {
    return (
      <Container className="py-32">
        <StatusRegion tone="error">{state.message ?? 'We could not load your preview.'}</StatusRegion>
        <Button to={PATHS.CANDIDATE_HOME} variant="primary" size="md" className="mt-6">
          Back to candidate home
        </Button>
      </Container>
    );
  }

  const { profile, privateFields, publish } = state;
  const { header, expertise, evidence } = profile;

  return (
    <Container className="py-32">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Profile preview</h1>
          <p className="mt-2 max-w-xl text-gray-600">
            This is exactly what a recruiter sees, including what stays private.
          </p>
        </div>
        <Button
          to={PATHS.CANDIDATE_PROFILE_BUILDER}
          variant="outlineDark"
          size="md"
          radius="lg"
          className="shrink-0 !border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          Edit profile
        </Button>
      </header>

      {publishState.message && (
        <StatusRegion tone={publishState.tone} className="mb-6">
          {publishState.message}
        </StatusRegion>
      )}

      {/* Publish controls — PRD §8.2 CAN-03. */}
      <section
        aria-labelledby="publish-heading"
        className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
      >
        <h2 id="publish-heading" className="text-lg font-bold text-brand-dark">
          {publish.isPublished ? 'Your profile is published' : 'Publish your profile'}
        </h2>

        {publish.canPublish ? (
          <p className="mt-2 text-sm text-gray-600">
            {publish.isPublished
              ? 'You can change who can find you at any time in visibility settings.'
              : 'Choose how you want to be found. You can change this later.'}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            Still needed before you can publish: {publish.blockers.join(', ')}.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="md"
            radius="lg"
            disabled={!publish.canPublish || publishState.busy}
            onClick={() => handlePublish('discoverable')}
          >
            {publish.isPublished ? 'Make discoverable' : 'Publish and be discoverable'}
          </Button>
          <Button
            variant="outlineDark"
            size="md"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            disabled={!publish.canPublish || publishState.busy}
            onClick={() => handlePublish('private')}
          >
            Publish privately
          </Button>
          {!publish.canPublish && (
            <Button
              to={PATHS.CANDIDATE_PROFILE_BUILDER}
              variant="link"
              size="none"
              radius="none"
              className="self-center text-sm font-medium"
            >
              Finish your profile
              <Icon name="arrow-right" className="text-xs" />
            </Button>
          )}
        </div>
      </section>

      {privateFields.length > 0 && (
        <section
          aria-labelledby="private-heading"
          className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
        >
          <h2 id="private-heading" className="mb-3 text-lg font-bold text-brand-dark">
            Not shown to recruiters
          </h2>
          <ul className="space-y-3">
            {privateFields.map((field) => (
              <li key={field.field} className="flex items-start gap-3">
                <Icon name="shield-halved" className="mt-0.5 shrink-0 text-sm text-gray-400" />
                <span>
                  <span className="block text-sm font-medium text-brand-dark">{field.label}</span>
                  <span className="block text-sm text-gray-600">{field.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The recruiter rendering itself — PRD §8.8 blocks, in order. */}
      <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Recruiter view
        </p>

        <header className="border-b border-gray-100 pb-6">
          <div className="flex items-start gap-4">
            {/* PRD §8.8 — the header leads with the photo. */}
            <Avatar
              src={header.photoUrl}
              initials={(header.name ?? '?').slice(0, 2).toUpperCase()}
              size="md"
              shape="rounded"
              tone="brand"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-brand-dark">
                  {header.name ?? 'Your name'}
                </h2>
                <Badge tone="neutral" size="sm" radius="full">
                  {header.status}
                </Badge>
              </div>
              <p className="mt-1 text-gray-600">{header.headline ?? 'No headline yet'}</p>

              {locationLine(header.location) && (
                <p className="mt-1 text-sm text-gray-500">{locationLine(header.location)}</p>
              )}

              {header.languages?.length > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  Teaches in {labelled(header.languages, LANGUAGE_LABELS).join(', ')}
                </p>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Roles</dt>
              <dd className="text-brand-dark">
                {labelled(header.targetRoles, CANDIDATE_ROLE_LABELS).join(', ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Availability</dt>
              <dd className="text-brand-dark">
                {AVAILABILITY_LABELS[header.availability] ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Experience</dt>
              <dd className="text-brand-dark">
                {header.yearsExperience != null ? `${header.yearsExperience} years` : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {labelled(header.employmentTypes, EMPLOYMENT_TYPE_LABELS).map((label) => (
              <Badge key={label} tone="neutral" size="sm" radius="full">
                {label}
              </Badge>
            ))}
            {labelled(header.deliveryModes, DELIVERY_MODE_LABELS).map((label) => (
              <Badge key={label} tone="neutral" size="sm" radius="full">
                {label}
              </Badge>
            ))}
          </div>
        </header>

        <section className="border-b border-gray-100 py-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Introduction
          </h3>
          <p className="text-sm leading-relaxed text-gray-700">
            {profile.introduction ?? 'No introduction yet.'}
          </p>
        </section>

        <section className="border-b border-gray-100 py-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Expertise
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              ...labelled(expertise.subjects, SUBJECT_LABELS),
              ...labelled(expertise.learnerSegments, LEARNER_SEGMENT_LABELS),
            ].map((label) => (
              <Badge key={label} tone="brand" size="sm" radius="full">
                {label}
              </Badge>
            ))}
            {expertise.subjects.length === 0 && expertise.learnerSegments.length === 0 && (
              <p className="text-sm text-gray-600">No expertise added yet.</p>
            )}
          </div>
        </section>

        <section className="py-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Evidence
          </h3>
          <p className="text-sm text-gray-600">
            No experience, credentials, or media yet — a recruiter sees this section empty.
            Evidence arrives with a later release.
          </p>
          <p className="sr-only">
            {evidence.experience.length} experience entries, {evidence.credentials.length}{' '}
            credentials, {evidence.media.length} media items.
          </p>
        </section>

        <section className="border-t border-gray-100 pt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Contact
          </h3>
          <p className="text-sm text-gray-700">
            {profile.contact?.email ?? 'Hidden — companies must reply through Evallo Recruit.'}
          </p>
        </section>
      </article>

      <div className="mt-8">
        <Button
          to={PATHS.CANDIDATE_VISIBILITY}
          variant="outlineDark"
          size="md"
          className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
        >
          Manage visibility
        </Button>
      </div>
    </Container>
  );
}
