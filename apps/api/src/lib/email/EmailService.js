/**
 * EmailService — the single way this application sends mail.
 *
 * Three concerns kept apart:
 *   templates/   what the message says   (content only)
 *   transports/  how it is delivered     (console | smtp/SendGrid)
 *   this file    orchestration           (select transport, render, send, handle failure)
 *
 * Callers name a template and pass data. They never build a body, never touch nodemailer, and
 * never see credentials. Switching console → SendGrid is configuration only.
 */

import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { consoleTransport } from './transports/console.transport.js';
import { smtpTransport } from './transports/smtp.transport.js';
import {
  verificationTemplate,
  passwordResetTemplate,
  companyInvitationTemplate,
} from './templates/index.js';

const TEMPLATES = {
  verification: verificationTemplate,
  passwordReset: passwordResetTemplate,
  companyInvitation: companyInvitationTemplate,
};

class EmailService {
  constructor() {
    this.transport = this.#resolveTransport();
  }

  /**
   * `sendgrid` is an alias for `smtp` — it is SMTP with SendGrid's host. Treating them as one
   * transport avoids a near-duplicate implementation.
   *
   * If SMTP is requested but incomplete we fall back to console rather than crashing: a missing
   * mail credential must not take the API down, and links still reach the console so auth flows
   * stay usable.
   */
  #resolveTransport() {
    /*
     * Tests never send real mail. Without this the suite would deliver to fake addresses —
     * generating hard bounces that damage the sending domain's reputation — and nodemailer's
     * pooled connection would keep the test process alive after the run.
     */
    if (env.isTest) return consoleTransport;

    const wantsSmtp = env.MAIL_PROVIDER === 'smtp' || env.MAIL_PROVIDER === 'sendgrid';

    if (!wantsSmtp) return consoleTransport;

    if (!env.isSmtpConfigured) {
      logger.warn(
        `MAIL_PROVIDER=${env.MAIL_PROVIDER} but EMAIL_HOST/EMAIL_USER/EMAIL_PASS are incomplete — falling back to the console transport.`,
      );
      return consoleTransport;
    }

    return smtpTransport;
  }

  /** Which transport is actually active. Surfaced by /api/health. */
  get activeTransport() {
    return this.transport.name;
  }

  /**
   * Render a template and deliver it.
   *
   * Never throws: a mail failure must not fail the surrounding operation (a user who signs up
   * successfully should not see an error because SMTP hiccuped — they can resend). The outcome
   * is returned so a caller that cares can react.
   *
   * @param {'verification'|'passwordReset'|'companyInvitation'} template
   * @param {{ to: string, [key: string]: unknown }} data
   * @returns {Promise<{ delivered: boolean, transport?: string, error?: string }>}
   */
  async send(template, data) {
    const build = TEMPLATES[template];
    if (!build) {
      logger.error('Unknown email template', { template });
      return { delivered: false, error: 'unknown_template' };
    }

    const { to, ...templateData } = data;
    const { subject, text, html } = build(templateData);

    try {
      return await this.transport.send({ from: env.mailFrom, to, subject, text, html });
    } catch (error) {
      /*
       * Log enough to diagnose, nothing that leaks secrets. nodemailer errors can carry the
       * SMTP conversation — including the AUTH line — so only the code and a short message are
       * recorded, never the full error or the transport config.
       */
      logger.error('Email delivery failed', {
        template,
        to,
        transport: this.transport.name,
        code: error.code ?? error.responseCode ?? 'UNKNOWN',
        message: String(error.message ?? '').slice(0, 200),
      });
      return { delivered: false, error: error.code ?? 'send_failed' };
    }
  }

  /** Probe the transport (connection + auth for SMTP). Never throws. */
  async verify() {
    try {
      await this.transport.verify();
      return { ok: true, transport: this.transport.name };
    } catch (error) {
      logger.error('Email transport verification failed', {
        transport: this.transport.name,
        code: error.code ?? 'UNKNOWN',
        message: String(error.message ?? '').slice(0, 200),
      });
      return { ok: false, transport: this.transport.name, error: error.code ?? 'verify_failed' };
    }
  }
}

/** Single shared instance — the transport and its connection pool are reused. */
export const emailService = new EmailService();
