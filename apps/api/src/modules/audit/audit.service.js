/**
 * Audit writes — PRD §14.3, §16.1.
 *
 * One entry point, so every auditable action is recorded the same way and nothing has to
 * remember the document shape.
 */

import { logger } from '../../lib/logger.js';
import { AuditEvent } from './auditEvent.model.js';
import { User } from '../users/user.model.js';

/**
 * Records an audit event WITHOUT blocking the caller's response.
 *
 * The trade here is deliberate and narrow. The read the recruiter asked for has already been
 * authorised and is safe to return; holding it open for a second write would make every profile
 * view slower for no benefit to the person waiting. A failure is logged loudly rather than
 * swallowed, because a compliance record that silently stops being written is worse than one that
 * is merely late.
 *
 * If PRD §16.1 later requires the log to be a precondition of access rather than a record of it,
 * this becomes an `await` at the call site — the shape does not change.
 *
 * @param {object} event  { actorUserId, actorCompanyId?, action, targetType, targetId, metadata?, ip?, userAgent? }
 */
export function recordAuditEvent(event) {
  AuditEvent.create(event).catch((error) => {
    logger.error('Audit event was not recorded', {
      action: event.action,
      targetType: event.targetType,
      targetId: String(event.targetId ?? ''),
      message: String(error?.message ?? '').slice(0, 200),
    });
  });
}

/** Request context every audit event carries (PRD §16.4 suspicious-access monitoring). */
export function auditContext(req) {
  return {
    ip: req.ip,
    userAgent: String(req.get?.('user-agent') ?? '').slice(0, 300) || undefined,
  };
}

/**
 * A company's own audit trail — SET-02 (PRD §14.3, §16.1).
 *
 * §16.1 requires profile views, evidence access, exports and contact reveals to be auditable. Writing
 * the events is only half of that: a company must be able to READ its own trail, or the record is
 * unverifiable by the people accountable for it.
 *
 * Scoped to `actorCompanyId`, so a company sees what IT did — never another company's activity, and
 * never the personal-surface actions of its members.
 */
export async function listCompanyAuditEvents(companyId, { page = 1, pageSize = 25 } = {}) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const skip = (Math.max(page, 1) - 1) * limit;

  const [rows, total] = await Promise.all([
    AuditEvent.find({ actorCompanyId: companyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditEvent.countDocuments({ actorCompanyId: companyId }),
  ]);

  const actors = await User.find({ _id: { $in: rows.map((row) => row.actorUserId) } })
    .select('name email')
    .lean();
  const byId = new Map(actors.map((user) => [String(user._id), user]));

  return {
    events: rows.map((row) => {
      const actor = byId.get(String(row.actorUserId));
      return {
        id: String(row._id),
        action: row.action,
        targetType: row.targetType,
        targetId: String(row.targetId),
        actor: actor ? { name: actor.name ?? null, email: actor.email } : null,
        /* `metadata` can hold a reason or a source; it never holds candidate-private fields. */
        metadata: row.metadata ?? {},
        at: row.createdAt,
      };
    }),
    meta: { page: Math.max(page, 1), pageSize: limit, total, totalPages: Math.ceil(total / limit) },
  };
}
