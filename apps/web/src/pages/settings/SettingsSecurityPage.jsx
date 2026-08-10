import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { Skeleton } from '@/components/feedback/Skeleton';
import {
  changePassword,
  fetchSessions,
  signOutOtherSessions,
  fetchSignInMethods,
} from '@/services';
import { PATHS } from '@/router/paths';

/**
 * SET-01 → Security (PRD §6.3, §16.4).
 *
 * Three things, each with a real endpoint: change the password, see where the account is signed in,
 * and see which sign-in methods are connected.
 *
 * Adding or removing a sign-in method is READ-ONLY here on purpose. Connecting Google is an OAuth
 * round trip and disconnecting it could leave an account with no way in at all; PRD §6.3 treats both
 * as auth flows, so this screen reports state and points at the flow rather than faking a toggle.
 */

/** A crude but honest strength read. Deliberately not a score — it names what is missing. */
function strengthOf(password) {
  if (!password) return null;
  const checks = [
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const met = checks.filter(Boolean).length;

  if (password.length < 8) return { label: 'Too short', tone: 'text-red-600', width: '20%' };
  if (met <= 1) return { label: 'Weak', tone: 'text-red-600', width: '33%' };
  if (met === 2) return { label: 'Fair', tone: 'text-amber-600', width: '55%' };
  if (met === 3) return { label: 'Good', tone: 'text-emerald-600', width: '78%' };
  return { label: 'Strong', tone: 'text-emerald-600', width: '100%' };
}

/** `Mozilla/5.0 (Windows NT 10.0…) Chrome/…` → something a person can recognise. */
function describeDevice(userAgent) {
  if (!userAgent) return 'Unknown device';
  const os = /Windows/i.test(userAgent)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(userAgent)
      ? 'macOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/i.test(userAgent)
          ? 'iOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';

  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Chrome'
      : /Safari\//i.test(userAgent)
        ? 'Safari'
        : /Firefox\//i.test(userAgent)
          ? 'Firefox'
          : 'Unknown browser';

  return `${browser} on ${os}`;
}

export function SettingsSecurityPage() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [sessions, setSessions] = useState({ status: 'loading', sessions: [] });
  const [methods, setMethods] = useState({ status: 'loading', methods: [] });

  const load = useCallback(async (signal) => {
    const [s, m] = await Promise.allSettled([
      fetchSessions({ signal }),
      fetchSignInMethods({ signal }),
    ]);
    if (s.status === 'fulfilled') setSessions({ status: 'ready', sessions: s.value.sessions });
    else setSessions({ status: 'error', sessions: [] });
    if (m.status === 'fulfilled') setMethods({ status: 'ready', methods: m.value.methods });
    else setMethods({ status: 'error', methods: [] });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function submitPassword(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFeedback(null);

    try {
      await changePassword(form);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setFeedback({
        tone: 'success',
        text: 'Password changed. Every other device has been signed out.',
      });
      await load();
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not change it.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOutOthers() {
    setBusy(true);
    try {
      await signOutOtherSessions();
      setFeedback({ tone: 'success', text: 'Signed out of other sessions.' });
      await load();
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not do that.' });
    } finally {
      setBusy(false);
    }
  }

  const strength = strengthOf(form.newPassword);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Security</h1>
        <p className="mt-2 text-gray-600">Your password, how you sign in, and where.</p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      {/* Change password */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">Change password</h2>
        <p className="mt-1 text-sm text-gray-600">
          Changing it signs you out everywhere else, which is usually the point.
        </p>

        <form noValidate onSubmit={submitPassword} className="mt-5">
          <FormField
            label="Current password"
            name="currentPassword"
            error={errors.currentPassword}
            required
            className="mb-4"
          >
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                disabled={busy}
                onChange={(e) => setForm((c) => ({ ...c, currentPassword: e.target.value }))}
              />
            )}
          </FormField>

          <FormField
            label="New password"
            name="newPassword"
            error={errors.newPassword}
            hint="At least 8 characters. Longer is better than complicated."
            required
            className="mb-2"
          >
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                disabled={busy}
                onChange={(e) => setForm((c) => ({ ...c, newPassword: e.target.value }))}
              />
            )}
          </FormField>

          {strength && (
            <div className="mb-4" aria-live="polite">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    strength.label === 'Strong' || strength.label === 'Good'
                      ? 'bg-emerald-500'
                      : strength.label === 'Fair'
                        ? 'bg-amber-400'
                        : 'bg-red-500'
                  }`}
                  style={{ width: strength.width }}
                />
              </div>
              <p className={`mt-1 text-xs font-semibold ${strength.tone}`}>{strength.label}</p>
            </div>
          )}

          <FormField
            label="Confirm new password"
            name="confirmPassword"
            error={errors.confirmPassword}
            required
            className="mb-5"
          >
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                disabled={busy}
                onChange={(e) => setForm((c) => ({ ...c, confirmPassword: e.target.value }))}
              />
            )}
          </FormField>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
            <a
              href={PATHS.FORGOT_PASSWORD}
              className="text-sm font-semibold text-brand-blue hover:underline"
            >
              Forgot your password?
            </a>
            <Button type="submit" variant="primary" size="md" radius="lg" disabled={busy}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </section>

      {/* Sign-in methods */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">Sign-in methods</h2>
        <p className="mt-1 text-sm text-gray-600">
          How this account can be accessed. Adding or removing a method is done from the sign-in
          screen, so you can never remove your only way in.
        </p>

        {methods.status === 'loading' && <Skeleton className="mt-5 h-20 w-full rounded-xl" />}

        {methods.status === 'ready' && (
          <ul className="mt-5 space-y-3">
            {methods.methods.map((method) => (
              <li
                key={method.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-slate-50/60 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-dark">{method.label}</p>
                  {method.detail && (
                    <p className="truncate text-xs text-gray-500">{method.detail}</p>
                  )}
                </div>
                <Badge tone={method.connected ? 'successLight' : 'neutral'} size="sm" radius="full">
                  {method.connected ? 'Connected' : 'Not connected'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sessions */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-brand-dark">Active sessions</h2>
            <p className="mt-1 text-sm text-gray-600">
              Devices currently signed in to this account.
            </p>
          </div>
          {sessions.status === 'ready' && sessions.sessions.length > 1 && (
            <Button
              type="button"
              variant="outlineDark"
              size="sm"
              radius="lg"
              className="!border-gray-300 !text-brand-dark hover:!bg-gray-50"
              disabled={busy}
              onClick={signOutOthers}
            >
              Sign out other sessions
            </Button>
          )}
        </div>

        {sessions.status === 'loading' && <Skeleton className="mt-5 h-24 w-full rounded-xl" />}

        {sessions.status === 'error' && (
          <StatusRegion tone="error" className="mt-5">
            We could not load your sessions.
          </StatusRegion>
        )}

        {sessions.status === 'ready' && (
          <ul className="mt-5 space-y-3">
            {sessions.sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-slate-50/60 p-4"
              >
                <Icon name="shield-halved" className="flex-none text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brand-dark">
                    {describeDevice(session.userAgent)}
                    {session.current && (
                      <span className="ml-2 text-xs font-normal text-gray-500">(this device)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {session.ip ? `${session.ip} · ` : ''}
                    signed in{' '}
                    {new Date(session.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
