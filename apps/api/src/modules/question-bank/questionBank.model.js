/**
 * questionBanks — versioned profile-builder configuration (ADR-007).
 *
 * The builder's sections and questions are DATA, not code: adding a question for a new role is a
 * bank revision, not a frontend deploy. Answers store the `bankVersion` they were given under, so
 * a later reword never silently changes what an existing answer meant.
 *
 * Exactly one bank is `active` at a time. Publishing a new version deactivates the previous one
 * rather than editing it in place — editing would rewrite the meaning of answers already given.
 */

import mongoose from 'mongoose';

/** How an answer is captured. The client renders one control per type; the server validates it. */
export const QUESTION_TYPES = Object.freeze({
  SHORT_TEXT: 'short_text',
  LONG_TEXT: 'long_text',
  SINGLE_SELECT: 'single_select',
  MULTI_SELECT: 'multi_select',
  NUMBER: 'number',
});

/**
 * Where an answer is stored.
 *
 * `profile` writes to a field on `candidateProfiles` — the fields talent search will read.
 * `answer` writes to `candidateAnswers`, keyed by question. Anything without a first-class field
 * uses `answer`, so adding a question never requires a schema migration (ADR-007, ADR-008).
 */
export const ANSWER_TARGETS = Object.freeze({
  PROFILE: 'profile',
  ANSWER: 'answer',
});

const questionSchema = new mongoose.Schema(
  {
    /** Stable identifier. Survives rewording — this is what `candidateAnswers` references. */
    key: { type: String, required: true },
    label: { type: String, required: true },
    help: String,
    placeholder: String,

    type: { type: String, required: true, enum: Object.values(QUESTION_TYPES) },

    target: { type: String, required: true, enum: Object.values(ANSWER_TARGETS) },
    /** Field on `candidateProfiles` when `target === 'profile'`. */
    field: String,

    /** PRD §8.5 — required for PUBLICATION, never required to save a draft (§8.3). */
    requiredForPublish: { type: Boolean, default: false },

    /** Option list key resolved from the shared taxonomy, for select types. */
    optionSet: String,

    minLength: Number,
    maxLength: Number,
    min: Number,
    max: Number,

    /**
     * Role-gated questions (PRD §20.2). Empty means the question is generic; otherwise it appears
     * only when the candidate has selected one of these target roles.
     */
    onlyForRoles: [String],
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    /** PRD §8.3: broad sections built from one-question or one-concept screens. */
    description: String,
    /** PRD §8.3 — optional sections may be skipped and returned to later. */
    optional: { type: Boolean, default: false },
    order: { type: Number, required: true },
    questions: [questionSchema],
  },
  { _id: false },
);

const questionBankSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    active: { type: Boolean, default: false },
    publishedAt: Date,
    sections: [sectionSchema],
  },
  { timestamps: true, collection: 'questionBanks' },
);

questionBankSchema.index({ version: 1 }, { unique: true });
questionBankSchema.index({ active: 1 });

export const QuestionBank = mongoose.model('QuestionBank', questionBankSchema);
