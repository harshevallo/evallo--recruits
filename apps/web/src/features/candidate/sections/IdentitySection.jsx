import { ProfilePhotoUploader } from '@/features/account/ProfilePhotoUploader';
import { SectionCard } from './SectionCard';

/**
 * CAN-02 section 1 — professional identity.
 *
 * The questions are still the bank's (ADR-007); this owns only their ARRANGEMENT: the photo
 * block, the paired name and location rows, and the headline's "recommended" flag. Rendering them
 * as one flat list would have been less code and a different screen.
 */
export function IdentitySection({ layout }) {
  const headline = layout.find('headline');

  return (
    <SectionCard>
      {/*
        Photo (ADR-020). Until 2026-08-24 this block explained that upload was impossible, because
        it was — the API had no storage. It now does, and the uploader owns its own state, so this
        section neither reads `user` nor knows where the bytes go. It reads the auth context
        directly, which is also what refreshes every other avatar on screen after an upload.
      */}
      <ProfilePhotoUploader />

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
