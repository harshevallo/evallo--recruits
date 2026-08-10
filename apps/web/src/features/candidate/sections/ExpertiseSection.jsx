import { SectionCard } from './SectionCard';

/**
 * CAN-02 section 3 — teaching expertise.
 *
 * One panel with three named blocks separated by rules, as the reference draws it. The block
 * headings are part of the layout rather than the question labels, so each control sits under a
 * heading in the section's voice while the field keeps its own accessible name.
 */
export function ExpertiseSection({ layout }) {
  const subjects = layout.find('subjects');
  const segments = layout.find('learnerSegments');

  return (
    <SectionCard>
      {subjects && (
        <div>
          <h3 className="mb-1 text-base font-bold text-brand-dark">
            Subjects and standardised tests
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            Type to search, then press{' '}
            <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              Enter
            </kbd>
            . These are the tags recruiters search on.
          </p>
          {layout.render('subjects', { hideLabel: true, className: '' })}
        </div>
      )}

      {segments && (
        <>
          <hr className="my-8 border-gray-100" />
          <div>
            <h3 className="mb-3 text-base font-bold text-brand-dark">{segments.label}</h3>
            {layout.render('learnerSegments', { hideLabel: true, className: '' })}
          </div>
        </>
      )}

      <hr className="my-8 border-gray-100" />

      {/*
        Curricula and tests are role-gated in the bank, so which of these appears depends on the
        roles chosen in the previous section. When neither applies the rule above still reads as
        a closing divider rather than a gap.
      */}
      {layout.render('testsPrepared')}
      {layout.render('curriculaTaught')}
      {layout.rest()}
    </SectionCard>
  );
}
