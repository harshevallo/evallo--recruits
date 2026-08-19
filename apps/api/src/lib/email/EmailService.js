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
import { sendgridApiTransport } from './transports/sendgridApi.transport.js';
import {
  verificationTemplate,
  passwordResetTemplate,
  companyInvitationTemplate,
  accountDeletionRequestedTemplate,
} from './templates/index.js';

/**
 * Upper bound on a single delivery, independent of the transport.
 *
 * The SMTP transport sets its own socket timeouts, but this does not rely on them: a transport is
 * replaceable, and no caller should have to know whether the one in use bounds itself.
 */
const SEND_DEADLINE_MS = 15_000;

/** Reject with `mail_timeout` if `promise` has not settled within `ms`. */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`Email delivery exceeded ${ms}ms`);
      error.code = 'mail_timeout';
      reject(error);
    }, ms);
  });

  /*
   * The timer is deliberately NOT unref'd. Unref'ing lets the process exit while the race is still
   * pending, so against a transport that never settles the returned promise never settles either —
   * the exact failure this function exists to prevent, reintroduced one layer up. `clearTimeout`
   * in `finally` is what stops it holding the process open, and it runs on both outcomes.
   */
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const TEMPLATES = {
  verification: verificationTemplate,
  passwordReset: passwordResetTemplate,
  companyInvitation: companyInvitationTemplate,
  accountDeletionRequested: accountDeletionRequestedTemplate,
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

    /*
     * The HTTP transport is checked first and separately, because it needs only the API key —
     * `isSmtpConfigured` also demands a host and user, which this door does not use. Requiring
     * them would make a correctly configured deployment fall back to console and log nothing to
     * the user, which is the failure mode this transport exists to escape.
     */
    if (env.MAIL_PROVIDER === 'sendgrid_api') {
      if (!env.smtp.pass) {
        logger.warn(
          'MAIL_PROVIDER=sendgrid_api but EMAIL_PASS (the API key) is not set — falling back to the console transport.',
        );
        return consoleTransport;
      }
      return sendgridApiTransport;
    }

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
   * Never throws, and never hangs: a mail failure must not fail the surrounding operation (a user
   * who signs up successfully should not see an error because SMTP hiccuped — they can resend),
   * and it must not delay it either. "Not throwing" was only half the guarantee — awaiting an
   * unbounded send still holds the HTTP response open, so a silently blocked SMTP port turned a
   * successful signup into a request that never returned. The deadline below closes that gap, so
   * the worst case is an undelivered email rather than an unusable endpoint.
   *
   * @param {'verification'|'passwordReset'|'companyInvitation'|'accountDeletionRequested'} template
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
      return await withDeadline(
        this.transport.send({ from: env.mailFrom, to, subject, text, html }),
        SEND_DEADLINE_MS,
      );
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
