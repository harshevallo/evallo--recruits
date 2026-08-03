/**
 * earlyAccessRequests — 05_DATABASE_SCHEMA.md §10a.
 *
 * Pilot waitlist captured by MKT-01. Deliberately NOT the users collection (ADR-014).
 */

import mongoose from 'mongoose';
import { EARLY_ACCESS_SEGMENT, EARLY_ACCESS_STATUS } from '@evallo/shared';

const earlyAccessRequestSchema = new mongoose.Schema(
  {
    // Uniqueness is declared once, in the explicit index below. Setting `unique: true` here as
    // well creates a duplicate index definition and a Mongoose startup warning.
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    name: { type: String, required: true, trim: true },

    /**
     * Marketing segmentation ONLY.
     * Never copy this onto a User document — that would reintroduce the role field ADR-001
     * exists to prevent.
     */
    segment: {
      type: String,
      required: true,
      enum: Object.values(EARLY_ACCESS_SEGMENT),
    },

    status: {
      type: String,
      required: true,
      enum: Object.values(EARLY_ACCESS_STATUS),
      default: EARLY_ACCESS_STATUS.NEW,
    },

    /** Server-derived attribution. Client-supplied values are never trusted. */
    source: {
      referrer: String,
      utmSource: String,
      utmMedium: String,
      utmCampaign: String,
      landingPath: String,
    },

    /** Terms/privacy acknowledgement. Submitting the form is the consent action. */
    consentedAt: { type: Date, required: true },

    submissionCount: { type: Number, required: true, default: 1 },
    lastSubmittedAt: { type: Date, required: true },

    /** Set only when the lead converts to a real account. */
    invitedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    notes: String,

    /** Abuse triage only. Subject to the retention policy (PRD §16.1). */
    ip: String,
    userAgent: String,
  },
  { timestamps: true, collection: 'earlyAccessRequests' },
);

/**
 * The unique index is what makes the endpoint idempotent under concurrent submits.
 * Application-level checking alone races.
 */
earlyAccessRequestSchema.index({ email: 1 }, { unique: true });
earlyAccessRequestSchema.index({ status: 1, createdAt: -1 });
earlyAccessRequestSchema.index({ segment: 1, createdAt: -1 });

export const EarlyAccessRequest = mongoose.model(
  'EarlyAccessRequest',
  earlyAccessRequestSchema,
);
