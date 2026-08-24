/**
 * `mediaAssets` — uploaded binary owned by a user. Today that means profile photos (ADR-020).
 *
 * ── Bytes in MongoDB, and the honest reason ───────────────────────────────────────────────────
 *
 * `12_KNOWN_ISSUES.md` I-15 says storage "must be object storage with pre-signed URLs". ADR-020
 * records the CTO's decision to ship this in Mongo first instead: there is no bucket and no
 * credentials, and a profile photo that cannot be uploaded is a worse product than one served from
 * a collection. The trade-off is real and written down there, not glossed here.
 *
 * Three things keep the cost of that decision small:
 *
 *   · **The client downscales before uploading.** A photo arrives as a ≤512px WebP, typically
 *     40–150 KB — not the 4 MB straight off a phone camera. The 2 MB cap below is headroom, not
 *     the expected size.
 *   · **One asset per owner per kind.** Replacing a photo deletes the previous document, so the
 *     collection grows with PEOPLE, not with uploads.
 *   · **`data` is `select: false`.** A listing or an ownership check never pulls the bytes into
 *     memory; only the route that streams them asks for it.
 *
 * ── Migration shape ───────────────────────────────────────────────────────────────────────────
 *
 * `users.profilePicture` stores a URL, exactly as it did when Google was the only source. Moving
 * to R2 or S3 later changes what new URLs point at and leaves every existing one working, because
 * `GET /api/media/:id` can keep serving from this collection for as long as rows remain. No
 * consumer of `profilePicture` — and there are twelve — needs to know where the bytes live.
 */

import mongoose from 'mongoose';

/** What an asset is FOR. One kind today; the field exists so a second does not need a migration. */
export const MEDIA_KINDS = Object.freeze({
  PROFILE_PHOTO: 'profile_photo',
});

/**
 * Formats accepted for storage.
 *
 * The browser re-encodes every upload to WebP (or JPEG where WebP encoding is unavailable), so in
 * practice only those two arrive. PNG is accepted as well so a future client that skips the
 * re-encode is not silently rejected. GIF is deliberately absent: an animated avatar is a
 * distraction on a recruiter's screen and the frames would multiply what this collection stores —
 * the client accepts a `.gif` from the file picker and flattens it to a still WebP before it ever
 * reaches here.
 */
export const MEDIA_CONTENT_TYPES = Object.freeze(['image/webp', 'image/jpeg', 'image/png']);

/** 2 MB. Generous for a 512px WebP; small enough that a document can never approach Mongo's 16 MB. */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

const mediaAssetSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    kind: {
      type: String,
      required: true,
      enum: Object.values(MEDIA_KINDS),
      default: MEDIA_KINDS.PROFILE_PHOTO,
    },

    contentType: { type: String, required: true, enum: MEDIA_CONTENT_TYPES },
    byteLength: { type: Number, required: true, max: MEDIA_MAX_BYTES },

    /**
     * The bytes.
     *
     * `select: false` so nothing loads them by accident — ownership checks, deletion and the
     * account export all work on the metadata alone. Only the streaming route asks for `+data`.
     */
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true, collection: 'mediaAssets' },
);

/**
 * One asset per owner per kind.
 *
 * The uniqueness is what makes "replace your photo" bounded: an upload removes the previous row
 * rather than accumulating a history nobody asked for and every deletion request would have to
 * find later.
 */
mediaAssetSchema.index({ ownerUserId: 1, kind: 1 }, { unique: true });

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);
