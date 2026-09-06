/**
 * Messaging policy — who may message whom, and how much (PRD §11.2, §16.3; ADR-025).
 *
 * The messaging service asks three questions before a message exists, and this file answers them:
 *
 *   1. May this PERSON send at all?                           `assertSenderEligible`
 *   2. May they START a conversation with THAT person?        `resolveOrigin`, `blockedBetween`
 *   3. Have they hit a limit?                                 `assertNewConversationAllowance`,
 *                                                             `assertSendRate`, `closedReasonFor`
 *
 * Every rule here is about PEOPLE. A company appears only as the context a first contact is made
 * through — the recruiter found the candidate in Acme's talent search, or the candidate found the
 * recruiter on Acme's public page — and as the unit a candidate can block. It is never a reader.
 *
 * ── Who can be reached, and why these paths and no others ─────────────────────────────────────
 *
 * A first message needs a legitimate route to the other person. Two exist:
 *
 *   · **Through a company the sender works for** (`companyId` given). The sender must hold
 *     `message:send` there, and the recipient must be a candidate that company may see — the same
 *     `resolveCandidateAccess` that governs search and the viewer — or a colleague at that company.
 *     This is the recruiter → candidate path, unchanged in substance from before.
 *
 *   · **As a person at a published company** (no `companyId`). The recipient is on the HIRING TEAM
 *     of a published company — an active member whose role carries `message:send` — or has opted
 *     in to appear on that company's public page (`showOnPublicTeam`). This is the candidate →
 *     recruiter path — the half that did not exist before ADR-025. The hiring team is reachable by a
 *     signed-in candidate whether or not they chose to be shown to anonymous visitors: writing to
 *     candidates is their job, and the same people reveal their names the moment they write first.
 *     Appearing on the PUBLIC page stays opt-in, as PRD §7.4 requires.
 *
 * Anything else is "that person cannot be messaged", reported as absent rather than forbidden so
 * that the endpoint cannot be used to discover who holds an account.
 *
 * Once a conversation exists it belongs to its two people and needs no route: replying is always
 * allowed unless the thread is closed (declined, reported, blocked, or an unanswered request that
 * has reached its cap).
 */

import {
  MESSAGING_LIMITS,
  MEMBERSHIP_STATUS,
  COMPANY_STATUS,
  USER_STATUS,
  PERMISSIONS,
  ERROR_CODES,
  can,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CompanyMember } from '../memberships/companyMember.model.js';
import { Company } from '../companies/company.model.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { resolveCandidateAccess } from '../candidates/candidateAccess.service.js';
import { Conversation, CONVERSATION_STATUS } from './conversation.model.js';
import { Message } from './message.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Why a thread is closed to a particular sender right now. `null` means they may write. */
export const CLOSED_REASONS = Object.freeze({
  DECLINED: 'declined',
  REPORTED: 'reported',
  AWAITING_REPLY: 'awaiting_reply',
  BLOCKED: 'blocked',
});

/**
 * May this account send messages at all?
 *
 * A name is required because the recipient must be able to tell who is writing to them — PRD
 * §11.2 requires a first message to identify its sender's context, and a nameless request is spam
 * by another shape. Verification and an active status are the same bar every other write has.
 */
export function assertSenderEligible(user) {
  if (!user || user.status !== USER_STATUS.ACTIVE || user.deletedAt) {
    throw ApiError.forbidden('This account cannot send messages.');
  }
  if (!user.emailVerified) {
    throw ApiError.forbidden('Verify your email address before sending messages.');
  }
  if (!String(user.name ?? '').trim()) {
    throw ApiError.validation('Add your name in Settings before sending a message.', {
      body: 'The person you write to needs to know who you are.',
    });
  }
}

/** A recipient who has left, or is being deleted, is reported as unreachable — not as gone. */
export function assertRecipientEligible(user) {
  if (!user || user.status !== USER_STATUS.ACTIVE || user.deletedAt) {
    throw ApiError.notFound('That person cannot be messaged.');
  }
}

/** Every company this person is an active member of, as strings. */
export async function activeCompanyIdsOf(userId) {
  const memberships = await CompanyMember.find({ userId, status: MEMBERSHIP_STATUS.ACTIVE })
    .select('companyId')
    .lean();
  return memberships.map((membership) => String(membership.companyId));
}

/**
 * Is there a candidate block between these two people, in either direction?
 *
 * Blocking stays COMPANY-level (CAN-04, PRD §4.3): a candidate blocks an organisation, and that
 * has to bite on every person who works there or the block is decorative. So: if either person
 * has blocked a company the other is an active member of, the pair cannot message. Symmetric on
 * purpose — PRD §16.3, "blocked parties cannot message or discover the blocker" — and a blocker
 * writing to the person they blocked would be at least as strange.
 *
 * Checked on every send, not only at the start, so a block placed mid-conversation closes it.
 */
export async function blockedBetween(userA, userB) {
  const [profileA, profileB, companiesA, companiesB] = await Promise.all([
    CandidateProfile.findOne({ userId: userA }).select('blockedCompanyIds').lean(),
    CandidateProfile.findOne({ userId: userB }).select('blockedCompanyIds').lean(),
    activeCompanyIdsOf(userA),
    activeCompanyIdsOf(userB),
  ]);

  const blocks = (profile, companies) =>
    (profile?.blockedCompanyIds ?? []).some((id) => companies.includes(String(id)));

  return blocks(profileA, companiesB) || blocks(profileB, companiesA);
}

/** Accepts an id or a slug, like every company URL in this API. */
async function findCompanyByIdOrSlug(identifier) {
  return Company.findOne(
    /^[0-9a-fA-F]{24}$/.test(identifier) ? { _id: identifier } : { slug: identifier },
  )
    .select('_id status')
    .lean();
}

/**
 * The route by which a first message may reach its recipient — see the file header.
 *
 * Returns the `origin` to record on the conversation, or throws. Every refusal about the
 * RECIPIENT is a 404: confirming that a person exists but is unreachable is itself a disclosure.
 * Refusals about the SENDER's own role are 403, because they reveal nothing about anyone else.
 */
export async function resolveOrigin({ sender, recipient, companyId }) {
  if (companyId) {
    const company = await findCompanyByIdOrSlug(companyId);
    if (!company) throw ApiError.notFound('Company not found.');

    const membership = await CompanyMember.findOne({
      userId: sender._id,
      companyId: company._id,
      status: MEMBERSHIP_STATUS.ACTIVE,
    }).lean();
    // 404, not 403 — the same answer resolveCompanyContext gives a non-member.
    if (!membership) throw ApiError.notFound('Company not found.');

    if (!can(membership, PERMISSIONS.MESSAGE_SEND)) {
      throw ApiError.forbidden('Your role at this company cannot start conversations.');
    }

    /* A colleague at the same company may always be written to. */
    const colleague = await CompanyMember.exists({
      userId: recipient._id,
      companyId: company._id,
      status: MEMBERSHIP_STATUS.ACTIVE,
    });
    if (colleague) return { companyId: company._id, candidateId: null };

    /* Otherwise the recipient must be a candidate this company is allowed to see. */
    const profile = await CandidateProfile.findOne({ userId: recipient._id });
    if (!profile) throw ApiError.notFound('Candidate not found.');

    const access = await resolveCandidateAccess(profile, company._id);
    if (!access.visible) throw ApiError.notFound('Candidate not found.');

    return { companyId: company._id, candidateId: profile._id };
  }

  const reachable = await reachableCompanyOf(recipient._id);
  if (!reachable) throw ApiError.notFound('That person cannot be messaged.');

  return { companyId: reachable.companyId, candidateId: null };
}

/**
 * The published company through which a signed-in candidate may write to this person, if any.
 *
 * Two memberships qualify: one whose ROLE grants `message:send` (the hiring team — owners, admins,
 * recruiters, hiring managers) and one the person has switched `showOnPublicTeam` on for. The
 * company must be published — an unpublished page has no hiring team the public can see, so it can
 * make nobody reachable. A viewer at a company who has not opted in is not reachable: their role
 * cannot start conversations, and nothing they did invited one.
 */
export async function reachableCompanyOf(userId) {
  /* `status` is selected because `can()` fails closed on a membership without one. */
  const memberships = await CompanyMember.find({ userId, status: MEMBERSHIP_STATUS.ACTIVE })
    .select('companyId role status permissionOverrides showOnPublicTeam')
    .lean();

  const qualifying = memberships.filter(
    (membership) => membership.showOnPublicTeam || can(membership, PERMISSIONS.MESSAGE_SEND),
  );
  if (qualifying.length === 0) return null;

  const company = await Company.findOne({
    _id: { $in: qualifying.map((membership) => membership.companyId) },
    status: COMPANY_STATUS.PUBLISHED,
  })
    .select('_id')
    .lean();

  return company ? { companyId: company._id } : null;
}

/**
 * PRD §16.3 — how many NEW conversations one person may open per day.
 *
 * Counted per person against the database rather than per IP in memory, because a person is the
 * unit of abuse and this survives a restart. The limit is a `429` with the shared code, so the
 * client shows the same "slow down" treatment as every other throttle.
 */
export async function assertNewConversationAllowance(senderId) {
  const started = await Conversation.countDocuments({
    startedBy: senderId,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });

  if (started >= MESSAGING_LIMITS.NEW_CONVERSATIONS_PER_DAY) {
    throw new ApiError(
      ERROR_CODES.RATE_LIMITED,
      'You have started as many new conversations as you can today. Try again tomorrow.',
    );
  }
}

/** PRD §16.3 — how fast one person may send, across every conversation they are in. */
export async function assertSendRate(senderId) {
  const sent = await Message.countDocuments({
    senderUserId: senderId,
    createdAt: { $gte: new Date(Date.now() - MINUTE_MS) },
  });

  if (sent >= MESSAGING_LIMITS.MESSAGES_PER_MINUTE) {
    throw new ApiError(
      ERROR_CODES.RATE_LIMITED,
      'You are sending messages too quickly. Wait a moment and try again.',
    );
  }
}

/**
 * Whether — and why — this thread is closed to this sender right now. Pure; no I/O.
 *
 *   declined        the recipient declined and the sender is the one who started it
 *   reported        the thread was reported by the OTHER participant
 *   awaiting_reply  a request the recipient has not answered, and the starter has already sent
 *                   the cap; only the recipient can move it forward now
 *
 * The recipient of a request is never closed out by these: writing back is how they accept.
 */
export function closedReasonFor(conversation, senderId) {
  const me = String(senderId);
  const startedByMe = String(conversation.startedBy) === me;

  if (conversation.reportedAt && String(conversation.reportedBy ?? '') !== me) {
    return CLOSED_REASONS.REPORTED;
  }

  if (!startedByMe) return null;

  if (conversation.status === CONVERSATION_STATUS.DECLINED) return CLOSED_REASONS.DECLINED;

  if (
    conversation.status === CONVERSATION_STATUS.PENDING &&
    (conversation.messageCount ?? 0) >= MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP
  ) {
    return CLOSED_REASONS.AWAITING_REPLY;
  }

  return null;
}

/** The error a closed thread produces when someone tries to write into it anyway. */
export function closedError(reason) {
  switch (reason) {
    case CLOSED_REASONS.AWAITING_REPLY:
      return ApiError.validation('They have not replied yet.', {
        body: `You can send up to ${MESSAGING_LIMITS.PENDING_REQUEST_MESSAGE_CAP} messages before they reply.`,
      });
    case CLOSED_REASONS.DECLINED:
      return ApiError.forbidden('This person declined the conversation.');
    case CLOSED_REASONS.REPORTED:
      return ApiError.forbidden('This conversation has been reported and is closed to new messages.');
    case CLOSED_REASONS.BLOCKED:
    default:
      return ApiError.forbidden('This conversation is closed.');
  }
}
