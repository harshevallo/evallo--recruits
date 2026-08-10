/**
 * users — the global human identity (ADR-001).
 *
 * One account per person. NO candidate/recruiter role: candidate capability comes from a
 * CandidateProfile, recruiter capability from a CompanyMember. `platformRole` is only for Evallo
 * staff access.
 *
 * Passwords are stored ONLY as a bcrypt hash. Social identities store the provider's stable id
 * (googleId / microsoftId) for lookup — never the provider's token.
 */

import mongoose from 'mongoose';
import { USER_STATUS } from '@evallo/shared';

export const PLATFORM_ROLES = Object.freeze({
  MEMBER: 'member',
  SUPPORT: 'support',
  ADMIN: 'admin',
});

export const AUTH_PROVIDERS = Object.freeze({
  PASSWORD: 'password',
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },

    email: { type: String, required: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },

    /** Absent for social-only accounts. Never selected by default. */
    passwordHash: { type: String, select: false },

    /** How the account was first created. A user may later link more (password + google). */
    provider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      default: AUTH_PROVIDERS.PASSWORD,
    },

    // No default: absent (undefined) for password accounts. A `null` default would defeat the
    // partial index below and make every password account collide on the same null value.
    googleId: { type: String },
    microsoftId: { type: String },

    profilePicture: String,

    platformRole: {
      type: String,
      enum: Object.values(PLATFORM_ROLES),
      default: PLATFORM_ROLES.MEMBER,
    },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },

    // Personal profile layer (PRD §4.1).
    headline: String,

    /**
     * Account-level contact number. SET-01 "account identity", not professional profile content.
     *
     * Never returned on any recruiter-facing surface: the candidate's own contact rules
     * (`contactVisibility`) decide what a company sees, and this field is not part of that path.
     */
    phone: String,

    /**
     * Notification preferences — PRD §15 / §9 "digest frequencies immediate / daily / weekly / off"
     * and per-channel control.
     *
     * A map keyed by event, each with an email and an in-app switch. Absent keys fall back to the
     * defaults in the settings service, so adding an event type never needs a migration.
     *
     * §15 also states security notices cannot be fully disabled — enforced in the service, which
     * refuses to write a preference for them rather than storing one that would be ignored.
     */
    notificationPreferences: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    /** Set when the person asks for deletion; the account is retained until it is processed. */
    deletionRequestedAt: Date,
    location: { country: String, region: String, city: String, timezone: String },
    languages: [String],

    /**
     * Failed sign-in throttling (AUTH-04). Per-account, so an attacker cannot dodge the limit by
     * rotating IPs. Both fields reset on a successful sign-in.
     */
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    /**
     * AUTH-05 — the moment the user left the first-action router.
     *
     * Purely a "has this screen been shown" marker; it is NOT a role and NOT a capability
     * (ADR-001). Capabilities stay derived from CandidateProfile / CompanyMember. A timestamp is
     * needed because "Explore" leaves no other trace, so nothing derivable can tell a returning
     * user from a brand-new one.
     */
    onboardingCompletedAt: Date,

    lastLoginAt: Date,
    deletedAt: Date,
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ email: 1 }, { unique: true });
// Partial (not sparse): index ONLY documents where the field is a string. Password accounts
// have no googleId at all, so they are excluded and never collide. Sparse would wrongly index
// null values and collide every password account against each other.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
userSchema.index(
  { microsoftId: 1 },
  { unique: true, partialFilterExpression: { microsoftId: { $type: 'string' } } },
);
userSchema.index({ status: 1, createdAt: -1 });

/** Shape sent to the client. Never returns passwordHash, provider ids, or moderation fields. */
userSchema.methods.toPublicProfile = function toPublicProfile() {
  return {
    id: String(this._id),
    email: this.email,
    emailVerified: this.emailVerified,
    name: this.name ?? null,
    profilePicture: this.profilePicture ?? null,
    provider: this.provider,
    platformRole: this.platformRole,
    headline: this.headline ?? null,
    location: this.location ?? null,
    onboardingCompletedAt: this.onboardingCompletedAt ?? null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
