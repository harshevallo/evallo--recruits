/**
 * CAN-02 profile builder (PRD §8.3, ADR-007).
 *
 * The builder is driven entirely by the active question bank: this service resolves the bank
 * against the candidate's current answers, validates a submitted section, and writes each answer
 * to wherever its question says it belongs.
 *
 * Two rules from PRD §8.3 shape everything here:
 *   1. **A draft never blocks.** `requiredForPublish` is checked at publish time, not at save
 *      time — candidates "may skip optional sections and return later".
 *   2. **Completion is reported by section**, never as one opaque percentage.
 */

import { ApiError } from '../../lib/ApiError.js';
import {
  getActiveBank,
  optionsFor,
  isQuestionVisible,
} from '../question-bank/questionBank.service.js';
import { QUESTION_TYPES, ANSWER_TARGETS } from '../question-bank/questionBank.model.js';
import { CandidateAnswer } from './candidateAnswer.model.js';

/** Reads the current value of a question, wherever it is stored. */
function currentValue(question, profile, answersByKey) {
  if (question.target === ANSWER_TARGETS.PROFILE) {
    return profile[question.field] ?? null;
  }
  return answersByKey.get(question.key)?.value ?? null;
}

function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/**
 * Validates one answer against its question definition.
 * @returns {string|null} an error message, or null when valid
 */
function validateAnswer(question, value) {
  if (!isAnswered(value)) {
    // Empty is always allowed while drafting — publication is where requirements are enforced.
    return null;
  }

  switch (question.type) {
    case QUESTION_TYPES.SHORT_TEXT:
    case QUESTION_TYPES.LONG_TEXT: {
      if (typeof value !== 'string') return 'Expected text.';
      const trimmed = value.trim();
      if (question.minLength && trimmed.length < question.minLength) {
        return `Use at least ${question.minLength} characters.`;
      }
      if (question.maxLength && trimmed.length > question.maxLength) {
        return `Keep this under ${question.maxLength} characters.`;
      }
      return null;
    }

    case QUESTION_TYPES.NUMBER: {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return 'Enter a number.';
      if (question.min !== undefined && numeric < question.min) {
        return `Must be ${question.min} or more.`;
      }
      if (question.max !== undefined && numeric > question.max) {
        return `Must be ${question.max} or less.`;
      }
      return null;
    }

    case QUESTION_TYPES.SINGLE_SELECT: {
      const allowed = optionsFor(question.optionSet).map((o) => o.value);
      return allowed.includes(value) ? null : 'Choose one of the listed options.';
    }

    case QUESTION_TYPES.MULTI_SELECT: {
      if (!Array.isArray(value)) return 'Choose from the listed options.';
      const allowed = optionsFor(question.optionSet).map((o) => o.value);
      return value.every((v) => allowed.includes(v))
        ? null
        : 'One or more choices are not recognised.';
    }

    default:
      return 'Unsupported question type.';
  }
}

/** Normalises a valid answer before storage — trimming text, coercing numbers. */
function normalise(question, value) {
  if (!isAnswered(value)) return question.type === QUESTION_TYPES.MULTI_SELECT ? [] : null;
  if (question.type === QUESTION_TYPES.NUMBER) return Number(value);
  if (typeof value === 'string') return value.trim();
  return value;
}

/**
 * The whole builder state: sections, the questions visible for this candidate's chosen roles,
 * their current values, and per-section completion.
 */
export async function getBuilderState(profile) {
  const bank = await getActiveBank();
  if (!bank) throw ApiError.notFound('The profile builder is not configured.');

  const answers = await CandidateAnswer.find({ candidateId: profile._id }).lean();
  const answersByKey = new Map(answers.map((a) => [a.questionKey, a]));
  const targetRoles = profile.targetRoles ?? [];

  const sections = [...bank.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const questions = section.questions
        .filter((question) => isQuestionVisible(question, targetRoles))
        .map((question) => ({
          key: question.key,
          label: question.label,
          help: question.help ?? null,
          placeholder: question.placeholder ?? null,
          type: question.type,
          requiredForPublish: question.requiredForPublish,
          options: question.optionSet ? optionsFor(question.optionSet) : null,
          maxLength: question.maxLength ?? null,
          min: question.min ?? null,
          max: question.max ?? null,
          value: currentValue(question, profile, answersByKey),
        }));

      const answered = questions.filter((q) => isAnswered(q.value)).length;
      const missingForPublish = questions
        .filter((q) => q.requiredForPublish && !isAnswered(q.value))
        .map((q) => q.label);

      return {
        key: section.key,
        title: section.title,
        description: section.description ?? null,
        optional: section.optional,
        order: section.order,
        questions,
        answered,
        total: questions.length,
        // PRD §8.3: completion by section, not one opaque number.
        complete: questions.length > 0 && answered === questions.length,
        missingForPublish,
      };
    });

  return {
    bankVersion: bank.version,
    sections,
    /** PRD §8.5 — what still blocks publication, named rather than scored. */
    publishBlockers: sections.flatMap((s) => s.missingForPublish),
  };
}

/**
 * Saves one section. Partial saves are the norm — "save and exit" is a PRD requirement, so an
 * incomplete section is a valid save, not an error.
 *
 * @returns {Promise<{ errors: Record<string,string>|null }>}
 */
export async function saveSection(profile, sectionKey, values = {}) {
  const bank = await getActiveBank();
  const section = bank?.sections.find((s) => s.key === sectionKey);
  if (!section) throw ApiError.notFound('That section does not exist.');

  const targetRoles = profile.targetRoles ?? [];
  const visible = section.questions.filter((q) => isQuestionVisible(q, targetRoles));

  // Validate everything before writing anything, so a section never half-saves.
  const errors = {};
  for (const question of visible) {
    if (!(question.key in values)) continue;
    const message = validateAnswer(question, values[question.key]);
    if (message) errors[question.key] = message;
  }
  if (Object.keys(errors).length > 0) return { errors };

  const answerWrites = [];

  for (const question of visible) {
    if (!(question.key in values)) continue;
    const value = normalise(question, values[question.key]);

    if (question.target === ANSWER_TARGETS.PROFILE) {
      profile[question.field] = value;
      continue;
    }

    answerWrites.push({
      updateOne: {
        filter: { candidateId: profile._id, questionKey: question.key },
        update: { $set: { value, bankVersion: bank.version } },
        upsert: true,
      },
    });
  }

  profile.bankVersion = bank.version;
  profile.lastActiveAt = new Date();

  await profile.save();
  if (answerWrites.length > 0) await CandidateAnswer.bulkWrite(answerWrites);

  return { errors: null };
}
