/**
 * expressionsOfInterest — PRD §11.1.
 *
 * A candidate's explicit interest in a company, optionally scoped to a hiring intent.
 *
 * `candidateId` is null until authentication exists (M1); interest submitted from the public
 * page carries inline contact details instead. The shape is the authenticated one so no
 * migration is needed when candidate profiles arrive.
 */

import mongoose from 'mongoose';
import { INTEREST_STATUS, ACTIVE_INTEREST_STATES } from '@evallo/shared';

const expressionOfInterestSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    /** Null for public (pre-auth) submissions. */
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CandidateProfile',
      default: null,
    },

    /** Null means general company interest rather than a specific role (PRD §8.7). */
    hiringIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HiringIntent',
      default: null,
    },

    /** Inline contact for pre-auth submissions. Replaced by the profile once auth exists. */
    contact: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
    },

    message: { type: String, trim: true },

    source: { type: String, default: 'company_page' },

    status: {
      type: String,
      required: true,
      enum: Object.values(INTEREST_STATUS),
      default: INTEREST_STATUS.SUBMITTED,
    },

    /** PRD §11.1 — consent record with a timestamp. */
    consent: {
      grantedAt: { type: Date, required: true },
      scope: { type: String, default: 'contact_and_message' },
    },

    ip: String,
    userAgent: String,
  },
  { timestamps: true, collection: 'expressionsOfInterest' },
);

/**
 * One active interest per email per company per intent — PRD §4.1, §21.5.
 *
 * A unique PARTIAL index is what makes submission idempotent: the company receives the interest
 * exactly once even if the visitor retries or refreshes. Application checks alone race.
 */
expressionOfInterestSchema.index(
  { companyId: 1, 'contact.email': 1, hiringIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_INTEREST_STATES } },
    name: 'unique_active_interest',
  },
);

expressionOfInterestSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const ExpressionOfInterest = mongoose.model(
  'ExpressionOfInterest',
  expressionOfInterestSchema,
);
