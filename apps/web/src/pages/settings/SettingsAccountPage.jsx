import { useEffect, useState, useRef, useMemo } from 'react';
import {
  COUNTRY_OPTIONS,
  ACCOUNT_LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
  CALLING_CODE_OPTIONS,
  callingCodeFor,
  composePhone,
  splitStoredPhone,
} from '@evallo/shared';
import { Avatar, Badge, Button } from '@/components/ui';
import { FormField, TextInput, SelectInput, ComboboxInput } from '@/components/form';
import { StatusRegion } from '@/components/feedback/StatusRegion';
import { useAuth } from '@/context/AuthContext';
import { updateCurrentUser } from '@/services';
import { rankOptions, SEARCH_THRESHOLD } from '@/utils/optionSearch';

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

  /*
   * The in-flight latch is a REF, not the `busy` state.
   *
   * `busy` drives the disabled attribute, which is a render concern and therefore always one tick
   * behind: two clicks dispatched in the same tick both read `busy === false` from the same
   * closure and both fire. Verified — a double-click on Save sent TWO `PATCH /api/me` requests. A
   * ref updates synchronously, so the second call sees the first.
   */
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState(null);

  /* Seed from the account once it is loaded, then leave the form alone — it is the draft. */
  useEffect(() => {
    if (!user || form) return;
    /*
     * The stored `phone` is one string; the form edits it as two fields.
     *
     * `phoneCountry` is authoritative when present — it is the only thing that can distinguish the
     * twenty-six countries sharing `+1`. Only when it is absent (a legacy or seeded row) does
     * `splitStoredPhone` try to infer it, and it declines to guess on any shared code, leaving the
     * number rendered exactly as stored.
     */
    const inferred = splitStoredPhone(user.phone);
    const phoneCountry = user.phoneCountry ?? inferred.iso ?? '';
    const storedCode = callingCodeFor(phoneCountry);
    const national =
      storedCode && (user.phone ?? '').trim().startsWith(storedCode)
        ? (user.phone ?? '').trim().slice(storedCode.length).trim()
        : inferred.national;

    setForm({
      name: user.name ?? '',
      phoneCountry,
      phone: national,
      headline: user.headline ?? '',
      country: user.location?.country ?? '',
      region: user.location?.region ?? '',
      city: user.location?.city ?? '',
      timezone: user.location?.timezone ?? '',
      /*
       * ACCOUNT languages — "languages you speak" — not `user.languages`, which is the TEACHING
       * field the profile builder owns and the recruiter search facets on. Both used to be edited
       * here through one array; they are now separate fields with separate vocabularies.
       */
      accountLanguages: user.accountLanguages ?? [],
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
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setFeedback(null);

    try {
      await updateCurrentUser({
        name: form.name.trim(),
        /*
         * `phone` keeps its existing shape — the whole number, dial code included — so the export,
         * the deletion purge and every reader downstream are unaffected. `phoneCountry` rides
         * alongside purely so the picker can be restored exactly on the next load.
         */
        phone: composePhone(form.phoneCountry, form.phone),
        phoneCountry: form.phoneCountry,
        headline: form.headline.trim(),
        location: {
          country: form.country,
          region: form.region.trim(),
          city: form.city.trim(),
          timezone: form.timezone,
        },
        accountLanguages: form.accountLanguages,
      });
      await refresh();
      setFeedback({ tone: 'success', text: 'Saved.' });
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

          {/*
            Two controls, one datum.

            Stacked below `sm` and side by side above it: at 375px a dialling picker and a number
            input cannot share a row without one of them becoming too narrow to read. The grid gives
            the picker a fixed comfortable column on desktop and the number the remaining space,
            which is the shape the number actually wants — it is the longer of the two.
          */}
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-[13rem_1fr]">
            <FormField
              label="Country code"
              name="phoneCountry"
              error={errors.phoneCountry}
              className="mb-0"
            >
              {({ hasError: _h, ...control }) => (
                <ComboboxInput
                  {...control}
                  options={CALLING_CODE_OPTIONS}
                  listboxLabel="Dialling country"
                  placeholder="Select…"
                  searchPlaceholder="Search countries…"
                  emptyMessage="No countries match that search."
                  value={form.phoneCountry}
                  disabled={busy}
                  onChange={(next) => set('phoneCountry', next)}
                />
              )}
            </FormField>

            <FormField
              label="Phone number"
              name="phone"
              error={errors.phone}
              hint="Optional. Never shown to a company unless your contact rules allow it."
              className="mb-0"
            >
              {({ hasError: _h, ...control }) => (
                <TextInput
                  {...control}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder={
                    callingCodeFor(form.phoneCountry) ? '9876543210' : 'Include your country code'
                  }
                  value={form.phone}
                  disabled={busy}
                  onChange={(e) => set('phone', e.target.value)}
                />
              )}
            </FormField>
          </div>

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

          {/* Same field, same vocabulary as the builder's — so the same searchable control. */}
          <FormField label="Country" name="country" error={errors.location} className="mb-5">
            {({ hasError: _h, ...control }) => (
              <ComboboxInput
                {...control}
                options={COUNTRY_OPTIONS}
                listboxLabel="Country"
                searchPlaceholder="Search countries…"
                emptyMessage="No countries match that search."
                value={form.country}
                disabled={busy}
                onChange={(next) => set('country', next)}
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

        {/*
          "Languages you speak" — a searchable checkbox group.

          Native checkboxes rather than a custom multi-select widget: they bring keyboard support
          and correct screen-reader semantics for free, and `fieldset`/`legend` is what associates
          the group with its question (PRD §19). The filter appears only once the list is long
          enough to be worth scanning past, using the same threshold and the same ranked,
          accent-folded matcher as the country pickers.

          A SELECTED language stays visible even when the query excludes it — a filter that hides
          something you have already ticked is how you end up unable to untick it.
        */}
        <AccountLanguages
          selected={form.accountLanguages}
          disabled={busy}
          onToggle={(value) =>
            set(
              'accountLanguages',
              form.accountLanguages.includes(value)
                ? form.accountLanguages.filter((v) => v !== value)
                : [...form.accountLanguages, value],
            )
          }
        />

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

/**
 * The account-language picker.
 *
 * Its vocabulary is `ACCOUNT_LANGUAGE_OPTIONS` — curated global/national languages — and NOT the
 * teaching taxonomy. See `packages/shared/src/taxonomy/accountLanguages.js` for why the two are
 * separate datasets over separate fields.
 */
function AccountLanguages({ selected, disabled, onToggle }) {
  const [query, setQuery] = useState('');
  const searchable = ACCOUNT_LANGUAGE_OPTIONS.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return ACCOUNT_LANGUAGE_OPTIONS;

    const matched = rankOptions(ACCOUNT_LANGUAGE_OPTIONS, query);
    const shown = new Set(matched.map((option) => option.value));
    return [
      ...ACCOUNT_LANGUAGE_OPTIONS.filter((o) => selected.includes(o.value) && !shown.has(o.value)),
      ...matched,
    ];
  }, [query, searchable, selected]);

  return (
    <fieldset className="mb-5">
      <legend className="mb-1.5 block text-sm font-semibold text-gray-700">
        Languages you speak
      </legend>
      <p className="mb-2 text-xs text-gray-500">
        Separate from the languages you teach in, which you set in your profile.
      </p>

      {searchable && (
        <TextInput
          type="search"
          value={query}
          aria-label="Search languages"
          placeholder="Search languages\u2026"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-3 !py-2 !text-sm"
        />
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-gray-500">No languages match that search.</p>
      ) : (
        <div className="flex max-h-60 flex-wrap gap-2 overflow-y-auto pr-1">
          {visible.map((option) => {
            const isOn = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isOn
                    ? 'border-brand-blue bg-blue-50/40 font-semibold text-brand-dark'
                    : 'border-gray-200 bg-white font-medium text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-blue"
                  checked={isOn}
                  disabled={disabled}
                  onChange={() => onToggle(option.value)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
