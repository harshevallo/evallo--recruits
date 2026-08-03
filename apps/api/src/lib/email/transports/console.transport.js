/**
 * Development transport — logs instead of sending.
 *
 * Prints the actionable link prominently so verification and reset flows are fully testable
 * with no mail account configured.
 */

import { logger } from '../../logger.js';

export const consoleTransport = {
  name: 'console',

  async send({ to, subject, text }) {
    const link = text.match(/https?:\/\/\S+/)?.[0];

    logger.info('email (console transport)', { to, subject, link });

    if (link) {
      // Intentional: the developer needs to copy this out of the terminal.
      // eslint-disable-next-line no-console
      console.log(`\n✉  ${subject}\n   to:   ${to}\n   link: ${link}\n`);
    }

    return { delivered: true, transport: 'console' };
  },

  /** Always healthy — nothing to connect to. */
  async verify() {
    return true;
  },
};
