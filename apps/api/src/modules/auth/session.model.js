/**
 * sessions — refresh-token store, backing rotation and reuse detection (ADR-005).
 *
 * The raw refresh token lives only in the client's httpOnly cookie. Here we keep its SHA-256
 * hash. Each session belongs to a `familyId`; presenting an already-rotated token means the
 * token leaked, so the whole family is revoked.
 */

import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    /** Shared across a rotation chain. Reuse of any link revokes the entire family. */
    familyId: { type: mongoose.Schema.Types.ObjectId, required: true },

    refreshTokenHash: { type: String, required: true },

    expiresAt: { type: Date, required: true },

    /**
     * Lifetime this family was created with. Carried across rotations so a short
     * ("remember me" unticked) session cannot silently become a long one (AUTH-04).
     */
    ttlDays: Number,
    revokedAt: Date,
    revokedReason: {
      type: String,
      enum: ['rotated', 'logout', 'reuse_detected', 'password_change', 'admin'],
    },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },

    userAgent: String,
    ip: String,
  },
  // NOT 'sessions': that collection name is already used by the Evallo platform for tutoring
  // sessions. Auth refresh-token sessions live in their own collection to avoid any collision,
  // including the TTL index (which would otherwise risk deleting unrelated documents).
  { timestamps: true, collection: 'authSessions' },
);

sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ familyId: 1 });
// TTL: Mongo removes the document once it expires, keeping the collection self-pruning.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
