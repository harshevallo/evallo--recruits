/**
 * Candidate profile service — the candidate capability (ADR-001, ADR-011).
 *
 * All candidate business logic lives here; the controller only translates HTTP. Completeness and
 * next steps are DERIVED on read, never stored: a denormalised score would drift from the profile
 * the moment any section changed (the failure mode ADR-008 warns about for facets).
 */

import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { CandidateProfile } from './candidateProfile.model.js';
import {
  getBuilderState,
  saveSection as saveBuilderSection,
} from './builder.service.js';
import {
  getPreview,
  publishProfile,
  updateVisibility,
  blockCompany,
  unblockCompany,
  listBlockedCompanies,
} from './visibility.service.js';
import {
  getCompanyRelationship,
  saveCompany,
  unsaveCompany,
  consentDisclosure,
  submitInterest,
  listInterests,
  withdrawInterest,
} from './candidateInterest.service.js';
import {
  listConversations,
  getConversation,
  replyToConversation,
  reportConversation,
} from '../messaging/messaging.service.js';

/**
 * Sections CAN-01 reports on (PRD §18.3 — "profile completeness by section").
 *
 * Only sections the profile can actually hold today. Experience, education, credentials, scores,
 * and media arrive with the profile builder (CAN-02/M3); listing them now would report a
 * permanently incomplete profile and make the indicator useless.
 */
const SECTIONS = Object.freeze([
  {
    key: 'headline',
    label: 'Professional headline',
    hint: 'One line recruiters see first.',
    isComplete: (p) => Boolean(p.headline?.trim()),
  },
  {
    key: 'summary',
    label: 'Introduction',
    hint: 'Two to four sentences about how you teach.',
    isComplete: (p) => Boolean(p.summary?.trim()),
  },
  {
    key: 'targetRoles',
    label: 'Target roles',
    hint: 'The education roles you are open to.',
    isComplete: (p) => (p.targetRoles?.length ?? 0) > 0,
  },
  {
    key: 'subjects',
    label: 'Subjects and expertise',
    hint: 'What you teach, so the right companies find you.',
    isComplete: (p) => (p.subjects?.length ?? 0) > 0,
  },
]);

/**
 * Completeness by section.
 *
 * PRD §18.3 requires improvement guidance based on **missing structured data, not opaque
 * scoring** — so this returns which named sections are missing, and the percentage is only a
 * summary of that list rather than a hidden quality score.
 */
export function buildCompleteness(profile) {
  const sections = SECTIONS.map(({ key, label, hint, isComplete }) => ({
    key,
    label,
    hint,
    complete: isComplete(profile),
  }));

  const completed = sections.filter((s) => s.complete).length;

  return {
    sections,
    completed,
    total: sections.length,
    percent: Math.round((completed / sections.length) * 100),
  };
}

/**
 * The ordered "pending actions" CAN-01 shows.
 *
 * Ordered by what unblocks the candidate soonest: fill the profile, then make it discoverable.
 * Publishing is deliberately last — PRD §4.3 makes visibility the candidate's choice, so it is
 * never presented before there is something worth showing.
 */
export function buildNextSteps(profile, completeness) {
  const steps = [];

  for (const section of completeness.sections) {
    if (!section.complete) {
      steps.push({
        key: `complete-${section.key}`,
        title: `Add your ${section.label.toLowerCase()}`,
        description: section.hint,
        target: 'profile',
      });
    }
  }

  if (profile.status === CANDIDATE_VISIBILITY.DRAFT) {
    steps.push({
      key: 'choose-visibility',
      title: 'Choose who can find you',
      description:
        'Your profile is a draft, so it is not discoverable and cannot be shared with a company yet.',
      target: 'visibility',
    });
  }

  if (profile.status === CANDIDATE_VISIBILITY.PAUSED) {
    steps.push({
      key: 'resume-visibility',
      title: 'Resume your visibility',
      description:
        'You are hidden from new searches. Companies you already shared with keep their access.',
      target: 'visibility',
    });
  }

  return steps;
}

/** @returns {Promise<import('mongoose').Document|null>} */
export function findByUserId(userId) {
  return CandidateProfile.findOne({ userId });
}

/**
 * CAN-01 payload: the profile plus everything derived from it.
 *
 * One call, because every part is a projection of the same document — splitting it would mean
 * several round trips that can disagree with each other.
 */
export async function getCandidateHome(userId) {
  const profile = await findByUserId(userId);
  if (!profile) throw ApiError.notFound('You have not created a candidate profile yet.');

  const completeness = buildCompleteness(profile);

  return {
    profile: profile.toOwnerView(),
    completeness,
    nextSteps: buildNextSteps(profile, completeness),
  };
}

/**
 * Starts a candidate profile. This is the ONLY thing that makes someone a candidate — it adds a
 * capability without changing who they are, and leaves every company membership untouched.
 *
 * Idempotent: returning the existing profile is friendlier than a conflict, and the unique index
 * on `userId` means a duplicate was never possible anyway.
 *
 * @returns {Promise<{ profile: object, created: boolean }>}
 */
/** Loads the caller's profile or fails — every builder path needs it. */
async function requireProfile(userId) {
  const profile = await findByUserId(userId);
  if (!profile) throw ApiError.notFound('You have not created a candidate profile yet.');
  return profile;
}

/** CAN-02 — the builder state for this candidate. */
export async function getBuilder(userId) {
  return getBuilderState(await requireProfile(userId));
}

/**
 * CAN-02 — save one section, then return the refreshed builder state.
 *
 * Returning the new state rather than just an acknowledgement matters: answering `targetRoles`
 * can reveal role-specific questions (PRD §20.2), so the client must re-render from the server's
 * view rather than guess which questions now apply.
 */
export async function saveSection(userId, sectionKey, values) {
  const profile = await requireProfile(userId);

  const { errors } = await saveBuilderSection(profile, sectionKey, values);
  if (errors) return { errors, builder: null };

  return { errors: null, builder: await getBuilderState(profile) };
}

/* ── CAN-03 preview · CAN-04 visibility ────────────────────────────────────────────────────── */

export async function getProfilePreview(user) {
  return getPreview(await requireProfile(user._id), user);
}

export async function publish(user, status) {
  const profile = await publishProfile(await requireProfile(user._id), status);
  return getPreview(profile, user);
}

export async function setVisibility(user, input) {
  const profile = await updateVisibility(await requireProfile(user._id), input);
  return {
    visibility: {
      status: profile.status,
      contactVisibility: profile.contactVisibility,
      publishedAt: profile.publishedAt ?? null,
    },
    blockedCompanies: await listBlockedCompanies(profile),
  };
}

export async function getVisibility(user) {
  const profile = await requireProfile(user._id);
  return {
    visibility: {
      status: profile.status,
      contactVisibility: profile.contactVisibility,
      publishedAt: profile.publishedAt ?? null,
    },
    blockedCompanies: await listBlockedCompanies(profile),
    /** Naming what still blocks publication keeps CAN-04 honest about why a change was refused. */
    publishBlockers: (await getBuilderState(profile)).publishBlockers,
  };
}

export async function blockCompanyForUser(user, companyId) {
  const profile = await blockCompany(await requireProfile(user._id), companyId);
  return listBlockedCompanies(profile);
}

export async function unblockCompanyForUser(user, companyId) {
  const profile = await unblockCompany(await requireProfile(user._id), companyId);
  return listBlockedCompanies(profile);
}

/* ── CAN-06 save · CAN-07 interest · CAN-08 my interests ───────────────────────────────────── */

export async function getCompanyRelationshipForUser(user, slug) {
  return getCompanyRelationship(await requireProfile(user._id), slug);
}

export async function saveCompanyForUser(user, slug) {
  return saveCompany(await requireProfile(user._id), slug);
}

export async function unsaveCompanyForUser(user, slug) {
  return unsaveCompany(await requireProfile(user._id), slug);
}

export async function getConsentDisclosure(user) {
  return consentDisclosure(await requireProfile(user._id));
}

export async function submitInterestForUser(user, slug, input) {
  return submitInterest(await requireProfile(user._id), user, slug, input);
}

export async function listInterestsForUser(user) {
  return listInterests(await requireProfile(user._id));
}

export async function withdrawInterestForUser(user, interestId) {
  return withdrawInterest(await requireProfile(user._id), interestId);
}

/* ── CAN-09 messages ───────────────────────────────────────────────────────────────────────── */

export async function listConversationsForUser(user) {
  return listConversations(await requireProfile(user._id));
}

export async function getConversationForUser(user, conversationId) {
  return getConversation(await requireProfile(user._id), conversationId);
}

export async function replyForUser(user, conversationId, body) {
  return replyToConversation(await requireProfile(user._id), user, conversationId, body);
}

export async function reportConversationForUser(user, conversationId, reason) {
  return reportConversation(await requireProfile(user._id), conversationId, reason);
}

export async function createCandidateProfile(userId, input = {}) {
  const existing = await findByUserId(userId);
  if (existing) return { profile: existing.toOwnerView(), created: false };

  const profile = await CandidateProfile.create({
    userId,
    headline: input.headline,
    lastActiveAt: new Date(),
  });

  return { profile: profile.toOwnerView(), created: true };
}
