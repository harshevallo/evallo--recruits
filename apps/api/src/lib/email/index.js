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
