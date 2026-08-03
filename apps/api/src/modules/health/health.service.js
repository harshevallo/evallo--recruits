/**
 * Health check.
 *
 * The M0 end-to-end proof: React → Axios → Express → MongoDB → rendered response.
 * Infrastructure verification, not a product feature.
 *
 * Follows the standard module anatomy (ADR-011) so it demonstrates the pattern every later
 * module copies: the service holds the logic, the controller only maps HTTP.
 */

import { getDatabaseStatus, supportsTransactions } from '../../lib/db.js';
import { activeMailProvider } from '../../lib/email/index.js';
import { env } from '../../config/env.js';

export function getHealth() {
  const database = getDatabaseStatus();
  const transactions = supportsTransactions();

  return {
    status: database.status === 'connected' ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      ...database,
      // null when the topology is not yet known (e.g. still connecting).
      supportsTransactions: transactions,
      // Four operations need transactions (05_DATABASE_SCHEMA.md §11). Surfacing this makes a
      // standalone-mongod misconfiguration visible now rather than as a concurrency bug later.
      warning:
        transactions === false
          ? 'MongoDB is not running as a replica set. Multi-document transactions are unavailable — see 08_SETUP_GUIDE.md §1.'
          : undefined,
    },
    /**
     * Which integrations are live. `mail: console` means verification and reset links are
     * printed to the API console rather than emailed.
     */
    integrations: {
      mail: activeMailProvider(),
      mailRequested: env.MAIL_PROVIDER,
      googleSignIn: env.isGoogleConfigured ? 'configured' : 'disabled',
    },
  };
}
