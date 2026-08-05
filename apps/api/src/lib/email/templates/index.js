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
