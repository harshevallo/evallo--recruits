/** SET-01 account settings endpoints. Personal surface — every query is scoped to `req.authUser`. */

import { z } from 'zod';
import { sendSuccess } from '../../lib/response.js';
import * as settings from './settings.service.js';

/** Mirrors the sign-up rule, so a password changed here is as strong as one set at sign-up. */
const password = z.string().min(8, 'Use at least 8 characters').max(200);

export const changePasswordValidation = {
  body: z
    .object({
      currentPassword: z.string().min(1, 'Enter your current password').max(200),
      newPassword: password,
      confirmPassword: z.string().min(1, 'Confirm your new password').max(200),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Those passwords do not match',
    }),
};

export const notificationPreferencesValidation = {
  body: z.object({
    /** `{ eventKey: { email, inApp } }`. Unknown keys are ignored by the service. */
    preferences: z.record(
      z.string().max(60),
      z.object({ email: z.boolean(), inApp: z.boolean() }),
    ),
  }),
};

export const deleteAccountValidation = {
  body: z.object({ password: z.string().max(200).optional() }),
};

/** GET /api/me/settings/notifications */
export async function getNotifications(req, res) {
  return sendSuccess(res, await settings.getNotificationPreferences(req.authUser.userId));
}

/** PATCH /api/me/settings/notifications */
export async function patchNotifications(req, res) {
  return sendSuccess(
    res,
    await settings.updateNotificationPreferences(req.authUser.userId, req.body.preferences),
  );
}

/** POST /api/me/settings/password */
export async function postPassword(req, res) {
  return sendSuccess(
    res,
    await settings.changePassword(req.authUser.userId, req.authUser.sessionId, req.body),
  );
}

/** GET /api/me/settings/sessions */
export async function getSessions(req, res) {
  return sendSuccess(
    res,
    await settings.listSessions(req.authUser.userId, req.authUser.sessionId),
  );
}

/** POST /api/me/settings/sessions/sign-out-others */
export async function postSignOutOthers(req, res) {
  return sendSuccess(res, await settings.signOutOtherSessions(req.authUser.userId));
}

/** GET /api/me/settings/sign-in-methods */
export async function getSignInMethods(req, res) {
  return sendSuccess(res, await settings.listSignInMethods(req.authUser.userId));
}

/**
 * GET /api/me/settings/export
 *
 * Sent as a download rather than a JSON envelope: the point is a file the person keeps, and wrapping
 * it in `{ success, data }` would make them unwrap the envelope before it was usable.
 */
export async function getExport(req, res) {
  const payload = await settings.exportAccountData(req.authUser.userId);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evallo-recruit-data.json"');
  return res.status(200).send(JSON.stringify(payload, null, 2));
}

/** POST /api/me/settings/delete */
export async function postDeleteAccount(req, res) {
  return sendSuccess(
    res,
    await settings.requestAccountDeletion(req.authUser.userId, { password: req.body.password }),
  );
}
