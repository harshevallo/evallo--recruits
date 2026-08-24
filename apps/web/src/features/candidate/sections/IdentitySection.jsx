import { Avatar, Icon } from '@/components/ui';
import { SectionCard } from './SectionCard';

/**
 * CAN-02 section 1 — professional identity.
 *
 * The questions are still the bank's (ADR-007); this owns only their ARRANGEMENT: the photo
 * block, the paired name and location rows, and the headline's "recommended" flag. Rendering them
 * as one flat list would have been less code and a different screen.
 */
export function IdentitySection({ layout, user }) {
  const headline = layout.find('headline');

  return (
    <SectionCard>
      {/*
        Photo. There is no file-storage infrastructure in this API — see the credential model's
        note — so this shows the picture the account already has (Google supplies one) and says
        plainly that uploading is not available yet. A "Browse files" button that did nothing
        would be worse than an honest empty state.
      */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {user?.profilePicture ? (
          <Avatar
            src={user.profilePicture}
            alt=""
            size="lg"
            className="h-24 w-24 flex-shrink-0 shadow-sm"
          />
        ) : (
          <div className="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-slate-50 text-gray-400 shadow-sm">
            <Icon name="user" className="mb-1 text-xl" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Photo</span>
          </div>
        )}

        <div className="flex-1 pt-1">
          <p className="mb-1.5 text-sm font-semibold text-gray-700">Profile photo</p>
          <p className="text-xs text-gray-500">
            Profiles with a clear headshot get noticeably more recruiter attention.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Photo upload is not available yet — your picture comes from the account you signed in
            with.
          </p>
        </div>
      </div>

      <hr className="my-8 border-gray-100" />

      {/* Who you are, and where. Two to a row, as the reference pairs them. */}
      <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
        {layout.render('fullName')}
        {layout.render('pronouns')}
        {/*
          Country is the one select here long enough to be worth typing at: the list runs well
          past a screen, and a candidate already knows the answer before they open it. The
          options are still the bank's, so this is how the field is DRAWN, not what it accepts.
        */}
        {layout.render('country', { searchable: true, searchNoun: 'countries' })}
        {layout.render('region', { icon: 'location-dot' })}
        {layout.render('timezone')}
      </div>

      {/* Headline — flagged as the line a recruiter reads first. */}
      {headline && (
        <div className="mb-6">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-700">
              {headline.label}
              {headline.requiredForPublish && (
                <span className="text-red-600" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </span>
            <span className="text-xs font-semibold text-brand-blue">Recommended</span>
          </div>
          {layout.render('headline', { hideLabel: true, className: '' })}
        </div>
      )}

      {layout.render('summary')}
      {layout.render('languages')}

      {layout.rest()}
    </SectionCard>
  );
}
