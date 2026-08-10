/**
 * companyJoinRequests — a person asking to join an existing company (REC-01, PRD §7.2).
 *
 * WHY THIS IS NOT A `CompanyMember` ROW, when an invitation is
 * ------------------------------------------------------------
 * `invitation.service.js` argues — correctly — that an invitation must not live in its own
 * collection, because an invitation already IS a membership row in the `invited` state and a second
 * table would have to be reconciled with memberships on every read.
 *
 * A join request is the mirror image and that argument does not carry over:
 *
 *   · An invitation is issued BY someone who already holds `member:manage`. It is a grant that has
 *     not been picked up yet, so representing it as a pending membership is honest.
 *   · A join request is made by someone with NO authority at the company. It grants nothing. If it
 *     were a membership row, every one of the sixteen `CompanyMember` queries in this codebase —
 *     several of which lean on partial indexes and implicit status assumptions — would have to be
 *     re-audited to make sure a request could not be mistaken for membership. One missed status
 *     filter would be a privilege escalation.
 *
 * So the queue is separate and holds no authority, and APPROVAL is what reaches into the
 * membership system: it creates an ordinary ACTIVE `CompanyMember` through the same rules as any
 * other member, reusing roles, permissions and ownership as they already exist.
 */

import mongoose from 'mongoose';
import { COMPANY_ROLES } from '@evallo/shared';

export const JOIN_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  WITHDRAWN: 'withdrawn',
});

const joinRequestSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: Object.values(JOIN_REQUEST_STATUS),
      default: JOIN_REQUEST_STATUS.PENDING,
    },

    /**
     * The role the requester is asking for, as a hint only.
     *
     * The approver chooses the role that is actually granted — otherwise a requester could ask for
     * `owner` and receive it. Defaults to recruiter, which is what someone joining to hire needs.
     */
    requestedRole: {
      type: String,
      enum: Object.values(COMPANY_ROLES),
      default: COMPANY_ROLES.RECRUITER,
    },

    /** Free text so the approver can tell a colleague from a stranger. */
    message: { type: String, trim: true, maxlength: 500 },

    /** Who resolved it, and when. Kept after the fact — the row is an audit record. */
    decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: Date,
    /** Only set on approval, so "which membership came from which request" is answerable. */
    grantedRole: { type: String, enum: [...Object.values(COMPANY_ROLES), null], default: null },
  },
  { timestamps: true, collection: 'companyJoinRequests' },
);

/**
 * One OUTSTANDING request per person per company.
 *
 * Partial on `pending`, for the same reason the invitation index is partial on `invited`: a declined
 * request keeps its row as history, and that row must not block the person asking again later — for
 * example after they have actually joined the organisation.
 */
joinRequestSchema.index(
  { companyId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: JOIN_REQUEST_STATUS.PENDING } },
);

/** The approver's queue. */
joinRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });

/** "What have I asked for?" — the requester's own view. */
joinRequestSchema.index({ userId: 1, status: 1 });

export const CompanyJoinRequest = mongoose.model('CompanyJoinRequest', joinRequestSchema);
