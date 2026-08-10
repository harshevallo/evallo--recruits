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
import { listAllEntries } from './profileEntry.service.js';
import {
  getActiveBank,
  optionsFor,
  isQuestionVisible,
} from '../question-bank/questionBank.service.js';
import { QUESTION_TYPES, ANSWER_TARGETS } from '../question-bank/questionBank.model.js';
import { CandidateAnswer } from './candidateAnswer.model.js';

/** Reads a possibly-nested field, so a bank can address `location.country` directly. */
function readPath(document, path) {
  return path.split('.').reduce((value, key) => (value == null ? value : value[key]), document);
}

/** Writes a possibly-nested field, creating intermediate objects as needed. */
function writePath(document, path, value) {
  const keys = path.split('.');
  const last = keys.pop();

  let target = document;
  for (const key of keys) {
    if (target[key] == null || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[last] = value;

  // Mongoose does not observe mutation inside a nested plain object.
  if (keys.length > 0) document.markModified(keys[0]);
}

/** Reads the current value of a question, wherever it is stored. */
function currentValue(question, profile, user, answersByKey) {
  if (question.target === ANSWER_TARGETS.PROFILE) {
    return readPath(profile, question.field) ?? null;
  }
  if (question.target === ANSWER_TARGETS.USER) {
    return readPath(user, question.field) ?? null;
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
export async function getBuilderState(profile, user) {
  const bank = await getActiveBank();
  if (!bank) throw ApiError.notFound('The profile builder is not configured.');

  const answers = await CandidateAnswer.find({ candidateId: profile._id }).lean();
  const answersByKey = new Map(answers.map((a) => [a.questionKey, a]));
  const targetRoles = profile.targetRoles ?? [];
  const deliveryModes = profile.deliveryModes ?? [];

  const sections = [...bank.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      const questions = section.questions
        .filter((question) => isQuestionVisible(question, targetRoles, deliveryModes))
        .map((question) => ({
          key: question.key,
          label: question.label,
          help: question.help ?? null,
          placeholder: question.placeholder ?? null,
          type: question.type,
          requiredForPublish: question.requiredForPublish,
          options: question.optionSet ? optionsFor(question.optionSet) : null,
          /** How to draw the control (ADR-007 bank configuration, not a page decision). */
          presentation: question.presentation ?? 'default',
          /** Which panel the question belongs to, when the section draws more than one. */
          group: question.group ?? null,
          maxLength: question.maxLength ?? null,
          min: question.min ?? null,
          max: question.max ?? null,
          value: currentValue(question, profile, user, answersByKey),
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

  /*
   * Evidence sections (PRD §8.3 sections 4–5) sit alongside the bank's question sections rather
   * than inside it. They are repeatable records in their own collections (ADR-008), not answers,
   * so they cannot be expressed as questions — but a candidate experiences them as two more
   * steps of the same builder, and the sidebar has to show them as such.
   *
   * `kind: 'entries'` is what tells the UI to render the repeatable pattern instead of a form.
   * The bank still owns every question; this owns none.
   */
  const entries = await listAllEntries(profile);

  const entrySections = [
    {
      key: 'experience',
      title: 'Work experience',
      description: 'Roles you have held. Recruiters read this before anything else you write.',
      /*
       * PRD §8.5 requires at least one experience entry OR an explicit new-educator declaration.
       * The declaration does not exist yet, so this is reported as optional rather than blocking
       * publication — gating on it today would lock out every new educator, which is the exact
       * outcome §8.5 is written to avoid.
       */
      optional: true,
      order: 90,
      kind: 'entries',
      entryKind: 'experience',
      entries: entries.experience,
    },
    {
      key: 'education',
      title: 'Education',
      description: 'Degrees and qualifications.',
      optional: true,
      order: 91,
      kind: 'entries',
      entryKind: 'education',
      entries: entries.education,
    },
    {
      key: 'media',
      title: 'Portfolio and media',
      description: 'Teaching videos. Recruiters watch these before they read anything else.',
      optional: true,
      order: 92,
      kind: 'entries',
      entryKind: 'media',
      entries: entries.media,
    },
    {
      key: 'credential',
      title: 'Credentials and scores',
      description: 'Licences, certifications and standardised scores.',
      optional: true,
      order: 93,
      kind: 'entries',
      entryKind: 'credential',
      entries: entries.credential,
    },
  ].map((section) => ({
    ...section,
    questions: [],
    answered: section.entries.length,
    total: section.entries.length,
    complete: section.entries.length > 0,
    missingForPublish: [],
  }));

  /*
   * Publish and visibility closes the builder (PRD §8.5, §4.3).
   *
   * It owns no questions and no entries — it is a view onto the CAN-04 settings the candidate
   * already has, placed here because deciding who can see the profile is the last step of
   * building it. The section carries no data of its own, so the client reads the existing
   * visibility endpoints rather than this payload.
   */
  const visibilitySection = {
    key: 'visibility',
    title: 'Publish and visibility',
    description: 'Choose who can find you, and how companies may reach you.',
    optional: true,
    order: 99,
    kind: 'visibility',
    questions: [],
    entries: [],
    answered: 0,
    total: 0,
    complete: false,
    missingForPublish: [],
  };

  return {
    bankVersion: bank.version,
    sections: [
      ...sections.map((s) => ({ ...s, kind: 'questions' })),
      ...entrySections,
      visibilitySection,
    ],
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
export async function saveSection(profile, user, sectionKey, values = {}) {
  const bank = await getActiveBank();
  const section = bank?.sections.find((s) => s.key === sectionKey);
  if (!section) throw ApiError.notFound('That section does not exist.');

  const targetRoles = profile.targetRoles ?? [];
  const deliveryModes = profile.deliveryModes ?? [];
  const visible = section.questions.filter((q) =>
    isQuestionVisible(q, targetRoles, deliveryModes),
  );

  // Validate everything before writing anything, so a section never half-saves.
  const errors = {};
  for (const question of visible) {
    if (!(question.key in values)) continue;
    const message = validateAnswer(question, values[question.key]);
    if (message) errors[question.key] = message;
  }
  if (Object.keys(errors).length > 0) return { errors };

  const answerWrites = [];
  let userTouched = false;

  for (const question of visible) {
    if (!(question.key in values)) continue;
    const value = normalise(question, values[question.key]);

    if (question.target === ANSWER_TARGETS.PROFILE) {
      writePath(profile, question.field, value);
      continue;
    }

    /*
     * The PERSONAL layer. `05_DATABASE_SCHEMA.md` §2 puts location and languages on `users`,
     * because a person has one location whether or not they are also a candidate. Writing them
     * here keeps a single source of truth rather than a copy on the candidate profile.
     */
    if (question.target === ANSWER_TARGETS.USER) {
      writePath(user, question.field, value);
      userTouched = true;
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
  if (userTouched) await user.save();
  if (answerWrites.length > 0) await CandidateAnswer.bulkWrite(answerWrites);

  return { errors: null };
}
