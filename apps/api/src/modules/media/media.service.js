/**
 * Media storage — the profile photo write path (ADR-020).
 *
 * The security posture here rests on one rule: **the declared content type is never believed.**
 * A `Content-Type: image/webp` header costs an attacker nothing to send, so the format is decided
 * by sniffing the bytes and the stored `contentType` is whatever the SNIFF returned, not what the
 * request claimed. Everything downstream — the `Content-Type` this API later serves the file with —
 * therefore derives from the file itself.
 */

import { ApiError } from '../../lib/ApiError.js';
import { env } from '../../config/index.js';
import { MediaAsset, MEDIA_KINDS, MEDIA_MAX_BYTES } from './mediaAsset.model.js';

/**
 * Identifies an image from its leading bytes, or returns null.
 *
 * Magic numbers, not extensions and not headers. WebP needs two checks because its container is
 * RIFF: bytes 0–3 are `RIFF`, and the form type at 8–11 is what distinguishes a WebP from a WAV.
 */
export function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * The absolute URL a browser fetches this asset from.
 *
 * Absolute because `users.profilePicture` has always held an absolute URL (Google supplied one),
 * twelve surfaces drop it straight into an `<img src>`, and the API is on a different origin from
 * the web app — a relative path would resolve against the WEB host and 404.
 *
 * `API_PUBLIC_URL` is the configured answer; the request's own origin is the fallback so local
 * development needs no extra configuration. Production should set it — the refresh-cookie logic in
 * `config/env.js` already wants it for the same reason.
 */
export function mediaUrlFor(assetId, req) {
  const base =
    env.apiPublicUrl?.replace(/\/+$/, '') ??
    `${req.protocol}://${req.get('host')}`;

  return `${base}/api/media/${assetId}`;
}

/**
 * Stores (or replaces) a user's profile photo and points their `profilePicture` at it.
 *
 * Replacement is an upsert on `{ ownerUserId, kind }`, so a person who changes their photo six
 * times leaves one document behind, not six. That bound is what makes storing bytes in the
 * database defensible at all.
 *
 * @param {object} user   The owner (a Mongoose document — it is saved here)
 * @param {Buffer} buffer Raw request body
 * @param {object} req    For the URL fallback
 */
export async function storeProfilePhoto(user, buffer, req) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.validation('No image was received.', {
      photo: 'Choose an image file and try again.',
    });
  }

  if (buffer.length > MEDIA_MAX_BYTES) {
    throw ApiError.validation('That image is too large.', {
      photo: `Keep it under ${Math.round(MEDIA_MAX_BYTES / (1024 * 1024))} MB.`,
    });
  }

  /* The bytes decide, not the header. An unrecognised signature is refused outright. */
  const contentType = sniffImageType(buffer);
  if (!contentType) {
    throw ApiError.validation('That file is not an image we can use.', {
      photo: 'Upload a PNG, JPEG, or WebP image.',
    });
  }

  const asset = await MediaAsset.findOneAndUpdate(
    { ownerUserId: user._id, kind: MEDIA_KINDS.PROFILE_PHOTO },
    {
      $set: {
        contentType,
        byteLength: buffer.length,
        data: buffer,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  /*
   * The URL changes on every replacement because the id does not — so a cache-busting suffix is
   * needed for the browser to notice a new photo at the same address. `updatedAt` is already the
   * exact moment it changed.
   */
  user.profilePicture = `${mediaUrlFor(asset._id, req)}?v=${asset.updatedAt.getTime()}`;
  await user.save();

  return { url: user.profilePicture, contentType, byteLength: buffer.length };
}

/** Removes the photo and clears the pointer. Idempotent — removing nothing is not an error. */
export async function removeProfilePhoto(user) {
  await MediaAsset.deleteOne({ ownerUserId: user._id, kind: MEDIA_KINDS.PROFILE_PHOTO });

  /*
   * Only clears a pointer INTO this API. A Google avatar is not ours to remove, and blanking it
   * would silently discard the only photo an account that never uploaded one has.
   */
  if ((user.profilePicture ?? '').includes('/api/media/')) {
    user.profilePicture = '';
    await user.save();
  }

  return { removed: true, profilePicture: user.profilePicture || null };
}

/**
 * One asset's bytes, for the streaming route.
 *
 * `+data` is explicit: the field is `select: false` precisely so that only this path pays for it.
 *
 * `.lean()` is kept — this is the hottest read in the API, since a recruiter's pipeline renders
 * dozens of avatars at once, and hydrating a Mongoose document to send bytes is pure overhead. The
 * cost of `lean` is that `data` arrives as the driver's BSON `Binary` rather than a Node `Buffer`,
 * and `res.end()` accepts only the latter — it throws `ERR_INVALID_ARG_TYPE` on a `Binary`. So the
 * conversion happens here, once, rather than being a trap for every future caller.
 */
export async function findAssetWithData(assetId) {
  const asset = await MediaAsset.findById(assetId).select('+data').lean();
  if (!asset) return null;

  /* `Binary` exposes the bytes as `.buffer`; a real Buffer passes through untouched. */
  if (!Buffer.isBuffer(asset.data)) {
    asset.data = Buffer.from(asset.data?.buffer ?? asset.data ?? []);
  }

  return asset;
}

/** Every asset a user owns — used by the deletion purge. */
export async function removeAssetsForUser(userId) {
  const result = await MediaAsset.deleteMany({ ownerUserId: userId });
  return result.deletedCount ?? 0;
}
