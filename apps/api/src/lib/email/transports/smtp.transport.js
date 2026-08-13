/**
 * SMTP transport (nodemailer). Works with SendGrid and any other SMTP service.
 *
 * SendGrid settings:
 *   EMAIL_HOST=smtp.sendgrid.net
 *   EMAIL_PORT=465
 *   EMAIL_SECURE=true
 *   EMAIL_USER=apikey        (the literal string "apikey")
 *   EMAIL_PASS=<api key>
 *
 * Credentials are read from env only and never logged.
 */

import nodemailer from 'nodemailer';
import { env } from '../../../config/env.js';
import { logger } from '../../logger.js';

let transporter = null;

/**
 * Created lazily and reused across sends (nodemailer pools connections).
 * Building it at import time would make an unconfigured environment fail at boot even when the
 * console transport is selected.
 */
function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = env.smtp;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,

    /*
     * Explicit timeouts. Nodemailer defaults to 2 minutes to connect and 10 minutes on the socket,
     * which is not a timeout so much as a hang: a host that silently drops outbound SMTP — several
     * PaaS providers block these ports — leaves the connection opening until the client gives up.
     *
     * That is not a mail problem, it is an availability problem. Signup and password reset both
     * await delivery, so an unreachable SMTP host stops being "email is slow" and becomes "the
     * request never returns", which reads to a user as a broken signup and invites a retry that
     * collides with the account the first attempt already created.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export const smtpTransport = {
  name: 'smtp',

  async send({ from, to, subject, text, html }) {
    const info = await getTransporter().sendMail({ from, to, subject, text, html });

    // Recipient + message id only. Never the body, never the credentials.
    logger.info('email sent', { to, subject, messageId: info.messageId });

    return { delivered: true, transport: 'smtp', messageId: info.messageId };
  },

  /** Connectivity + auth probe. Does not send a message. */
  async verify() {
    await getTransporter().verify();
    return true;
  },
};
