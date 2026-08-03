/**
 * companyMembers — the authorization spine.
 *
 * Recruiter permissions live HERE, scoped to one company, never on the User document. A person
 * can hold a different role at every company they belong to, and be a candidate at the same
 * time. That is why there is no global role: one field on User cannot express it.
 *
 * Every recruiter permission check in the system resolves through this collection on each
 * request, which is what makes revocation immediate.
 */

import mongoose from 'mongoose';
import { COMPANY_ROLES, MEMBERSHIP_STATUS, PERMISSION_VALUES } from '@evallo/shared';

const companyMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },

    /** Role WITHIN this company. Meaningless outside it. */
    role: {
      type: String,
      required: true,
      enum: Object.values(COMPANY_ROLES),
      default: COMPANY_ROLES.RECRUITER,
    },

    status: {
      type: String,
      required: true,
      enum: Object.values(MEMBERSHIP_STATUS),
      default: MEMBERSHIP_STATUS.ACTIVE,
    },

    /** Explicit grants beyond the role, e.g. delegating ownership transfer to an admin. */
    permissionOverrides: [{ type: String, enum: PERMISSION_VALUES }],

    /** Scopes an assignment-limited role (hiring manager) to specific hiring intents. */
    assignedIntentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HiringIntent' }],

    /** Public team listing is opt-in — a recruiter is never shown without consent. */
    showOnPublicTeam: { type: Boolean, default: false },

    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedAt: Date,
    acceptedAt: Date,
    removedAt: Date,
  },
  { timestamps: true, collection: 'companyMembers' },
);

/** One membership per user per company. */
companyMemberSchema.index({ userId: 1, companyId: 1 }, { unique: true });

/** Hot path: "which companies does this user belong to?" — runs on nearly every request. */
companyMemberSchema.index({ userId: 1, status: 1 });

/** Team management, and counting owners before a removal or demotion. */
companyMemberSchema.index({ companyId: 1, status: 1, role: 1 });

export const CompanyMember = mongoose.model('CompanyMember', companyMemberSchema);
