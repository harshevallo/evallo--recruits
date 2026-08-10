import { SectionCard } from './SectionCard';

/**
 * CAN-02 section 2 — roles and work preferences.
 *
 * Two panels, because the reference draws two: the role picker, which is the section's headline
 * decision, and "Employment parameters", which is everything that qualifies it. The roles chosen
 * here also gate later questions (`onlyForRoles`), so this screen is what makes the Teaching
 * practice section change shape.
 */
export function PreferencesSection({ layout }) {
  const roles = layout.find('targetRoles');

  return (
    <div className="space-y-8">
      <SectionCard
        title={roles?.label ?? 'Target education roles'}
        description={
          roles?.help ??
          'Select every role you are seeking. Your choices tailor the prompts later in the builder.'
        }
      >
        {layout.render('targetRoles', { hideLabel: true, className: '' })}
      </SectionCard>

      <SectionCard title="Employment parameters">
        {layout.render('employmentTypes', { className: 'mb-6' })}
        {layout.render('deliveryModes', { className: 'mb-6' })}
        {/* Only present when the candidate said they would work on-site or hybrid. */}
        {layout.render('onsiteCity', { className: 'mb-6' })}

        <hr className="mb-6 border-gray-100" />

        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          {layout.render('availability')}
          {layout.render('yearsExperience')}
          {layout.render('compensation')}
          {layout.render('workAuthorization')}
          {layout.rest()}
        </div>
      </SectionCard>
    </div>
  );
}
