/**
 * hiringIntents — 05_DATABASE_SCHEMA.md §7, PRD §7.5.
 *
 * MVP rule: a detailed job description is NOT required. A company can activate hiring with
 * only role category, work arrangement, employment type, and location.
 */

import mongoose from 'mongoose';
import {
  HIRING_INTENT_STATUS,
  ROLE_CATEGORY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  DELIVERY_MODE_VALUES,
} from '@evallo/shared';

const hiringIntentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    title: { type: String, trim: true },

    status: {
      type: String,
      required: true,
      enum: Object.values(HIRING_INTENT_STATUS),
      default: HIRING_INTENT_STATUS.DRAFT,
    },

    roleCategories: {
      type: [{ type: String, enum: ROLE_CATEGORY_VALUES }],
      required: true,
      validate: [(v) => v.length > 0, 'At least one role category is required'],
    },

    specializations: {
      subjects: [String],
      tests: [String],
      gradeBands: [String],
      curricula: [String],
    },

    employmentTypes: [{ type: String, enum: EMPLOYMENT_TYPE_VALUES }],
    deliveryModes: [{ type: String, enum: DELIVERY_MODE_VALUES }],

    locations: [
      {
        country: { type: String, uppercase: true },
        region: String,
        city: String,
        timezones: [String],
        relocationExpected: Boolean,
      },
    ],

    experienceLevels: [String],
    minYears: Number,

    availability: { type: { type: String }, targetStartMonth: String },

    compensation: {
      min: Number,
      max: Number,
      currency: String,
      period: String,
      visibility: { type: String, default: 'hidden' },
    },

    /** Optional — enforcing this would violate PRD §7.5. */
    description: String,

    interestQuestions: {
      type: [{ prompt: String, required: Boolean }],
      validate: [(v) => v.length <= 3, 'A maximum of three interest questions is allowed'],
    },

    closedAt: Date,
    closedReason: String,
  },
  { timestamps: true, collection: 'hiringIntents' },
);

hiringIntentSchema.index({ companyId: 1, status: 1 });
hiringIntentSchema.index({ status: 1, roleCategories: 1 });

export const HiringIntent = mongoose.model('HiringIntent', hiringIntentSchema);
