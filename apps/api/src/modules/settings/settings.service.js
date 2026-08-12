/**
 * SET-01 account settings (PRD Appendix A, §15 notifications, §16.1 privacy and data).
 *
 * Account-level only. The candidate's PROFESSIONAL visibility — discoverability, contact rules,
 * blocked companies — stays in `candidate.service` / `candidateAccess.service`, and this module never
 * writes it. §16.1 requires one authority for who may see a candidate; a second copy of those rules
 * living under "settings" is how the two end up disagreeing.
 */

import { USER_STATUS } from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { generateVerificationToken, hashToken } from '../../lib/tokens.js';
import { sendAccountDeletionRequestedEmail } from '../../lib/email/index.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { User } from '../users/user.model.js';
import { Session } from '../auth/session.model.js';
import { VerificationToken, TOKEN_PURPOSE } from '../auth/verificationToken.model.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../candidates/candidateAnswer.model.js';
import {
  Experience,
  EducationEntry,
  Credential,
  EvidenceItem,
} from '../candidates/profileEntry.model.js';
import { SavedCompany } from '../candidates/savedCompany.model.js';
import { ExpressionOfInterest } from '../interests/expressionOfInterest.model.js';
import { Conversation } from '../messaging/conversation.model.js';
import { Message } from '../messaging/message.model.js';
import { CompanyMember } from '../memberships/companyMember.model.js';

/**
 * How long a deletion request can be reversed.
 *
 * Falls back to 30 days when no retention period is configured, so the restore link never
 * outlives — or falls short of — the window in which the data still exists.
 */
const restoreWindowDays = () => env.ACCOUNT_DELETION_RETENTION_DAYS ?? 30;

/**
 * The events a person can be notified about, and the default channels.
 *
 * `security` is present but locked: PRD §15 says security notices cannot be fully disabled, so it is
 * shown as always-on rather than offered as a switch that would be ignored.
 */
export const NOTIFICATION_EVENTS = Object.freeze([
  {
    key: 'candidate_interest',
    label: 'New candidate interest',
    description: 'Someone expressed interest in a company you belong to.',
    defaults: { email: true, inApp: true },
  },
  {
    key: 'message',
    label: 'New message',
    description: 'A new message in one of your conversations.',
    defaults: { email: true, inApp: true },
  },
  {
    key: 'company_invitation',
    label: 'Company invitation',
    description: 'You were invited to join a company, or asked to join one you manage.',
    defaults: { email: true, inApp: true },
  },
  {
    key: 'hiring_activity',
    label: 'Hiring activity',
    description: 'Pipeline and hiring-intent changes at your companies.',
    defaults: { email: false, inApp: true },
  },
  {
    key: 'profile_activity',
    label: 'Profile activity',
    description: 'A company viewed or saved your candidate profile.',
    defaults: { email: false, inApp: true },
  },
  {
    key: 'product_updates',
    label: 'Product updates',
    description: 'Occasional news about Evallo Recruit. Entirely optional.',
    defaults: { email: false, inApp: false },
  },
  {
    key: 'security',
    label: 'Security notices',
    description: 'Sign-ins from new devices, password changes, and account recovery.',
    defaults: { email: true, inApp: true },
    locked: true,
  },
]);

const LOCKED_EVENTS = new Set(
  NOTIFICATION_EVENTS.filter((event) => event.locked).map((event) => event.key),
);

/** Stored preferences merged over the defaults, so an absent key is never "off by accident". */
export function resolveNotificationPreferences(user) {
  const stored = user.notificationPreferences ?? {};

  return NOTIFICATION_EVENTS.map((event) => {
    const saved = stored[event.key] ?? {};
    return {
      key: event.key,
      label: event.label,
      description: event.description,
      locked: Boolean(event.locked),
      email: event.locked ? true : (saved.email ?? event.defaults.email),
      inApp: event.locked ? true : (saved.inApp ?? event.defaults.inApp),
    };
  });
}

export async function getNotificationPreferences(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return { events: resolveNotificationPreferences(user) };
}

/**
 * Writes preferences.
 *
 * Only known, unlocked events are stored. An unknown key is dropped rather than persisted, so the
 * stored shape always matches what the UI can actually render.
 */
export async function updateNotificationPreferences(userId, changes) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  const next = { ...(user.notificationPreferences ?? {}) };

  for (const [key, value] of Object.entries(changes ?? {})) {
    if (LOCKED_EVENTS.has(key)) {
      throw ApiError.validation('That notification cannot be switched off.', {
        [key]: 'Security notices are always sent.',
      });
    }
    if (!NOTIFICATION_EVENTS.some((event) => event.key === key)) continue;

    next[key] = {
      email: Boolean(value.email),
      inApp: Boolean(value.inApp),
    };
  }

  user.notificationPreferences = next;
  await user.save();

  return { events: resolveNotificationPreferences(user) };
}

/* ── Security ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Changes the password.
 *
 * Requires the CURRENT password even though the caller is already authenticated: a stolen session
 * must not be enough to lock the real owner out of their own account.
 *
 * Every other session is revoked afterwards (PRD §16.4) — changing a password is what someone does
 * when they think another device has access, and leaving those sessions alive defeats the point.
 */
export async function changePassword(userId, sessionId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  if (!user.passwordHash) {
    throw ApiError.validation('This account has no password yet.', {
      currentPassword: 'You signed in with Google. Set a password from the sign-in page first.',
    });
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    throw ApiError.validation('That password is not right.', {
      currentPassword: 'Incorrect password.',
    });
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw ApiError.validation('Choose a different password.', {
      newPassword: 'That is already your password.',
    });
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  await revokeAllSessions(userId, 'password_change');

  return { changed: true, otherSessionsSignedOut: true, currentSessionId: String(sessionId ?? '') };
}

/** Active sessions, newest first. Never returns a token or a hash — only where and when. */
export async function listSessions(userId, currentSessionId) {
  const sessions = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();

  return {
    sessions: sessions.map((session) => ({
      id: String(session._id),
      current: String(session._id) === String(currentSessionId),
      userAgent: session.userAgent ?? null,
      ip: session.ip ?? null,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })),
  };
}

/**
 * Signs out everywhere else.
 *
 * `revokeAllSessions` revokes this one too, so the caller's session is re-created by the refresh
 * cycle — the alternative, hand-picking which rows to revoke, is the kind of partial invalidation
 * that leaves a session alive by accident.
 */
export async function signOutOtherSessions(userId) {
  await revokeAllSessions(userId, 'logout');
  return { signedOut: true };
}

/** Which ways this account can sign in — PRD §6.3. Read-only; adding a method is an auth flow. */
export async function listSignInMethods(userId) {
  const user = await User.findById(userId).select('+passwordHash').lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  return {
    methods: [
      {
        key: 'password',
        label: 'Email and password',
        connected: Boolean(user.passwordHash),
        detail: user.email,
      },
      {
        key: 'google',
        label: 'Google',
        connected: Boolean(user.googleId),
        detail: user.googleId ? user.email : null,
      },
    ],
  };
}

/* ── Data and deletion ────────────────────────────────────────────────────────────────────── */

/**
 * Everything this account holds, as one JSON document (PRD §16.1 export).
 *
 * Own data only. Company records the person can merely SEE — other people's candidate profiles,
 * internal notes their colleagues wrote — are not theirs to export, so the company section carries
 * membership facts and nothing else.
 */
export async function exportAccountData(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  const [profile, memberships] = await Promise.all([
    CandidateProfile.findOne({ userId }).lean(),
    CompanyMember.find({ userId }).populate('companyId', 'name slug').lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      name: user.name ?? null,
      phone: user.phone ?? null,
      headline: user.headline ?? null,
      location: user.location ?? null,
      languages: user.languages ?? [],
      provider: user.provider,
      emailVerified: Boolean(user.emailVerified),
      createdAt: user.createdAt,
    },
    notificationPreferences: resolveNotificationPreferences(user),
    candidateProfile: profile
      ? {
          status: profile.status,
          headline: profile.headline ?? null,
          summary: profile.summary ?? null,
          targetRoles: profile.targetRoles ?? [],
          subjects: profile.subjects ?? [],
          learnerSegments: profile.learnerSegments ?? [],
          employmentTypes: profile.employmentTypes ?? [],
          deliveryModes: profile.deliveryModes ?? [],
          availability: profile.availability ?? null,
          yearsExperience: profile.yearsExperience ?? null,
          publishedAt: profile.publishedAt ?? null,
        }
      : null,
    companyMemberships: memberships.map((member) => ({
      company: member.companyId?.name ?? null,
      slug: member.companyId?.slug ?? null,
      role: member.role,
      status: member.status,
      joinedAt: member.acceptedAt ?? null,
    })),

    /*
     * Everything below was missing until 2026-08-12, which made this endpoint a summary rather
     * than a portable copy: a person exercising a portability right would have received none of
     * their own professional content. Each block is scoped to the caller's own candidate profile.
     */
    ...(profile ? await exportCandidateContent(profile._id) : emptyCandidateContent()),
  };
}

/** The shape returned when the person has no candidate profile — keeps the file's keys stable. */
function emptyCandidateContent() {
  return {
    questionAnswers: [],
    experiences: [],
    educationEntries: [],
    credentials: [],
    portfolioItems: [],
    savedCompanies: [],
    expressionsOfInterest: [],
    conversations: [],
  };
}

/**
 * The candidate's own content, for the data export.
 *
 * Deliberately excludes anything written ABOUT them by a company — recruiter notes and pipeline
 * records are the company's, and PRD §16.1 keeps internal notes structurally separate from
 * anything candidate-facing. Messages ARE included: the person wrote and received them.
 */
async function exportCandidateContent(candidateId) {
  const [answers, experiences, education, credentials, media, saved, interests, conversations] =
    await Promise.all([
      CandidateAnswer.find({ candidateId }).lean(),
      Experience.find({ candidateId }).sort({ sortOrder: 1 }).lean(),
      EducationEntry.find({ candidateId }).sort({ sortOrder: 1 }).lean(),
      Credential.find({ candidateId }).sort({ sortOrder: 1 }).lean(),
      EvidenceItem.find({ candidateId }).sort({ sortOrder: 1 }).lean(),
      SavedCompany.find({ candidateId }).populate('companyId', 'name slug').lean(),
      ExpressionOfInterest.find({ candidateId }).populate('companyId', 'name slug').lean(),
      Conversation.find({ candidateId }).populate('companyId', 'name slug').lean(),
    ]);

  const messages = conversations.length
    ? await Message.find({ conversationId: { $in: conversations.map((c) => c._id) } })
        .sort({ createdAt: 1 })
        .lean()
    : [];

  const strip = ({ _id, candidateId: _c, __v, ...rest }) => rest;

  return {
    questionAnswers: answers.map((a) => ({ questionKey: a.questionKey, value: a.value })),
    experiences: experiences.map(strip),
    educationEntries: education.map(strip),
    credentials: credentials.map(strip),
    portfolioItems: media.map(strip),
    savedCompanies: saved.map((s) => ({
      company: s.companyId?.name ?? null,
      slug: s.companyId?.slug ?? null,
      savedAt: s.createdAt,
    })),
    expressionsOfInterest: interests.map((interest) => ({
      company: interest.companyId?.name ?? null,
      slug: interest.companyId?.slug ?? null,
      status: interest.status,
      message: interest.message ?? null,
      consentGrantedAt: interest.consent?.grantedAt ?? null,
      submittedAt: interest.createdAt,
    })),
    conversations: conversations.map((conversation) => ({
      company: conversation.companyId?.name ?? null,
      slug: conversation.companyId?.slug ?? null,
      startedAt: conversation.createdAt,
      messages: messages
        .filter((m) => String(m.conversationId) === String(conversation._id))
        .map((m) => ({ from: m.senderType, body: m.body, sentAt: m.createdAt })),
    })),
  };
}

/**
 * Requests deletion.
 *
 * Marks the account `deletion_pending` and revokes every session rather than erasing rows
 * immediately. PRD §16.1 requires deletion to be designed in alongside RETENTION: audit events and
 * moderation records exist precisely so that abuse can be investigated after the fact, and a
 * synchronous purge would destroy the evidence trail the same section mandates.
 *
 * The password check is the same reasoning as changePassword — a stolen session must not be able to
 * delete someone's account.
 */
export async function requestAccountDeletion(userId, { password } = {}) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');

  if (user.passwordHash) {
    if (!password) {
      throw ApiError.validation('Confirm your password to continue.', {
        password: 'Enter your password.',
      });
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.validation('That password is not right.', {
        password: 'Incorrect password.',
      });
    }
  }

  /*
   * An owner cannot walk away from a company that would be left with nobody in charge. PRD §4.1
   * requires every company to have an owner, so ownership must be transferred first (REC-09).
   */
  const ownedCompanies = await CompanyMember.find({
    userId,
    role: 'owner',
    status: 'active',
  })
    .populate('companyId', 'name')
    .lean();

  if (ownedCompanies.length > 0) {
    throw ApiError.validation('Transfer ownership before deleting your account.', {
      password: `You still own ${ownedCompanies
        .map((member) => member.companyId?.name)
        .filter(Boolean)
        .join(', ')}. Hand each one to another member first.`,
    });
  }

  user.status = USER_STATUS.DELETION_PENDING;
  user.deletionRequestedAt = new Date();
  await user.save();

  await revokeAllSessions(userId, 'admin');

  /*
   * The way back (16_RETENTION_POLICY.md §2).
   *
   * Both sign-in paths now refuse a `deletion_pending` account, which is correct but means the
   * owner cannot log in to change their mind — and cannot discover the request at all if someone
   * else made it. This token is the only route back, so it lives exactly as long as the grace
   * period does. Any earlier restore token is invalidated first: one request, one live link.
   */
  const graceDays = restoreWindowDays();
  const expiresAt = new Date(user.deletionRequestedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);

  await VerificationToken.deleteMany({ userId, purpose: TOKEN_PURPOSE.ACCOUNT_RESTORE });

  const { raw, hash } = generateVerificationToken();
  await VerificationToken.create({
    tokenHash: hash,
    purpose: TOKEN_PURPOSE.ACCOUNT_RESTORE,
    userId: user._id,
    email: user.email,
    expiresAt,
  });

  const result = await sendAccountDeletionRequestedEmail({
    to: user.email,
    name: user.name,
    url: `${env.APP_URL}/restore-account?token=${raw}`,
    purgeOnDate: expiresAt.toISOString().slice(0, 10),
    graceDays,
  });

  if (!result.delivered) {
    // Never fail the deletion request over a mail hiccup — but this one matters, so say so loudly.
    logger.error('Account-deletion notice not delivered — the user has no restore link', {
      userId: String(userId),
    });
  }

  return {
    requested: true,
    status: user.status,
    restorableUntil: expiresAt.toISOString(),
    graceDays,
  };
}

/**
 * Cancels a pending deletion using the emailed token.
 *
 * Deliberately issues **no session**: proving control of the mailbox undoes the request, and
 * signing in afterwards is a separate act with its own credential check. That keeps this endpoint
 * from becoming a passwordless back door into the account.
 */
export async function restoreAccount(rawToken) {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(rawToken),
    purpose: TOKEN_PURPOSE.ACCOUNT_RESTORE,
  });

  const invalid = ApiError.validation(
    'This restore link is not valid. It may have expired or already been used.',
  );

  if (!record) throw invalid;
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    throw invalid;
  }

  const user = await User.findById(record.userId);
  if (!user) throw invalid;

  /*
   * Only a pending deletion can be reversed. Once the purge has run the account is `deleted` and
   * the content is gone — restoring the status would produce an empty shell that looks like a
   * working account, which is worse than refusing.
   */
  if (user.status !== USER_STATUS.DELETION_PENDING) {
    await record.deleteOne();
    throw ApiError.validation('This account can no longer be restored.');
  }

  user.status = USER_STATUS.ACTIVE;
  user.deletionRequestedAt = undefined;
  await user.save();

  // Single use.
  await record.deleteOne();

  return { restored: true, email: user.email };
}
