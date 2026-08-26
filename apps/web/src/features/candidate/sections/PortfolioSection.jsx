import { useRef, useState } from 'react';
import { isSupportedVideoUrl } from '@evallo/shared';
import { VideoLightbox } from '@/features/media/VideoLightbox';
import { Badge, Button, Icon, Modal } from '@/components/ui';
import { FormField, TextInput, Textarea, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { createProfileEntry, updateProfileEntry, deleteProfileEntry } from '@/services';

/**
 * CAN-02 section 6 — portfolio and media (PRD §8.3 section 9, ADR-008).
 *
 * Videos are EMBEDS, not uploads: a link needs no storage, no virus scanning and no CDN, which is
 * what makes this section buildable now. The server derives `provider` from an allow-list on
 * write (PRD §16.3), so this screen may show a thumbnail but never decides what is allowed.
 */

/** Prompts a clip can answer. Free text on the server; these are the ones worth suggesting. */
const PROMPTS = [
  'Personal introduction',
  'Concept explanation',
  'Mock lesson',
  'Student feedback',
];

/**
 * A YouTube video id, or null.
 *
 * Used only to build a thumbnail URL. Anything unrecognised falls back to the plain card, so a
 * Vimeo link — which needs a server call to resolve a thumbnail — is not broken, just plainer.
 */
function youTubeId(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1) || null;
    if (parsed.hostname.endsWith('youtube.com')) {
      return parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop() ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function thumbnailFor(url) {
  const id = youTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

/**
 * The dark 16:9 tile, with a real thumbnail behind it when we can name one.
 *
 * Pressing it opens the shared player over this screen. It used to be an `<a target="_blank">`
 * that sent the candidate to youtube.com — out of the builder, mid-edit, to check their own clip.
 * `VideoLightbox` carries the provider allow-list and the "Watch on YouTube" escape hatch, so
 * nothing is lost by staying here.
 *
 * A link the allow-list cannot resolve keeps the old behaviour rather than becoming a dead button.
 */
function VideoThumbnail({ entry }) {
  const thumbnail = thumbnailFor(entry.url);
  const [playing, setPlaying] = useState(false);
  const playable = isSupportedVideoUrl(entry.url);

  const Tag = playable ? 'button' : 'a';
  const tagProps = playable
    ? { type: 'button', onClick: () => setPlaying(true), 'aria-label': `Play "${entry.title}"` }
    : {
        href: entry.url,
        target: '_blank',
        rel: 'noreferrer noopener',
        'aria-label': `Open "${entry.title}" in a new tab`,
      };

  /*
   * The player is a SIBLING of the tile, never a child.
   *
   * `Modal` portals to document.body, but a React portal still bubbles events up the REACT tree,
   * not the DOM tree. Nested inside the tile, every click within the dialog — including Close —
   * reached the tile's own `onClick` and re-opened it, so the dialog could not be dismissed.
   */
  return (
    <>
    <Tag
      {...tagProps}
      className="relative block aspect-video w-full flex-shrink-0 overflow-hidden rounded-xl bg-gray-900 sm:w-48"
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/30 text-white backdrop-blur-sm">
          <Icon name="play" />
        </span>
      </span>
      {entry.provider && (
        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {entry.provider}
        </span>
      )}
    </Tag>

    {playable && (
      <VideoLightbox
        open={playing}
        onClose={() => setPlaying(false)}
        url={entry.url}
        title={entry.title}
        subtitle={entry.prompt ?? undefined}
      />
    )}
    </>
  );
}

export function PortfolioSection({ entries = [], onChanged }) {
  const [draft, setDraft] = useState({ url: '', title: '', prompt: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  /*
   * The in-flight latch is a REF, not the `busy` state.
   *
   * `busy` drives the disabled attribute, which is a render concern and therefore always one tick
   * behind. Two clicks dispatched in the same tick both read `busy === false` from the same
   * closure and both fire — which is exactly how a double-click on "Add video" produced TWO
   * entries and two POSTs. A ref updates synchronously, so the second call sees the first.
   *
   * Same pattern `ProfileBuilderPage` already uses for section saves; this section predated it.
   */
  const inFlight = useRef(false);

  // Preview is local: the URL is resolved to a thumbnail without asking the server first.
  const previewThumbnail = thumbnailFor(draft.url);

  /*
   * Can this draft be submitted at all?
   *
   * `isSupportedVideoUrl` is the SAME check the server applies — it is imported from
   * `@evallo/shared`, not re-implemented here, so the button can never be enabled for a link the
   * API would refuse or disabled for one it would take (ADR-009). Empty and malformed both fail
   * it, which covers the two disabled cases without a second rule.
   *
   * `busy` is in the guard as well as inside `add()`: the handler already refuses a second call
   * while one is open, and this stops the click from being possible in the first place.
   */
  const canAdd = !busy && isSupportedVideoUrl(draft.url);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function add(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    try {
      await createProfileEntry('media', draft);
      setDraft({ url: '', title: '', prompt: '', description: '' });
      setFeedback({ tone: 'success', text: 'Video added.' });
      await onChanged();
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not add that video.' });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    try {
      await updateProfileEntry('media', editing.id, {
        title: editing.title ?? '',
        url: editing.url ?? '',
        prompt: editing.prompt ?? '',
        description: editing.description ?? '',
      });
      setEditing(null);
      setFeedback({ tone: 'success', text: 'Video updated.' });
      await onChanged();
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function remove(entry) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await deleteProfileEntry('media', entry.id);
      setFeedback({ tone: 'success', text: 'Video removed.' });
      await onChanged();
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not remove that.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-5">
          {feedback.text}
        </StatusRegion>
      )}

      <h3 className="mb-4 text-lg font-bold text-brand-dark">Teaching videos</h3>

      {entries.length === 0 ? (
        <div className="mb-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-sm font-semibold text-brand-dark">No teaching videos yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-xs text-gray-500">
            A short clip of you teaching tells a recruiter more than any paragraph. Paste a YouTube
            or Vimeo link below to add your first one.
          </p>
        </div>
      ) : (
        <ul className="mb-6 space-y-4">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group relative flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-blue/40 sm:flex-row"
            >
              <VideoThumbnail entry={entry} />

              <div className="min-w-0 flex-1 py-0.5 pr-16">
                <h4 className="mb-1 text-base font-bold text-brand-dark">{entry.title}</h4>
                {entry.description && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-gray-600">
                    {entry.description}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {entry.prompt && (
                    <Badge tone="neutral" size="sm" radius="md">
                      Prompt: {entry.prompt}
                    </Badge>
                  )}
                  <Badge tone="successLight" size="sm" radius="md">
                    {entry.visibility === 'private' ? 'Private' : 'Visible to companies'}
                  </Badge>
                </div>
              </div>

              <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  aria-label={`Edit ${entry.title}`}
                  onClick={() => {
                    setErrors({});
                    setEditing(entry);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-brand-blue"
                >
                  <Icon name="pen" className="text-xs" />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${entry.title}`}
                  onClick={() => setConfirmDelete(entry)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-slate-50 text-gray-600 transition-colors hover:text-red-500"
                >
                  <Icon name="trash" className="text-xs" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Embed panel — the section's primary action, always available. */}
      <form
        noValidate
        onSubmit={add}
        className="space-y-4 rounded-2xl border-2 border-dashed border-brand-blue/30 bg-blue-50/20 p-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-blue-100 text-brand-blue">
            <Icon name="link" className="text-sm" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-brand-dark">Embed a new teaching video</h4>
            <p className="text-xs text-gray-500">Paste a YouTube or Vimeo link.</p>
          </div>
        </div>

        {/*
          NO required marker, deliberately.

          Nothing here is required of the candidate: the media section is `optional: true` and
          never contributes to `publishBlockers`, so a profile publishes perfectly well with no
          video at all (PRD §8.5 — "no evidence item is required to publish"). The star said the
          opposite, and it was the only starred field in an entirely optional block.

          A link IS required to create an ENTRY, and that requirement is now carried by the submit
          button, which stays disabled until the link would be accepted — stated at the moment it
          applies rather than as a permanent mark on an optional section.
        */}
        <FormField label="Video link" name="media-url" error={errors.url}>
          {({ hasError: _hasError, ...control }) => (
            <div className="flex gap-2">
              <TextInput
                {...control}
                type="url"
                className="flex-1"
                placeholder="https://youtube.com/watch?v=…"
                value={draft.url}
                disabled={busy}
                onChange={(event) => setField('url', event.target.value)}
              />
            </div>
          )}
        </FormField>

        {previewThumbnail && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
            <img
              src={previewThumbnail}
              alt=""
              className="h-14 w-24 flex-none rounded-lg object-cover"
            />
            <p className="text-xs font-medium text-gray-600">
              Preview of the link you pasted. Give it a title and add it below.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <FormField
            label="Video title"
            name="media-title"
            error={errors.title}
            required
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <TextInput
                {...control}
                type="text"
                placeholder="e.g. Concept explanation: polynomials"
                value={draft.title}
                disabled={busy}
                onChange={(event) => setField('title', event.target.value)}
              />
            )}
          </FormField>

          <FormField
            label="Prompt answered"
            name="media-prompt"
            error={errors.prompt}
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <SelectInput
                {...control}
                options={[
                  { value: '', label: 'Select…' },
                  ...PROMPTS.map((prompt) => ({ value: prompt, label: prompt })),
                ]}
                value={draft.prompt}
                disabled={busy}
                onChange={(event) => setField('prompt', event.target.value)}
              />
            )}
          </FormField>
        </div>

        <FormField label="What is in the clip?" name="media-description" error={errors.description}>
          {({ hasError: _hasError, ...control }) => (
            <Textarea
              {...control}
              rows={3}
              value={draft.description}
              disabled={busy}
              onChange={(event) => setField('description', event.target.value)}
            />
          )}
        </FormField>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" radius="lg" disabled={!canAdd}>
            {busy ? 'Adding…' : 'Add video'}
          </Button>
        </div>
      </form>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit video"
        description="Changes save as a draft. Nothing is visible until you publish."
      >
        <form noValidate onSubmit={saveEdit}>
          <FormField label="Video title" name="edit-title" error={errors.title} required className="mb-4">
            {({ hasError: _hasError, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={editing?.title ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, title: event.target.value }))
                }
              />
            )}
          </FormField>

          <FormField label="Video link" name="edit-url" error={errors.url} required className="mb-4">
            {({ hasError: _hasError, ...control }) => (
              <TextInput
                {...control}
                type="url"
                value={editing?.url ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, url: event.target.value }))
                }
              />
            )}
          </FormField>

          <FormField label="Prompt answered" name="edit-prompt" error={errors.prompt} className="mb-4">
            {({ hasError: _hasError, ...control }) => (
              <SelectInput
                {...control}
                options={[
                  { value: '', label: 'Select…' },
                  ...PROMPTS.map((prompt) => ({ value: prompt, label: prompt })),
                ]}
                value={editing?.prompt ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, prompt: event.target.value }))
                }
              />
            )}
          </FormField>

          <FormField
            label="What is in the clip?"
            name="edit-description"
            error={errors.description}
            className="mb-4"
          >
            {({ hasError: _hasError, ...control }) => (
              <Textarea
                {...control}
                rows={3}
                value={editing?.description ?? ''}
                disabled={busy}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, description: event.target.value }))
                }
              />
            )}
          </FormField>

          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" radius="lg" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Remove this video?"
        description="This deletes the entry from your profile. It cannot be undone."
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outlineDark"
            size="sm"
            radius="lg"
            className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
            onClick={() => setConfirmDelete(null)}
          >
            Keep it
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            disabled={busy}
            onClick={() => remove(confirmDelete)}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
