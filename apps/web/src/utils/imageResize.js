/**
 * Client-side image preparation for profile photos (ADR-020).
 *
 * ── Why the browser does this and not the server ───────────────────────────────────────────────
 *
 * A photo straight off a phone is 3–8 MB and four thousand pixels wide. It is displayed at 40px in
 * a sidebar and 128px on a portfolio. Uploading the original would mean paying for every one of
 * those bytes twice — once over the candidate's mobile connection, then permanently in a MongoDB
 * document — to store detail no screen will ever show.
 *
 * Resizing on the server instead would mean `sharp`, which is a native binary dependency, on a
 * request that currently has no CPU cost at all. The browser already has a decoder and an encoder
 * built in. Using them costs nothing, and it means the network only ever carries the bytes that are
 * actually kept.
 *
 * The server still enforces its own 2 MB ceiling and still sniffs the magic bytes. Nothing here is
 * a security control — a client can always be bypassed. This is a bandwidth and storage measure,
 * and the server assumes it did not happen.
 */

/** Longest edge of the stored image. 512 covers a 128px avatar on a 3× display with room spare. */
const MAX_EDGE = 512;

/** JPEG/WebP quality. 0.82 is where portrait artefacts stop being visible at avatar sizes. */
const QUALITY = 0.82;

/**
 * What the file picker offers.
 *
 * Broader than what gets stored, because this is about what a person might reasonably have on their
 * desktop. A GIF or a HEIC the browser can decode is flattened to a still WebP like anything else;
 * only the re-encoded result is ever uploaded.
 */
export const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic';

/** Refuse absurd inputs before decoding, so a mis-picked video does not hang a phone. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class ImagePrepError extends Error {}

/**
 * Does this browser actually produce WebP from a canvas?
 *
 * Safari added canvas WebP encoding late, and `toBlob` does not fail loudly when it cannot honour
 * the requested type — it silently returns a PNG instead. A PNG photograph is several times larger
 * than the JPEG equivalent, so the fallback has to be chosen deliberately rather than discovered
 * after the fact.
 */
function encodeType() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
}

/** Decodes a File into something drawable, without leaking the object URL on either path. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImagePrepError('That file could not be opened as an image.'));
    };

    image.src = url;
  });
}

/**
 * Reads a chosen file and returns the Blob to upload.
 *
 * Square-crops from the centre before scaling. Every surface that renders `profilePicture` draws it
 * in a circle or a square, so a rectangular source is going to be cropped by *something* — doing it
 * here means the candidate's own preview shows the same crop the recruiter will see, rather than
 * CSS silently cutting the top of their head off later.
 *
 * @param {File} file
 * @returns {Promise<{ blob: Blob, previewUrl: string, width: number, height: number }>}
 */
export async function prepareProfilePhoto(file) {
  if (!file) throw new ImagePrepError('Choose an image to upload.');

  if (!file.type.startsWith('image/')) {
    throw new ImagePrepError('That file is not an image. Choose a PNG, JPEG, or WebP.');
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImagePrepError('That image is very large. Choose one under 25 MB.');
  }

  const image = await loadImage(file);

  const sourceEdge = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceEdge) throw new ImagePrepError('That image appears to be empty.');

  /* Never scale UP — a 200px source stays 200px rather than being blurrily inflated to 512. */
  const edge = Math.min(sourceEdge, MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;

  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  /* Centre crop: take the largest square from the middle of the source, then scale it to `edge`. */
  const sx = (image.naturalWidth - sourceEdge) / 2;
  const sy = (image.naturalHeight - sourceEdge) / 2;
  context.drawImage(image, sx, sy, sourceEdge, sourceEdge, 0, 0, edge, edge);

  const type = encodeType();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new ImagePrepError('That image could not be processed.')),
      type,
      QUALITY,
    );
  });

  return {
    blob,
    /* Caller owns this and must revoke it — the components below do, on unmount and on replace. */
    previewUrl: URL.createObjectURL(blob),
    width: edge,
    height: edge,
  };
}
