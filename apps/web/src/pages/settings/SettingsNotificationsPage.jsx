import { useEffect, useState } from 'react';
import { Button, Icon } from '@/components/ui';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import { fetchNotificationPreferences, updateNotificationPreferences } from '@/services';

/**
 * SET-01 → Notifications (PRD §15).
 *
 * A per-event, per-channel matrix rather than one master switch, because §15 distinguishes the two
 * channels and because "turn off email but keep in-app" is the setting people actually want.
 *
 * Security notices are shown but locked: §15 states they cannot be fully disabled. Rendering them as
 * a disabled row is more honest than hiding them — the person can see the notice exists and that the
 * platform will always send it.
 *
 * Nothing here claims delivery that does not exist yet: the preferences are stored and read by the
 * API, and the notifications module that will consume them is M6. The page says so.
 */
export function SettingsNotificationsPage() {
  const [state, setState] = useState({ status: 'loading', events: [] });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchNotificationPreferences({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', events: data.events }))
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'CanceledError') return;
        setState({ status: 'error', events: [], message: error.message });
      });
    return () => controller.abort();
  }, []);

  function toggle(key, channel) {
    setDirty(true);
    setState((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.key === key && !event.locked ? { ...event, [channel]: !event[channel] } : event,
      ),
    }));
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      // Locked events are never sent — the server refuses them, and there is nothing to change.
      const preferences = Object.fromEntries(
        state.events
          .filter((event) => !event.locked)
          .map((event) => [event.key, { email: event.email, inApp: event.inApp }]),
      );
      const data = await updateNotificationPreferences(preferences);
      setState({ status: 'ready', events: data.events });
      setDirty(false);
      setFeedback({ tone: 'success', text: 'Saved.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading your notification settings…</span>
        <Skeleton className="h-10 w-56 rounded-lg" />
        <Skeleton className="mt-8 h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <StatusRegion tone="error">{state.message ?? 'We could not load this.'}</StatusRegion>;
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Notifications</h1>
        <p className="mt-2 text-gray-600">
          Choose what reaches you, and how. Conversations always stay inside Evallo Recruit — email is
          only ever a nudge to come back.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {/*
        `overflow-x-auto`, not `overflow-hidden`. Measured at 320px the table is 4px wider than this
        container: the two fixed `w-24` channel columns plus the label column's padding stop
        shrinking before the viewport does. Clipping hid that edge with no way to reach it; scrolling
        keeps it reachable. Rounded corners still clip, and nothing changes at 375px and above, where
        the table already fits.
      */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* A real table: this is tabular data, and a screen reader should read it as one. */}
        <table className="w-full">
          <caption className="sr-only">Notification preferences by channel</caption>
          <thead>
            <tr className="border-b border-gray-100 bg-slate-50/60">
              <th scope="col" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                Notification
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th scope="col" className="w-24 px-3 py-3 text-center text-xs font-bold uppercase tracking-wider text-gray-500">
                In-app
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state.events.map((event) => (
              <tr key={event.key}>
                <th scope="row" className="px-5 py-4 text-left font-normal">
                  <span className="flex items-center gap-2 text-sm font-semibold text-brand-dark">
                    {event.label}
                    {event.locked && (
                      <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        <Icon name="lock" className="text-[9px]" /> Always on
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500">{event.description}</span>
                </th>

                {['email', 'inApp'].map((channel) => (
                  <td key={channel} className="px-3 py-4 text-center">
                    <label className="inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-blue disabled:cursor-not-allowed"
                        checked={event[channel]}
                        disabled={event.locked || busy}
                        onChange={() => toggle(event.key, channel)}
                      />
                      <span className="sr-only">
                        {channel === 'email' ? 'Email' : 'In-app'} for {event.label}
                      </span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Delivery itself arrives with the notifications module. Your choices are stored now, so nothing
        is sent against them once it does.
      </p>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          variant="primary"
          size="md"
          radius="lg"
          disabled={busy || !dirty}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save preferences'}
        </Button>
      </div>
    </>
  );
}
