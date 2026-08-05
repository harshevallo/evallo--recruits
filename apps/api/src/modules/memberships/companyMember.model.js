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
    /**
     * Absent ONLY while an invitation is outstanding for an email with no account yet (REC-07).
     * It is stamped the moment the invitation is accepted, so every ACTIVE membership has one.
     *
     * The alternative — creating a shell User at invite time — was rejected: `signup` refuses an
     * email that already exists, so inviting someone would lock them out of registering.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    /**
     * The address the invitation was sent to (REC-07). Recorded for every invitation, including
     * ones addressed to an existing account, so the team list can show who was invited without
     * a join, and so duplicate detection has one field to check.
     *
     * An invitee is matched to this address only once they have VERIFIED it (PRD §6.4: an
     * invited member joins only after email verification) — otherwise registering someone
     * else's address would hand over their invitations.
     */
    invitedEmail: { type: String, lowercase: true, trim: true },

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
    /** Moves on every resend; `invitedAt` does not, so the original invite date survives. */
    invitationLastSentAt: Date,
    acceptedAt: Date,
    removedAt: Date,
  },
  { timestamps: true, collection: 'companyMembers' },
);

/**
 * One membership per user per company.
 *
 * PARTIAL, because an invitation to an address with no account has no `userId` at all — without
 * the filter every such invitation would index as (null, companyId) and the second one at any
 * company would be rejected as a duplicate.
 */
companyMemberSchema.index(
  { userId: 1, companyId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } },
);

/**
 * One OUTSTANDING invitation per address per company (REC-07 duplicate prevention), enforced by
 * the database rather than only by a service check, so a double-submit cannot create two.
 *
 * Restricted to `invited` on purpose: a cancelled or declined invitation keeps its row (PRD
 * §21.6 retains the audit trail), and that row must not block a fresh invitation later.
 */
companyMemberSchema.index(
  { companyId: 1, invitedEmail: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: MEMBERSHIP_STATUS.INVITED,
      invitedEmail: { $type: 'string' },
    },
  },
);

/** Hot path: "which companies does this user belong to?" — runs on nearly every request. */
companyMemberSchema.index({ userId: 1, status: 1 });

/** Team management, and counting owners before a removal or demotion. */
companyMemberSchema.index({ companyId: 1, status: 1, role: 1 });

export const CompanyMember = mongoose.model('CompanyMember', companyMemberSchema);
