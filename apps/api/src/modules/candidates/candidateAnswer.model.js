/**
 * candidateAnswers — structured answers to question-bank questions (ADR-007, ADR-008).
 *
 * Stores `bankVersion` alongside every answer so an answer stays interpretable after the question
 * is reworded: you can always tell which wording it was given under. Questions backed by a
 * first-class profile field are NOT stored here — they live on `candidateProfiles`, which is what
 * talent search reads.
 */

import mongoose from 'mongoose';

const candidateAnswerSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      required: true,
    },

    /** Stable question key, not the label — the label may change between bank versions. */
    questionKey: { type: String, required: true },

    /** Mixed: a question may capture text, a number, or a list. Validated against its type. */
    value: mongoose.Schema.Types.Mixed,

    bankVersion: { type: Number, required: true },
  },
  { timestamps: true, collection: 'candidateAnswers' },
);

/** One answer per question per candidate — a re-answer updates rather than appends. */
candidateAnswerSchema.index({ candidateId: 1, questionKey: 1 }, { unique: true });

export const CandidateAnswer = mongoose.model('CandidateAnswer', candidateAnswerSchema);
