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
import { User } from '../users/user.model.js';
import { Session } from '../auth/session.model.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { CandidateProfile } from '../candidates/candidateProfile.model.js';
import { CompanyMember } from '../memberships/companyMember.model.js';

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

  return { requested: true, status: user.status };
}
