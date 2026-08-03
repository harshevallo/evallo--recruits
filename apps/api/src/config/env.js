/**
 * Environment loading and validation.
 *
 * Every required variable is validated HERE, at boot. A missing or malformed value exits the
 * process immediately rather than surfacing later as an unrelated failure at a random call site
 * (03_TRD.md §10). Fail fast, fail loudly, fail at startup.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// ESM has no __dirname (ADR-012).
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

/**
 * Treats a blank or whitespace-only value as absent.
 *
 * `KEY=` in a .env file yields "" rather than undefined, so an optional string would fail its
 * own min-length check and take the whole process down at boot. Commented-out and blank keys
 * must behave identically.
 */
const optionalString = () =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  /** Standardised connection string for this project. Always the evallo-recruit database. */
  MONGODB_CLOUD: z
    .string()
    .min(1, 'MONGODB_CLOUD is required')
    .refine(
      (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
      'MONGODB_CLOUD must start with mongodb:// or mongodb+srv://',
    ),

  CLIENT_ORIGIN: z
    .string()
    .min(1, 'CLIENT_ORIGIN is required')
    .refine(
      (value) => value !== '*',
      'CLIENT_ORIGIN cannot be "*" — a wildcard origin is incompatible with credentials:true (ADR-005)',
    ),

  /**
   * Self-hosted JWT auth — AUTH-01 (ADR-005).
   *
   * Access and refresh secrets must differ so a leaked access secret cannot forge refresh
   * tokens. Sensible dev defaults keep the app runnable without setup; production is REQUIRED
   * to set real secrets (enforced below).
   */
  JWT_ACCESS_SECRET: optionalString(),
  JWT_REFRESH_SECRET: optionalString(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Public base URL of the web app — used to build verification and reset links. */
  APP_URL: z.string().default('http://localhost:5173'),

  /**
   * Email provider. `console` logs the message + link; `smtp` sends via nodemailer.
   * Switching to SendGrid is a configuration change only — no code change (AUTH-03).
   */
  // `sendgrid` is SMTP with SendGrid's host — same transport, clearer intent.
  MAIL_PROVIDER: z.enum(['console', 'smtp', 'sendgrid']).default('console'),
  MAIL_FROM: z.string().default('Evallo Recruit <no-reply@evallo.local>'),

  // SMTP settings. EMAIL_* is the primary naming; SMTP_* is accepted as an alias.
  EMAIL_HOST: optionalString(),
  EMAIL_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_SECURE: z
    .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' : v), z.boolean())
    .optional(),
  EMAIL_USER: optionalString(),
  EMAIL_PASS: optionalString(),
  EMAIL_SENDER: optionalString(),
  SMTP_HOST: optionalString(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: optionalString(),
  SMTP_PASS: optionalString(),

  /**
   * Google Sign-In. Optional — the button renders disabled with guidance when unset, so the
   * rest of auth works without it. Identity only: the Google token is verified then discarded,
   * and our own JWT is issued (never Google's token for API authorization).
   */
  GOOGLE_CLIENT_ID: optionalString(),
  /**
   * Accepted for completeness, but NOT used: verifying a Google ID token needs only the client
   * id and Google's public keys. A SPA using @react-oauth/google never performs a code
   * exchange, so no secret is involved in this flow.
   */
  GOOGLE_CLIENT_SECRET: optionalString(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Intentional console use: the logger is not available before config loads.
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error('Copy apps/api/.env.example to apps/api/.env and fill in the values.\n');
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === 'production';

/**
 * Auth secrets. Real values are REQUIRED in production; development falls back to a fixed dev
 * secret so the app runs out of the box. A dev secret in production would let anyone forge a
 * token, so we refuse to boot.
 */
const DEV_ACCESS_SECRET = 'dev-only-access-secret-not-for-production-use-000000';
const DEV_REFRESH_SECRET = 'dev-only-refresh-secret-not-for-production-use-11111';

if (isProduction && (!parsed.data.JWT_ACCESS_SECRET || !parsed.data.JWT_REFRESH_SECRET)) {
  console.error('\nJWT_ACCESS_SECRET and JWT_REFRESH_SECRET are required in production.\n');
  process.exit(1);
}

/** Validated, frozen environment. Never read process.env anywhere else. */
export const env = Object.freeze({
  ...parsed.data,
  JWT_ACCESS_SECRET: parsed.data.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
  JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
  isProduction,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
  isGoogleConfigured: Boolean(parsed.data.GOOGLE_CLIENT_ID),

  /** Resolved SMTP settings, EMAIL_* preferred over SMTP_*. */
  smtp: Object.freeze({
    host: parsed.data.EMAIL_HOST ?? parsed.data.SMTP_HOST,
    port: parsed.data.EMAIL_PORT ?? parsed.data.SMTP_PORT ?? 587,
    // Explicit EMAIL_SECURE wins; otherwise infer from the port (465 = implicit TLS).
    secure: parsed.data.EMAIL_SECURE ?? (parsed.data.EMAIL_PORT ?? parsed.data.SMTP_PORT) === 465,
    user: parsed.data.EMAIL_USER ?? parsed.data.SMTP_USER,
    pass: parsed.data.EMAIL_PASS ?? parsed.data.SMTP_PASS,
  }),
  /** From address: EMAIL_SENDER wins when set, else MAIL_FROM. */
  mailFrom: parsed.data.EMAIL_SENDER ?? parsed.data.MAIL_FROM,
  isSmtpConfigured: Boolean(
    (parsed.data.EMAIL_HOST ?? parsed.data.SMTP_HOST) &&
      (parsed.data.EMAIL_USER ?? parsed.data.SMTP_USER) &&
      (parsed.data.EMAIL_PASS ?? parsed.data.SMTP_PASS),
  ),
});

/**
 * Assert that variables required by a specific milestone are present.
 * Called by the modules that need them, so M0 can run without M1 secrets.
 *
 * @param {string[]} keys
 * @param {string} feature
 */
export function requireEnv(keys, feature) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `${feature} requires environment variables that are not set: ${missing.join(', ')}`,
    );
  }
}
