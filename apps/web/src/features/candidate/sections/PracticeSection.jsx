import { SectionCard } from './SectionCard';

/**
 * CAN-02 section 5 — teaching practice.
 *
 * Two panels: the methodology questions everyone answers, and a tinted panel holding the
 * questions the bank gates on role (`onlyForRoles`). The gating itself happens server-side in
 * isQuestionVisible, so this panel simply is not there for a candidate who has not chosen a
 * tutoring role — the page holds no role logic of its own.
 */
export function PracticeSection({ layout }) {
  const hasRoleSpecific = layout.hasGroup('test_prep');

  return (
    <div className="space-y-6">
      <SectionCard title="Core methodology" icon="brain">
        {layout.render('philosophy')}
        {layout.render('differentiation')}
        {layout.rest()}
      </SectionCard>

      {hasRoleSpecific && (
        <SectionCard title="Test prep and tutoring specifics" icon="chalkboard" tone="accent">
          <p className="-mt-2 mb-5 text-xs text-gray-500">
            Shown because you selected a tutoring role in your preferences.
          </p>
          {layout.render('diagnosticProcess')}
          {layout.render('scoreGains')}
          {layout.rest({ group: 'test_prep' })}
        </SectionCard>
      )}
    </div>
  );
}
