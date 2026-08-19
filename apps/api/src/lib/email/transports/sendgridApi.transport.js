/**
 * SendGrid HTTP API transport.
 *
 * Same service as the SMTP transport, different door: `https://api.sendgrid.com` over 443 rather
 * than an SMTP port. That is the entire reason it exists. Several hosting providers — Render among
 * them — block outbound SMTP to limit spam, which is indistinguishable from SendGrid being down:
 * the connection simply never completes. Nothing blocks 443, because blocking it would break the
 * platform itself.
 *
 * Settings (the same values the SMTP transport uses, so switching is one variable):
 *   MAIL_PROVIDER=sendgrid_api
 *   EMAIL_PASS=<SendGrid API key>     — sent as a Bearer token, never logged
 *   EMAIL_SENDER=Evallo Recruit <noreply@yourdomain.com>
 *
 * `EMAIL_HOST`, `EMAIL_PORT` and `EMAIL_USER` are ignored here; there is no SMTP conversation.
 */

import { env } from '../../../config/env.js';
import { logger } from '../../logger.js';

const ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

/** How long a single API call may take before we give up. EmailService bounds this again. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `Name <address@host>` → `{ email, name }`; a bare address → `{ email }`.
 *
 * SendGrid's API takes the two parts separately, unlike SMTP which accepts the combined header.
 * A malformed value degrades to using the whole string as the address, so a bad `EMAIL_SENDER`
 * surfaces as SendGrid's own 400 explaining the problem rather than a silent mangling here.
 */
export function parseSender(value) {
  const match = /^\s*(.*?)\s*<([^>]*)>\s*$/.exec(String(value ?? ''));
  if (!match) return { email: String(value ?? '').trim() };

  // Trim explicitly: `[^>]*` is greedy and keeps any whitespace sitting before the closing `>`,
  // and SendGrid rejects an address with a stray space rather than trimming it for us.
  const email = match[2].trim();
  const name = match[1].trim();
  return name ? { email, name } : { email };
}

export const sendgridApiTransport = {
  name: 'sendgrid_api',

  async send({ from, to, subject, text, html }) {
    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: parseSender(from),
      subject,
      content: [
        // Order matters to SendGrid: plain text must precede html.
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.smtp.pass}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      /*
       * SendGrid returns a JSON array of errors. Read it — a 403 here usually means the sender
       * address is not verified, which is a configuration mistake worth naming rather than a
       * generic failure. The API key is in the request headers, never in the response, so the
       * body is safe to log.
       */
      const detail = await response.text().catch(() => '');
      const error = new Error(
        `SendGrid API responded ${response.status}: ${detail.slice(0, 200)}`,
      );
      error.code = `sendgrid_${response.status}`;
      throw error;
    }

    // 202 Accepted with an empty body is the success case; the id is in a header.
    const messageId = response.headers.get('x-message-id') ?? null;
    logger.info('email sent', { to, subject, messageId, transport: 'sendgrid_api' });

    return { delivered: true, transport: 'sendgrid_api', messageId };
  },

  /** Credential probe. Does not send a message — asks what the key is allowed to do. */
  async verify() {
    const response = await fetch('https://api.sendgrid.com/v3/scopes', {
      headers: { Authorization: `Bearer ${env.smtp.pass}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`SendGrid API key rejected (${response.status})`);
    return true;
  },
};
