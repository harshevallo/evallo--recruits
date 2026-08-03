/**
 * Maps HTTP to the health service. No logic — see the layer rules in
 * 07_PROJECT_STRUCTURE.md §3.2.
 */

import { sendSuccess } from '../../lib/response.js';
import { getHealth } from './health.service.js';

export function healthCheck(_req, res) {
  const health = getHealth();
  // 503 when degraded so uptime monitoring and container probes react correctly.
  const status = health.status === 'ok' ? 200 : 503;
  return sendSuccess(res, health, { status });
}
