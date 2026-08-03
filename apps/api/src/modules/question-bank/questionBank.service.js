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
} from '@evallo/shared';
import { QuestionBank } from './questionBank.model.js';
import { QUESTION_BANK_V1, QUESTION_BANK_VERSION } from './questionBank.definition.js';

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
  if (existing) return existing;

  try {
    return await QuestionBank.create({
      version: QUESTION_BANK_VERSION,
      active: true,
      publishedAt: new Date(),
      sections: QUESTION_BANK_V1,
    });
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
export function isQuestionVisible(question, targetRoles = []) {
  if (!question.onlyForRoles?.length) return true;
  return question.onlyForRoles.some((role) => targetRoles.includes(role));
}
