/**
 * REC-10 company home — the recruiter's dashboard for ONE company (PRD §5.2, §7.2).
 *
 * This screen owns no data. Every number here is counted from a collection another module already
 * writes, and every blocker is the one REC-06 would show at publish time — reusing
 * `buildPublishChecklist` rather than restating §7.3 is what stops the dashboard from telling a
 * recruiter they are ready to publish while the publish button disagrees.
 *
 * What it shows is bounded by what the CALLER may see. A viewer holds `interest:view` but not
 * `company:edit`, so they get the interest summary and not the setup blockers — the dashboard
 * asks `can()` rather than assuming everyone at a company sees the same page.
 */

import {
  COMPANY_STATUS,
  HIRING_INTENT_STATUS,
  INTEREST_STATUS,
  MEMBERSHIP_STATUS,
  ACTIVE_INTEREST_STATES,
  PERMISSIONS,
  can,
} from '@evallo/shared';
import { CompanyMember } from '../memberships/companyMember.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from '../interests/expressionOfInterest.model.js';
import { buildPublishChecklist } from './company.service.js';

/**
 * Interest counts by status, in one aggregation rather than one query per status.
 *
 * `submitted` is called out separately because it is the only status that means "nobody has
 * looked at this yet" — it is the number the pending-actions block is built from.
 */
async function interestSummary(companyId) {
  const rows = await ExpressionOfInterest.aggregate([
    { $match: { companyId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.count]));

  const active = ACTIVE_INTEREST_STATES.reduce(
    (total, status) => total + (byStatus[status] ?? 0),
    0,
  );

  return {
    byStatus,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    active,
    /** Not yet opened by anyone — the queue REC-11 exists to clear. */
    new: byStatus[INTEREST_STATUS.SUBMITTED] ?? 0,
    withdrawn: byStatus[INTEREST_STATUS.WITHDRAWN] ?? 0,
  };
}

/** Active hiring intents plus the titles the overview lists. PRD §7.5 keeps these lightweight. */
async function hiringSummary(companyId) {
  const intents = await HiringIntent.find({ companyId })
    .select('title status roleCategories employmentTypes createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const active = intents.filter((intent) => intent.status === HIRING_INTENT_STATUS.ACTIVE);

  return {
    total: intents.length,
    activeCount: active.length,
    /** A short list, not the whole set — REC-05 owns the full hiring screen. */
    active: active.slice(0, 5).map((intent) => ({
      id: String(intent._id),
      title: intent.title ?? null,
      roleCategories: intent.roleCategories ?? [],
      employmentTypes: intent.employmentTypes ?? [],
    })),
  };
}

/**
 * The next things worth doing, most consequential first.
 *
 * Deliberately a list of things the reader can ACT on, not a status report. An item only appears
 * when it is both true and actionable by this caller, so an empty list genuinely means "nothing
 * needs you" rather than "you cannot see what needs doing".
 */
function pendingActions({ company, checklist, interests, hiring, pendingInvitations, permissions }) {
  const actions = [];

  if (permissions.canEdit && company.status === COMPANY_STATUS.DRAFT) {
    actions.push(
      checklist.canPublish
        ? {
            key: 'publish',
            tone: 'primary',
            title: 'Your page is ready to publish',
            detail: 'Everything required is in place. Publishing makes it findable.',
            to: 'preview',
          }
        : {
            key: 'finish_setup',
            tone: 'warning',
            title: `${checklist.blockers.length} ${
              checklist.blockers.length === 1 ? 'item' : 'items'
            } left before you can publish`,
            detail: checklist.blockers.join(' · '),
            to: 'setup',
          },
    );
  }

  if (permissions.canViewInterest && interests.new > 0) {
    actions.push({
      key: 'review_interest',
      tone: 'primary',
      title: `${interests.new} new ${interests.new === 1 ? 'person' : 'people'} interested`,
      detail: 'Nobody has opened these yet.',
      to: 'interests',
    });
  }

  if (permissions.canManageHiring && company.status === COMPANY_STATUS.PUBLISHED && hiring.activeCount === 0) {
    actions.push({
      key: 'add_hiring_intent',
      tone: 'default',
      title: 'You have no active roles',
      detail:
        'Your page is live but shows nothing to apply to. Add a hiring intent — no job description needed.',
      to: 'hiring',
    });
  }

  if (permissions.canManageMembers && pendingInvitations > 0) {
    actions.push({
      key: 'pending_invitations',
      tone: 'default',
      title: `${pendingInvitations} invitation${pendingInvitations === 1 ? '' : 's'} not yet accepted`,
      detail: 'You can resend or cancel them.',
      to: 'team',
    });
  }

  return actions;
}

/**
 * REC-10 — everything the company home renders.
 *
 * @param {object} company     Resolved by resolveCompanyContext
 * @param {object} membership  The caller's membership, for the permission-scoped sections
 */
export async function getCompanyDashboard(company, membership) {
  const permissions = {
    canEdit: can(membership, PERMISSIONS.COMPANY_EDIT),
    canViewInterest: can(membership, PERMISSIONS.INTEREST_VIEW),
    canSearch: can(membership, PERMISSIONS.CANDIDATE_SEARCH),
    canManageMembers: can(membership, PERMISSIONS.MEMBER_MANAGE),
    canManageHiring: can(membership, PERMISSIONS.HIRING_MANAGE),
  };

  /*
   * Counted concurrently — the dashboard is the first screen a recruiter sees after switching
   * company, and four sequential round trips is the difference between instant and sluggish.
   * Sections the caller may not see are not queried at all, so a viewer does not pay for them.
   */
  const [interests, hiring, memberCount, pendingInvitations] = await Promise.all([
    permissions.canViewInterest
      ? interestSummary(company._id)
      : Promise.resolve(null),
    hiringSummary(company._id),
    CompanyMember.countDocuments({ companyId: company._id, status: MEMBERSHIP_STATUS.ACTIVE }),
    permissions.canManageMembers
      ? CompanyMember.countDocuments({
          companyId: company._id,
          status: MEMBERSHIP_STATUS.INVITED,
        })
      : Promise.resolve(0),
  ]);

  const checklist = buildPublishChecklist(company);

  return {
    company: {
      id: String(company._id),
      name: company.name,
      slug: company.slug,
      status: company.status,
      logoUrl: company.logoUrl ?? null,
      tagline: company.tagline ?? null,
      isCurrentlyHiring: Boolean(company.isCurrentlyHiring),
      publishedAt: company.publishedAt ?? null,
      publicUrl: `/companies/${company.slug}`,
    },

    /** The role this response was authorised by, so the UI never guesses what to offer. */
    yourRole: membership.role,
    permissions,

    overview: {
      isPublished: company.status === COMPANY_STATUS.PUBLISHED,
      memberCount,
      activeRoles: hiring.activeCount,
      /** Null rather than 0 when withheld — "none" and "not shown to you" are different. */
      activeInterest: interests ? interests.active : null,
    },

    /** Only for someone who could act on it; REC-06 owns the same checklist at publish time. */
    setup: permissions.canEdit
      ? { canPublish: checklist.canPublish, blockers: checklist.blockers, items: checklist.items }
      : null,

    interests,
    hiring,

    pendingActions: pendingActions({
      company,
      checklist,
      interests: interests ?? { new: 0 },
      hiring,
      pendingInvitations,
      permissions,
    }),
  };
}
