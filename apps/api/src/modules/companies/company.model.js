/**
 * companies — 05_DATABASE_SCHEMA.md §5, PRD §13.
 *
 * Only `status: 'published'` documents are readable by modules/public (PRD §9.3).
 */

import mongoose from 'mongoose';
import {
  COMPANY_STATUS,
  MODERATION_STATUS,
  ORGANIZATION_TYPE_VALUES,
  EDUCATION_SERVICE_VALUES,
  DELIVERY_MODE_VALUES,
} from '@evallo/shared';

const locationSchema = new mongoose.Schema(
  {
    country: { type: String, required: true, uppercase: true, trim: true },
    region: String,
    city: String,
    timezone: String,
  },
  { _id: false },
);

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: String,

    slug: { type: String, required: true, lowercase: true, trim: true },
    slugHistory: [{ slug: String, changedAt: Date }],

    organizationType: { type: String, required: true, enum: ORGANIZATION_TYPE_VALUES },

    status: {
      type: String,
      required: true,
      enum: Object.values(COMPANY_STATUS),
      default: COMPANY_STATUS.DRAFT,
    },
    moderationStatus: {
      type: String,
      enum: Object.values(MODERATION_STATUS),
      default: MODERATION_STATUS.NONE,
    },

    website: String,
    foundingYear: Number,
    sizeRange: String,
    verifiedDomains: [{ domain: String, verifiedAt: Date, method: String }],

    logoUrl: String,
    coverImageUrl: String,
    tagline: { type: String, trim: true },

    description: {
      short: String,
      full: String,
      mission: String,
      values: String,
      culture: String,
      philosophy: String,
    },

    location: { type: locationSchema, required: true },
    locations: [locationSchema],
    serviceRegions: [String],
    deliveryModes: [{ type: String, enum: DELIVERY_MODE_VALUES }],

    educationServices: [{ type: String, enum: EDUCATION_SERVICE_VALUES }],
    subjects: [String],

    isCurrentlyHiring: { type: Boolean, default: false },
    acceptsGeneralInterest: { type: Boolean, default: false },

    /**
     * Contact details the company has chosen to publish. Optional by design — PRD §11.2 makes
     * in-platform messaging the default channel, so a company may publish nothing here.
     */
    publicContact: {
      email: String,
      phone: String,
    },

    seo: {
      title: String,
      description: String,
      ogImageUrl: String,
      canonicalUrl: String,
    },

    publishedAt: Date,
    archivedAt: Date,
  },
  { timestamps: true, collection: 'companies' },
);

companySchema.index({ slug: 1 }, { unique: true });
companySchema.index({ 'slugHistory.slug': 1 });

// PUB-01 directory listing and facets.
companySchema.index({ status: 1, isCurrentlyHiring: 1, updatedAt: -1 });
companySchema.index({ status: 1, organizationType: 1, 'location.country': 1 });
companySchema.index({ status: 1, educationServices: 1 });

// Directory keyword search (PRD §9.1).
companySchema.index(
  { name: 'text', tagline: 'text', 'description.short': 'text' },
  { weights: { name: 10, tagline: 4, 'description.short': 1 }, name: 'company_text' },
);

/**
 * Initials fallback when no logo is set — PRD §7.3 makes the logo optional.
 *
 * Exported as a plain function as well as a virtual: `.lean()` queries do not run virtuals (the
 * `virtuals: true` option is a no-op without the mongoose-lean-virtuals plugin), so any lean read
 * that needs initials must call this directly rather than expect the virtual.
 */
export function companyInitials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

companySchema.virtual('initials').get(function initials() {
  return companyInitials(this.name);
});

companySchema.set('toJSON', { virtuals: true });
companySchema.set('toObject', { virtuals: true });

export const Company = mongoose.model('Company', companySchema);
