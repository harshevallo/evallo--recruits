/**
 * Question bank access and option resolution (ADR-007).
 *
 * Option lists live in `packages/shared` so client and server agree on the vocabulary (ADR-009);
 * the bank only references them by key. That keeps the seeded configuration small and stops two
 * copies of a taxonomy drifting apart.
 */

import {
  CANDIDATE_ROLE_OPTIONS,
  SUBJECT_OPTIONS,
  LEARNER_SEGMENT_OPTIONS,
  AVAILABILITY_OPTIONS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  DELIVERY_MODE_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  LANGUAGE_OPTIONS,
} from '@evallo/shared';
import { QuestionBank } from './questionBank.model.js';
import { QUESTION_BANK, QUESTION_BANK_VERSION } from './questionBank.definition.js';

const OPTION_SETS = Object.freeze({
  candidateRoles: CANDIDATE_ROLE_OPTIONS.map(({ value, label }) => ({ value, label })),
  subjects: SUBJECT_OPTIONS,
  learnerSegments: LEARNER_SEGMENT_OPTIONS,
  availability: AVAILABILITY_OPTIONS,
  deliveryModes: DELIVERY_MODE_OPTIONS,
  employmentTypes: Object.values(EMPLOYMENT_TYPES).map((value) => ({
    value,
    label: EMPLOYMENT_TYPE_LABELS[value] ?? value,
  })),
  countries: COUNTRY_OPTIONS,
  timezones: TIMEZONE_OPTIONS,
  languages: LANGUAGE_OPTIONS,
});

export function optionsFor(optionSet) {
  return OPTION_SETS[optionSet] ?? [];
}

/**
 * The active bank, seeded on first use.
 *
 * Seeding lazily keeps a fresh environment working without a manual step, and the unique index on
 * `version` makes a concurrent double-seed impossible rather than merely unlikely.
 */
export async function getActiveBank() {
  const existing = await QuestionBank.findOne({ active: true });
  if (existing && existing.version >= QUESTION_BANK_VERSION) return existing;

  /*
   * Publishing a revision DEACTIVATES the previous one rather than editing it (ADR-007). Editing
   * in place would rewrite the meaning of answers already given; existing `candidateAnswers` keep
   * the `bankVersion` they were captured under, so they stay interpretable.
   */
  try {
    const published = await QuestionBank.create({
      version: QUESTION_BANK_VERSION,
      active: true,
      publishedAt: new Date(),
      sections: QUESTION_BANK,
    });

    if (existing) {
      await QuestionBank.updateOne({ _id: existing._id }, { $set: { active: false } });
    }

    return published;
  } catch (error) {
    // Lost the race with another process — its document is the winner.
    if (error?.code === 11000) return QuestionBank.findOne({ active: true });
    throw error;
  }
}

/**
 * Questions visible to this candidate.
 *
 * PRD §20.2 limits role-specific depth to the pilot priority roles, so a question with
 * `onlyForRoles` appears only once the candidate has actually selected one of them. Everything
 * else is generic and always shown.
 */
export function isQuestionVisible(question, targetRoles = [], deliveryModes = []) {
  if (question.onlyForRoles?.length && !question.onlyForRoles.some((r) => targetRoles.includes(r))) {
    return false;
  }

  // Appendix C: remote-only candidates are not forced through commuting questions.
  if (
    question.onlyForDeliveryModes?.length &&
    !question.onlyForDeliveryModes.some((m) => deliveryModes.includes(m))
  ) {
    return false;
  }

  return true;
}
