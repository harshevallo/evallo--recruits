/**
 * Media HTTP handlers — the profile photo write path and the byte-serving read path (ADR-020).
 */

import mongoose from 'mongoose';
import { sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { getUserCapabilities } from '../users/capability.service.js';
import { findAssetWithData, storeProfilePhoto, removeProfilePhoto } from './media.service.js';

/**
 * `GET /api/media/:assetId` — streams one asset's bytes.
 *
 * ── Why this is unauthenticated ───────────────────────────────────────────────────────────────
 *
 * Because an `<img src>` cannot send an Authorization header. The twelve surfaces that render
 * `profilePicture` are plain `<img>` tags in six different authorization contexts — the candidate's
 * own settings, a recruiter's pipeline, a share link opened by a stranger with no account. Gating
 * the bytes would mean re-deriving all six from a request that carries only an id.
 *
 * That is acceptable **only because of what a profile photo is**: the picture a person chose to
 * represent themselves to employers. It is not withheld data. The privacy rules in PRD §21.2 are
 * about what is *linked* to a photo — a name, a location, a salary expectation — and none of that
 * is reachable from here. The id is a 96-bit ObjectId, so the URL is not guessable in bulk, and it
 * is only ever handed out inside a response that already passed an authorization check.
 *
 * What follows from that reasoning is the header block below: an asset is served with
 * `noindex` so it cannot become a search result, and cached `private` so no shared proxy retains
 * it. It is exactly as visible as the URL it was disclosed in, and no more.
 */
export async function serveAsset(req, res) {
  const { assetId } = req.params;

  /* An unparseable id is a 404, not a 500 — and reads identically to an id that does not exist. */
  if (!mongoose.isValidObjectId(assetId)) throw ApiError.notFound('Image not found.');

  const asset = await findAssetWithData(assetId);
  if (!asset) throw ApiError.notFound('Image not found.');

  /*
   * `contentType` was decided by sniffing the bytes on upload, never by a client header, and the
   * schema constrains it to three image types. `nosniff` then stops a browser second-guessing it.
   */
  res.set('Content-Type', asset.contentType);
  res.set('Content-Length', String(asset.byteLength));
  res.set('X-Content-Type-Options', 'nosniff');

  /*
   * `private` keeps it out of shared caches while still letting the user's own browser reuse it —
   * which matters, because a recruiter's pipeline screen renders dozens of these at once. A
   * replacement upload appends a new `?v=` to the stored URL, so a long max-age never serves a
   * stale photo.
   */
  res.set('Cache-Control', 'private, max-age=604800');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  /* ETag lets a repeat visit come back 304 with no body at all. */
  res.set('ETag', `"${asset._id}-${new Date(asset.updatedAt).getTime()}"`);

  return res.end(asset.data);
}

/** Rebuilds the standard `/api/me` envelope, so the client can update its user state in one hop. */
async function meResponse(user) {
  const capabilities = await getUserCapabilities(user._id);
  return { user: user.toPublicProfile(), capabilities };
}

async function currentUser(req) {
  const user = await User.findById(req.authUser.userId);
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/**
 * `POST /api/me/photo` — the raw image IS the request body.
 *
 * Not multipart. A photo upload carries exactly one file and no fields, so `multipart/form-data`
 * would add a parser dependency and a boundary-parsing attack surface to encode nothing. The
 * browser sends the `Blob` directly; `express.raw()` hands over a Buffer.
 */
export async function uploadPhoto(req, res) {
  const user = await currentUser(req);
  await storeProfilePhoto(user, req.body, req);
  return sendSuccess(res, await meResponse(user));
}

/** `DELETE /api/me/photo` — removes the asset and clears the pointer. Idempotent. */
export async function deletePhoto(req, res) {
  const user = await currentUser(req);
  await removeProfilePhoto(user);
  return sendSuccess(res, await meResponse(user));
}
