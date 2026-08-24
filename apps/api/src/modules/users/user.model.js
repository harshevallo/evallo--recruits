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
     * Which country's dialling code `phone` carries — ISO 3166-1 alpha-2.
     *
     * Not redundant with the string, and not derivable from it. Calling codes are SHARED: `+1`
     * covers the US, Canada and twenty-four other NANP territories, `+44` covers the UK plus
     * Jersey, Guernsey and the Isle of Man, `+7` covers Russia and Kazakhstan. So "+1 5551234567"
     * cannot tell you which country the person selected, and a picker that had to re-derive it
     * would silently show the wrong flag on every reload.
     *
     * `phone` keeps its existing meaning and format — the complete number as a human reads it back
     * — so the data export, the deletion purge and its validation are all unchanged. This field only
     * disambiguates the selection.
     */
    phoneCountry: String,

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

    /**
     * TEACHING languages — "languages you teach in" (CAN-02, question `languages`).
     *
     * A recruiter search facet (`search.service.js`), a stated match reason, and the "Teaches in …"
     * line on every portfolio. Owned by the profile builder. Its vocabulary is `LANGUAGE_OPTIONS`,
     * weighted to the pilot's markets on purpose — a tutor teaching in Tamil is who it is for.
     */
    languages: [String],

    /**
     * ACCOUNT languages — "languages you speak" (SET-01).
     *
     * A separate field, not a second view of `languages`, and the separation is load-bearing.
     * Settings and the builder used to edit the SAME array: giving Settings a curated global list
     * would have made a Tamil teacher's teaching language invisible there and unremovable, and
     * would have written values into a search facet that `search.schema.js` rejects.
     *
     * Nothing consumes this yet — it records a stated preference. It is deliberately NOT wired into
     * search or the portfolio, because "speaks" and "teaches in" are different claims and a
     * recruiter filtering on teaching language must not match on the other.
     */
    accountLanguages: [String],

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

/**
 * Shape sent to the client. Never returns passwordHash, provider ids, or moderation fields.
 *
 * "Public" here means "safe to send to THIS account", not "safe to publish". Every caller is the
 * owner's own session — sign-in, token refresh, and `GET /api/me` — which is what makes `phone`
 * appropriate to include. The recruiter-facing rendering is `CandidateProfile.toRecruiterView()`,
 * a separate serialiser that receives an explicit list of viewer fields and has never carried a
 * phone number; nothing here reaches it.
 *
 * `phone` and `phoneCountry` were added 2026-08-24. Their absence was the read half of a field
 * that did not work in either direction: SET-01 rendered a phone input, this method never sent the
 * stored value back so the input always looked empty, and `updateUserProfile`'s allowlist then
 * dropped whatever was typed into it.
 */
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
    phone: this.phone ?? null,
    phoneCountry: this.phoneCountry ?? null,
    location: this.location ?? null,
    languages: this.languages ?? [],
    accountLanguages: this.accountLanguages ?? [],
    onboardingCompletedAt: this.onboardingCompletedAt ?? null,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
