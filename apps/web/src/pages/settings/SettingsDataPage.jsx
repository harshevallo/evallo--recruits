import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon, Modal } from '@/components/ui';
import { FormField, TextInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useAuth } from '@/context/AuthContext';
import { downloadAccountData, requestAccountDeletion } from '@/services';
import { PATHS } from '@/router/paths';

/**
 * SET-01 → Your data (PRD §16.1).
 *
 * Export and deletion. §16.1 requires both to be "designed in from the start" ALONGSIDE retention,
 * which is why deletion here marks the account rather than erasing rows synchronously: audit events
 * and moderation records exist so abuse can be investigated after the fact, and an immediate purge
 * would destroy the trail the same section mandates. The modal says that plainly instead of promising
 * an erasure the platform would not perform.
 */
export function SettingsDataPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  async function exportData() {
    setBusy(true);
    setFeedback(null);
    try {
      await downloadAccountData();
      setFeedback({ tone: 'success', text: 'Your data has been downloaded.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error.message ?? 'We could not prepare your export.' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setErrors({});
    try {
      await requestAccountDeletion(password || undefined);
      /*
       * The server has already revoked every session, so the local one is dead. Clearing it here
       * keeps the client from showing a signed-in shell over an account that no longer has access.
       */
      await logout().catch(() => {});
      navigate(PATHS.HOME, { replace: true });
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not process that.' });
      }
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Your data</h1>
        <p className="mt-2 text-gray-600">Take a copy of your data, or close your account.</p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">Download my data</h2>
        <p className="mt-1 text-sm text-gray-600">
          A JSON file with your account details, notification preferences, candidate profile and
          company memberships.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Your own data only. Other people&apos;s profiles, and internal notes your colleagues wrote,
          are not yours to export.
        </p>

        <div className="mt-5 border-t border-gray-100 pt-5">
          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            disabled={busy}
            onClick={exportData}
          >
            {busy ? 'Preparing…' : 'Download my data'}
          </Button>
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">How your data is processed</h2>
        <p className="mt-1 text-sm text-gray-600">
          Candidate data is private by default. A company sees your profile only when you publish it
          as discoverable or share it by expressing interest, and every access is logged.
        </p>
        <Link
          to={PATHS.PRIVACY}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
        >
          Read the privacy policy <Icon name="arrow-right" className="text-xs" />
        </Link>
      </section>

      {/* Danger zone — separated from everything above by a divider and its own heading. */}
      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-center text-xs font-bold uppercase tracking-wider text-gray-400">
          Danger zone
        </h2>

        <section className="mt-4 rounded-2xl border border-red-200 bg-red-50/40 p-6">
          <h3 className="text-base font-bold text-brand-dark">Delete account</h3>
          <p className="mt-1 text-sm text-gray-700">
            Closes your account immediately. We email you a restore link in case you change your
            mind; once the grace period passes, your profile and professional content are deleted
            permanently. Some records are retained where required for platform integrity or legal
            obligations.
          </p>
          <p className="mt-3 text-xs text-gray-600">
            If you own a company, hand ownership to another member first — a company cannot be left
            without an owner.
          </p>

          <Button
            type="button"
            variant="primary"
            size="md"
            radius="lg"
            className="mt-5 !bg-red-600 hover:!bg-red-700"
            disabled={busy}
            onClick={() => {
              setPassword('');
              setErrors({});
              setConfirming(true);
            }}
          >
            Delete account
          </Button>
        </section>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        description="Your account closes immediately and you will be signed out. We email you a link that restores it during the grace period; after that, your profile and professional content are deleted permanently. Some records are retained where required for platform integrity or legal obligations."
      >
        <FormField
          label="Confirm your password"
          name="delete-password"
          error={errors.password}
          hint="Required so a lost or stolen session cannot delete your account."
          className="mb-4"
        >
          {({ hasError: _hasError, ...control }) => (
            <TextInput
              {...control}
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
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
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            radius="lg"
            className="!bg-red-600 hover:!bg-red-700"
            disabled={busy}
            onClick={deleteAccount}
          >
            {busy ? 'Working…' : 'Delete account'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
