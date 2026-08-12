/**
 * Email entry point.
 *
 * Business code imports these named senders — it never selects a transport or builds a body.
 */

import { emailService } from './EmailService.js';

export { emailService };

/** Which transport is live (`console` or `smtp`). Reported by /api/health. */
export function activeMailProvider() {
  return emailService.activeTransport;
}

export function sendVerificationEmail({ to, name, url }) {
  return emailService.send('verification', { to, name, url });
}

export function sendPasswordResetEmail({ to, name, url }) {
  return emailService.send('passwordReset', { to, name, url });
}

export function sendCompanyInvitationEmail({ to, name, companyName, inviterName, url }) {
  return emailService.send('companyInvitation', { to, name, companyName, inviterName, url });
}

/**
 * Sent when an account deletion is requested (16_RETENTION_POLICY.md §2).
 *
 * Doubles as the security notice for the request: sign-in is already refused by the time this
 * arrives, so it is the only channel through which an owner who did NOT request the deletion can
 * discover it and reverse it.
 */
export function sendAccountDeletionRequestedEmail({ to, name, url, purgeOnDate, graceDays }) {
  return emailService.send('accountDeletionRequested', { to, name, url, purgeOnDate, graceDays });
}
