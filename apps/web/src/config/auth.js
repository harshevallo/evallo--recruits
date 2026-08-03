/**
 * Frontend auth configuration.
 *
 * The Google client id is public by design (it identifies the app to Google, it is not a
 * secret). When absent, the Google button renders disabled with guidance and the rest of auth
 * works normally.
 */

export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || null;

export const isGoogleConfigured = Boolean(googleClientId);
