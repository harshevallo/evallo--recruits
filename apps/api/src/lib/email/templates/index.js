/**
 * Email templates — content only, no delivery logic.
 *
 * Every template returns { subject, text, html }. Business code never builds a message body;
 * it names a template and passes data. Adding a new email means adding a file here.
 */

import { renderHtml } from './layout.js';

const greeting = (name) => (name ? `Hi ${name},` : 'Hi,');

/** AUTH-01/03 — confirm ownership of the address used at signup. */
export function verificationTemplate({ name, url }) {
  return {
    subject: 'Verify your email · Evallo Recruit',
    text: `${greeting(name)}

Confirm your email address to finish setting up your Evallo Recruit account:

${url}

This link expires in 24 hours and can only be used once.
If you didn't create an account, you can safely ignore this email.`,
    html: renderHtml({
      heading: 'Verify your email',
      body: `<p>${greeting(name)}</p>
             <p>Confirm your email address to finish setting up your Evallo Recruit account.</p>`,
      action: { label: 'Verify my email', url },
      footNote:
        'This link expires in 24 hours and can only be used once. If you didn’t create an account, you can safely ignore this email.',
    }),
  };
}

/** AUTH-11/12 — password reset link. */
export function passwordResetTemplate({ name, url }) {
  return {
    subject: 'Reset your password · Evallo Recruit',
    text: `${greeting(name)}

Reset your Evallo Recruit password using the link below:

${url}

This link expires in 1 hour.
If you didn't request this, ignore this email — your password will not change.`,
    html: renderHtml({
      heading: 'Reset your password',
      body: `<p>${greeting(name)}</p>
             <p>Use the button below to choose a new password.</p>`,
      action: { label: 'Reset my password', url },
      footNote:
        'This link expires in 1 hour. If you didn’t request a reset, ignore this email — your password will not change.',
    }),
  };
}

/**
 * Sent when an account deletion is requested — the way back during the grace period.
 *
 * It doubles as the security notice for the request itself: if someone else triggered the
 * deletion, this email is how the owner finds out while there is still time to reverse it. That is
 * why it states the date the data is actually processed rather than a vague "soon".
 */
export function accountDeletionRequestedTemplate({ name, url, purgeOnDate, graceDays }) {
  return {
    subject: 'Your Evallo Recruit account is scheduled for deletion',
    text: `${greeting(name)}

We received a request to delete your Evallo Recruit account.

Your account is now closed and you cannot sign in. On ${purgeOnDate} your profile and
your professional content will be permanently deleted. This cannot be undone.

Changed your mind, or didn't request this? Restore your account with the link below:

${url}

The link works for ${graceDays} days, until ${purgeOnDate}.`,
    html: renderHtml({
      heading: 'Your account is scheduled for deletion',
      body: `<p>${greeting(name)}</p>
             <p>We received a request to delete your Evallo Recruit account. It is now closed, and
                you cannot sign in.</p>
             <p>On <strong>${purgeOnDate}</strong> your profile and professional content will be
                permanently deleted. That cannot be undone.</p>
             <p>If you changed your mind — or you did not request this — you can restore your
                account.</p>`,
      action: { label: 'Restore my account', url },
      footNote: `This link works for ${graceDays} days, until ${purgeOnDate}. If you did want to delete your account, no action is needed.`,
    }),
  };
}

/**
 * REC-07 — invite a teammate into a company.
 *
 * `url` points at REC-01's screen rather than a one-click accept link: the invitation is claimed
 * by whoever proves they own the address, so acceptance has to happen behind authentication.
 */
export function companyInvitationTemplate({ name, companyName, inviterName, url }) {
  const inviter = inviterName ? `${inviterName} has` : 'You have been';
  return {
    subject: `You're invited to join ${companyName} · Evallo Recruit`,
    text: `${greeting(name)}

${inviter} invited you to join ${companyName} on Evallo Recruit.

Accept the invitation:
${url}

If you weren't expecting this, you can ignore this email.`,
    html: renderHtml({
      heading: `Join ${companyName}`,
      body: `<p>${greeting(name)}</p>
             <p>${inviter} invited you to join <strong>${companyName}</strong> on Evallo Recruit.</p>`,
      action: { label: 'Accept invitation', url },
      footNote: 'If you weren’t expecting this invitation, you can ignore this email.',
    }),
  };
}
