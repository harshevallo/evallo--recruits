/**
 * verificationTokens — one collection for email verification and password reset.
 *
 * Identical lifecycle, differing only by `purpose`. The raw token is only ever in the emailed
 * link; the database keeps its hash. Single-use, expiring, and TTL-pruned.
 */

import mongoose from 'mongoose';

export const TOKEN_PURPOSE = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  /**
   * AUTH-03. Issued by verify-email once ownership is proven, consumed by set-password.
   * Short-lived: it is the only thing standing between a verified address and a new credential.
   */
  PASSWORD_SETUP: 'password_setup',
  /**
   * Cancels a pending account deletion during the grace period (16_RETENTION_POLICY.md §2).
   *
   * A deletion request revokes every session and both sign-in paths refuse the account, so the
   * owner cannot simply log in and change their mind. This token is the way back, and it
   * deliberately restores the account WITHOUT issuing a session — proving control of the mailbox
   * undoes the request; signing in is a separate step.
   */
  ACCOUNT_RESTORE: 'account_restore',
});

const verificationTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    purpose: {
      type: String,
      required: true,
      enum: Object.values(TOKEN_PURPOSE),
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true, collection: 'verificationTokens' },
);

verificationTokenSchema.index({ tokenHash: 1 }, { unique: true });
verificationTokenSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationToken = mongoose.model('VerificationToken', verificationTokenSchema);
