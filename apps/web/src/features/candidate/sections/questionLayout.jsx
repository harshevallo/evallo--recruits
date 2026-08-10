import { BuilderQuestion } from '@/features/candidate/components/BuilderQuestion';

/**
 * The bridge between a bank section and a hand-laid-out screen (CAN-02, ADR-007).
 *
 * The bank owns which questions exist; these sections own where each one sits. `render(key)` is
 * how a layout places a specific question, and it returns null for a key this bank version does
 * not carry — a section must not break because a revision retired a question it used to draw.
 *
 * `rest()` is the counterweight: it renders every question the layout did NOT place, so a
 * question added to the bank tomorrow appears somewhere rather than vanishing because no one
 * updated the layout. That is what keeps "the bank is data" true.
 */
export function questionLayout({ questions, valueFor, errors, disabled, onChange }) {
  const byKey = new Map(questions.map((question) => [question.key, question]));
  const placed = new Set();

  function draw(question, options = {}) {
    return (
      <BuilderQuestion
        key={question.key}
        question={question}
        value={valueFor(question)}
        error={errors[question.key]}
        disabled={disabled}
        onChange={onChange}
        {...options}
      />
    );
  }

  return {
    /** The question definition, for a layout that needs its label or help text. */
    find: (key) => byKey.get(key) ?? null,

    /** Places one question. Marks it placed, so `rest()` will not draw it again. */
    render(key, options = {}) {
      const question = byKey.get(key);
      if (!question) return null;
      placed.add(key);
      return draw(question, options);
    },

    /** Every question in this group that the layout did not place explicitly. */
    rest(options = {}) {
      const { group = null, ...questionOptions } = options;
      return questions
        .filter((question) => !placed.has(question.key) && (question.group ?? null) === group)
        .map((question) => {
          placed.add(question.key);
          return draw(question, questionOptions);
        });
    },

    /** Whether this group has any question at all — used to hide an empty panel. */
    hasGroup: (group) => questions.some((question) => (question.group ?? null) === group),
  };
}
