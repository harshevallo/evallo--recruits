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
