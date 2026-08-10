import { useEffect, useState } from 'react';
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS, TIMEZONE_OPTIONS } from '@evallo/shared';
import { Avatar, Badge, Button } from '@/components/ui';
import { FormField, TextInput, SelectInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useAuth } from '@/context/AuthContext';
import { updateCurrentUser } from '@/services';

/**
 * SET-01 → Account. Account IDENTITY, not professional profile content.
 *
 * The distinction matters and is stated on the page: a headline here is the one-line description of
 * the person, whereas the candidate profile's headline is a recruiter-facing claim maintained in
 * CAN-02. They are stored in different places (`users` vs `candidateProfiles`) and this screen only
 * ever writes the former.
 */
export function SettingsAccountPage() {
  const { user, capabilities, refresh } = useAuth();

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  /* Seed from the account once it is loaded, then leave the form alone — it is the draft. */
  useEffect(() => {
    if (!user || form) return;
    setForm({
      name: user.name ?? '',
      phone: user.phone ?? '',
      headline: user.headline ?? '',
      country: user.location?.country ?? '',
      region: user.location?.region ?? '',
      city: user.location?.city ?? '',
      timezone: user.location?.timezone ?? '',
      languages: user.languages ?? [],
    });
  }, [user, form]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFeedback(null);

    try {
      await updateCurrentUser({
        name: form.name.trim(),
        phone: form.phone.trim(),
        headline: form.headline.trim(),
        location: {
          country: form.country,
          region: form.region.trim(),
          city: form.city.trim(),
          timezone: form.timezone,
        },
        languages: form.languages,
      });
      await refresh();
      setFeedback({ tone: 'success', text: 'Saved.' });
    } catch (error) {
      setErrors(error.details ?? {});
      if (!error.details) {
        setFeedback({ tone: 'error', text: error.message ?? 'We could not save that.' });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!form) return null;

  /** What this account can do — PRD §5.2. Derived, never stored as a "role" on the user (ADR-001). */
  const types = [
    capabilities?.hasCandidateProfile ? 'Candidate' : null,
    (capabilities?.companies?.length ?? 0) > 0 ? 'Company member' : null,
  ].filter(Boolean);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-brand-dark">Account</h1>
        <p className="mt-2 text-gray-600">
          Who you are on Evallo Recruit. Your professional profile is separate — edit that in the
          profile builder.
        </p>
      </header>

      {feedback && (
        <StatusRegion tone={feedback.tone} className="mb-6">
          {feedback.text}
        </StatusRegion>
      )}

      <form
        noValidate
        onSubmit={submit}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        {/* Photo comes from the identity provider; there is no upload pipeline yet, and the copy
            says so rather than offering a button that cannot work. */}
        <div className="mb-6 flex items-center gap-4">
          <Avatar
            src={user?.profilePicture ?? undefined}
            initials={(user?.name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
            size="lg"
            alt=""
          />
          <div>
            <p className="text-sm font-semibold text-gray-700">Profile photo</p>
            <p className="text-xs text-gray-500">
              Taken from the account you sign in with. Uploads are not available yet.
            </p>
          </div>
        </div>

        <hr className="mb-6 border-gray-100" />

        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          <FormField label="Full name" name="name" error={errors.name} className="mb-5">
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={form.name}
                disabled={busy}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </FormField>

          {/* Email is read-only here: changing it re-runs verification, which is an auth flow. */}
          <FormField
            label="Email address"
            name="email"
            hint="Change your email from the sign-in screen — it needs re-verification."
            className="mb-5"
          >
            {({ hasError: _h, ...control }) => (
              <TextInput {...control} type="email" value={user?.email ?? ''} disabled readOnly />
            )}
          </FormField>

          <FormField
            label="Phone number"
            name="phone"
            error={errors.phone}
            hint="Optional. Never shown to a company unless your contact rules allow it."
            className="mb-5"
          >
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="tel"
                value={form.phone}
                disabled={busy}
                onChange={(e) => set('phone', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="One-line description" name="headline" error={errors.headline} className="mb-5">
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={form.headline}
                disabled={busy}
                onChange={(e) => set('headline', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="Country" name="country" error={errors.location} className="mb-5">
            {({ hasError: _h, ...control }) => (
              <SelectInput
                {...control}
                options={[{ value: '', label: 'Select…' }, ...COUNTRY_OPTIONS]}
                value={form.country}
                disabled={busy}
                onChange={(e) => set('country', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="State or region" name="region" className="mb-5">
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={form.region}
                disabled={busy}
                onChange={(e) => set('region', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="City" name="city" className="mb-5">
            {({ hasError: _h, ...control }) => (
              <TextInput
                {...control}
                type="text"
                value={form.city}
                disabled={busy}
                onChange={(e) => set('city', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="Time zone" name="timezone" className="mb-5">
            {({ hasError: _h, ...control }) => (
              <SelectInput
                {...control}
                options={[{ value: '', label: 'Select…' }, ...TIMEZONE_OPTIONS]}
                value={form.timezone}
                disabled={busy}
                onChange={(e) => set('timezone', e.target.value)}
              />
            )}
          </FormField>
        </div>

        <fieldset className="mb-5">
          <legend className="mb-1.5 block text-sm font-semibold text-gray-700">Languages</legend>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((option) => {
              const selected = form.languages.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                      : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-blue"
                    checked={selected}
                    disabled={busy}
                    onChange={() =>
                      set(
                        'languages',
                        selected
                          ? form.languages.filter((value) => value !== option.value)
                          : [...form.languages, option.value],
                      )
                    }
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mb-6">
          <p className="mb-1.5 text-sm font-semibold text-gray-700">Account type</p>
          <div className="flex flex-wrap gap-2">
            {types.length > 0 ? (
              types.map((type) => (
                <Badge key={type} tone="neutral" size="sm" radius="full">
                  {type}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-gray-500">
                No capabilities yet. Build a candidate profile or create a company.
              </p>
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            One account can be both. This is derived from what you have, not a role you are assigned.
          </p>
        </div>

        <div className="flex justify-end border-t border-gray-100 pt-5">
          <Button type="submit" variant="primary" size="md" radius="lg" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
