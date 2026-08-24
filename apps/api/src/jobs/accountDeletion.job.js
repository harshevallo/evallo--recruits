/**
 * Account-deletion queue — PRD §16.1, backlog B-09, policy in `16_RETENTION_POLICY.md`.
 *
 * `POST /api/me/settings/delete` marks an account `deletion_pending` and revokes its sessions.
 * This job processes that queue once the grace period has passed.
 *
 * ## Two switches, because this cannot be undone
 *
 * Nothing is modified unless BOTH `ACCOUNT_DELETION_RETENTION_DAYS` (unset by default) and
 * `ACCOUNT_DELETION_PURGE_ENABLED` (false by default) are set. With only the period set, the job
 * reports precisely which accounts *would* be processed and touches nothing — so an operator can
 * watch a cycle before arming it. That default is deliberate: the retention policy is a
 * founder/legal decision (`16_RETENTION_POLICY.md` is a proposal awaiting sign-off), and shipping
 * an irreversible default would pre-empt it.
 *
 * ## The shape of the purge
 *
 * Anonymisation-first, because §16.1 requires an audit trail that survives deletion:
 *
 * - the person's own content is **deleted** outright;
 * - `users` and `candidateProfiles` are **emptied but retained as tombstones**, so every audit
 *   event and company record that references them stays referentially valid. The profile becomes
 *   `archived`, which `candidateAccess.service` — the single authority — already refuses for every
 *   recruiter path. The privacy outcome therefore comes from the existing rule, not from new logic
 *   here that could disagree with it;
 * - records a company also owns (interests, correspondence, notes, pipeline) keep the row and lose
 *   the identity. `RETAIN_COMPANY_RECORDS` below is the single switch for that decision.
 *
 * Ordering is chosen so that a crash mid-way leaves a safe state: content first, tombstones last.
 * A partially-processed account is still `deletion_pending`, so the next run simply finishes it —
 * every step is idempotent.
 */

import { USER_STATUS, CANDIDATE_VISIBILITY, MEMBERSHIP_STATUS } from '@evallo/shared';
import { User } from '../modules/users/user.model.js';
import { CandidateProfile } from '../modules/candidates/candidateProfile.model.js';
import { CandidateAnswer } from '../modules/candidates/candidateAnswer.model.js';
import { Experience, EducationEntry, Credential, EvidenceItem } from '../modules/candidates/profileEntry.model.js';
import { SavedCompany } from '../modules/candidates/savedCompany.model.js';
import { SavedCandidate } from '../modules/pipeline/savedCandidate.model.js';
import { AccessGrant } from '../modules/interests/accessGrant.model.js';
import { ExpressionOfInterest } from '../modules/interests/expressionOfInterest.model.js';
import { CompanyMember } from '../modules/memberships/companyMember.model.js';
import { CompanyJoinRequest } from '../modules/memberships/joinRequest.model.js';
import { Session } from '../modules/auth/session.model.js';
import { VerificationToken } from '../modules/auth/verificationToken.model.js';
import { EarlyAccessRequest } from '../modules/public/earlyAccessRequest.model.js';
import { AuditEvent } from '../modules/audit/auditEvent.model.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether records a COMPANY also owns survive the candidate's deletion.
 *
 * `true` per the proposed policy §3: an interest a company legitimately received, correspondence
 * it was party to, and its own internal notes and pipeline rows are that company's business
 * records; the candidate's identity is removed from them by the `users`/`candidateProfiles`
 * tombstones. Flipping this to `false` is the one-line change if legal decides otherwise —
 * `16_RETENTION_POLICY.md` §3 flags it as the sharpest open question.
 */
const RETAIN_COMPANY_RECORDS = true;

/**
 * Reviews the deletion queue. **Read-only** — it never writes, so it is safe to call at any time,
 * and it is what runs when the purge is not armed.
 *
 * @param {object} [options]
 * @param {number} [options.batchSize]     hard cap on documents read, so the query is bounded
 * @param {number|null} [options.retentionDays] null = policy not configured
 * @param {Date} [options.now]             injectable clock, for tests
 * @returns {Promise<{ policyConfigured: boolean, retentionDays: number|null, pending: number,
 *   eligible: number, awaitingPolicy: number, oldestRequestAgeDays: number|null,
 *   eligibleUserIds: string[], purged: number, batchSize: number, truncated: boolean }>}
 */
export async function reviewPendingDeletions({
  batchSize = env.ACCOUNT_DELETION_BATCH_SIZE,
  retentionDays = env.ACCOUNT_DELETION_RETENTION_DAYS ?? null,
  now = new Date(),
} = {}) {
  /*
   * Only `deletion_pending` is ever considered, and only the three fields the report needs.
   * An active, suspended, or already-anonymised account cannot appear in this set — which is the
   * property that makes "does not delete active accounts" true of the query itself rather than of
   * a later branch someone might edit.
   */
  const pending = await User.find({
    status: USER_STATUS.DELETION_PENDING,
    deletedAt: { $in: [null, undefined] },
  })
    .select('_id deletionRequestedAt')
    .sort({ deletionRequestedAt: 1 })
    .limit(batchSize + 1)
    .lean();

  const truncated = pending.length > batchSize;
  const batch = truncated ? pending.slice(0, batchSize) : pending;

  const ageDays = (requestedAt) =>
    requestedAt ? (now.getTime() - new Date(requestedAt).getTime()) / DAY_MS : 0;

  const policyConfigured = typeof retentionDays === 'number' && retentionDays >= 0;

  /*
   * With no configured period nothing is eligible — the safe direction. An account waits in the
   * queue rather than being purged against a period this code invented.
   */
  const eligible = policyConfigured
    ? batch.filter((user) => ageDays(user.deletionRequestedAt) >= retentionDays)
    : [];

  const oldest = batch[0]?.deletionRequestedAt ?? null;

  return {
    policyConfigured,
    retentionDays: policyConfigured ? retentionDays : null,
    pending: batch.length,
    eligible: eligible.length,
    awaitingPolicy: policyConfigured ? 0 : batch.length,
    oldestRequestAgeDays: oldest ? Math.floor(ageDays(oldest)) : null,
    eligibleUserIds: eligible.map((user) => String(user._id)),
    /** This function never purges — it only reports. The job decides, and only when armed. */
    purged: 0,
    batchSize,
    truncated,
  };
}

/** A tombstone email that is unique, obviously synthetic, and cannot receive mail. */
const tombstoneEmail = (userId) => `deleted-${userId}@deleted.invalid`;

/**
 * Purges ONE eligible account, per `16_RETENTION_POLICY.md` §3.
 *
 * Every step is idempotent, and the account stays `deletion_pending` until the final write — so a
 * crash halfway leaves a partially-cleaned account that the next run completes, rather than a
 * half-deleted account that no run will ever look at again.
 *
 * @param {{ _id: any }} user  a lean `deletion_pending` user
 * @returns {Promise<{ userId: string, deleted: Record<string, number>, anonymised: Record<string, number> }>}
 */
export async function purgeAccount(user) {
  const userId = user._id;
  const profile = await CandidateProfile.findOne({ userId }).select('_id').lean();
  const candidateId = profile?._id ?? null;

  const deleted = {};
  const anonymised = {};
  const count = (bucket, key, result) => {
    bucket[key] = (bucket[key] ?? 0) + (result?.deletedCount ?? result?.modifiedCount ?? 0);
  };

  /* 1 ── the person's own content. Nothing else references these rows. */
  if (candidateId) {
    count(deleted, 'candidateAnswers', await CandidateAnswer.deleteMany({ candidateId }));
    count(deleted, 'experiences', await Experience.deleteMany({ candidateId }));
    count(deleted, 'educationEntries', await EducationEntry.deleteMany({ candidateId }));
    count(deleted, 'credentials', await Credential.deleteMany({ candidateId }));
    count(deleted, 'evidenceItems', await EvidenceItem.deleteMany({ candidateId }));
    count(deleted, 'savedCompanies', await SavedCompany.deleteMany({ candidateId }));
    // Other companies' shortlist rows pointing at a profile that is about to be emptied.
    count(deleted, 'savedCandidates', await SavedCandidate.deleteMany({ candidateId }));
    count(deleted, 'accessGrants', await AccessGrant.deleteMany({ candidateId }));
  }

  /* 2 ── credentials and pending requests. */
  count(deleted, 'authSessions', await Session.deleteMany({ userId }));
  count(deleted, 'verificationTokens', await VerificationToken.deleteMany({ userId }));
  count(
    deleted,
    'companyJoinRequests',
    await CompanyJoinRequest.deleteMany({ userId, status: { $ne: 'approved' } }),
  );

  /* 3 ── records a company also owns: identity stripped, row retained (§3). */
  if (candidateId && RETAIN_COMPANY_RECORDS) {
    count(
      anonymised,
      'expressionsOfInterest',
      await ExpressionOfInterest.updateMany(
        { candidateId },
        { $unset: { 'contact.name': '', 'contact.email': '', ip: '', userAgent: '' } },
      ),
    );
  } else if (candidateId) {
    count(deleted, 'expressionsOfInterest', await ExpressionOfInterest.deleteMany({ candidateId }));
  }

  // Membership history is retained, but the person is no longer a member of anything.
  count(
    anonymised,
    'companyMembers',
    await CompanyMember.updateMany(
      { userId, status: { $ne: MEMBERSHIP_STATUS.REMOVED } },
      { $set: { status: MEMBERSHIP_STATUS.REMOVED, removedAt: new Date() } },
    ),
  );

  /* 4 ── tombstones, last. These are what make the account "processed". */
  if (candidateId) {
    count(
      anonymised,
      'candidateProfiles',
      await CandidateProfile.updateOne(
        { _id: candidateId },
        {
          $set: {
            status: CANDIDATE_VISIBILITY.ARCHIVED,
            deletedAt: new Date(),
            blockedCompanyIds: [],
            targetRoles: [],
            subjects: [],
            learnerSegments: [],
            employmentTypes: [],
            deliveryModes: [],
          },
          $unset: { headline: '', summary: '', availability: '', yearsExperience: '' },
        },
      ),
    );
  }

  count(
    anonymised,
    'users',
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          status: USER_STATUS.DELETED,
          deletedAt: new Date(),
          email: tombstoneEmail(userId),
          name: 'Deleted user',
          emailVerified: false,
          languages: [],
        },
        $unset: {
          passwordHash: '',
          googleId: '',
          microsoftId: '',
          profilePicture: '',
          headline: '',
          phone: '',
          phoneCountry: '',
          accountLanguages: [],
          location: '',
          notificationPreferences: '',
        },
      },
    ),
  );

  return { userId: String(userId), deleted, anonymised };
}

/**
 * Drops network identifiers from audit events older than the configured window, keeping the event.
 *
 * The event itself is the §16.1 obligation; the IP and user agent are abuse-triage data with a far
 * shorter useful life, so they age out separately.
 */
export async function scrubAuditNetworkIdentifiers({
  retentionDays = env.AUDIT_IP_RETENTION_DAYS,
  now = new Date(),
} = {}) {
  if (!retentionDays) return { scrubbed: 0, configured: false };

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const result = await AuditEvent.updateMany(
    { createdAt: { $lt: cutoff }, $or: [{ ip: { $exists: true } }, { userAgent: { $exists: true } }] },
    { $unset: { ip: '', userAgent: '' } },
  );

  return { scrubbed: result.modifiedCount ?? 0, configured: true };
}

/** Deletes marketing leads past their retention window (TD-06). */
export async function purgeEarlyAccessRequests({
  retentionDays = env.EARLY_ACCESS_RETENTION_DAYS,
  now = new Date(),
  batchSize = env.ACCOUNT_DELETION_BATCH_SIZE,
} = {}) {
  if (!retentionDays) return { deleted: 0, configured: false };

  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const stale = await EarlyAccessRequest.find({ lastSubmittedAt: { $lt: cutoff } })
    .select('_id')
    .limit(batchSize)
    .lean();

  if (stale.length === 0) return { deleted: 0, configured: true };

  const result = await EarlyAccessRequest.deleteMany({ _id: { $in: stale.map((r) => r._id) } });
  return { deleted: result.deletedCount ?? 0, configured: true };
}

export const accountDeletionJob = {
  name: 'account-deletion-review',
  intervalMs: 6 * 60 * 60 * 1000,
  runOnStart: true,

  async run() {
    const report = await reviewPendingDeletions();

    if (report.pending > 0 && !report.policyConfigured) {
      logger.warn(
        'accounts are awaiting deletion but no retention policy is configured — nothing is purged',
        {
          pending: report.pending,
          oldestRequestAgeDays: report.oldestRequestAgeDays,
          blockedBy: 'B-09 — retention period and anonymisation policy (PRD §16.1)',
        },
      );
    }

    /*
     * The second switch. A configured period alone reports only — which is the state an operator
     * should sit in for a cycle or two before arming the irreversible half.
     */
    const armed = report.policyConfigured && env.ACCOUNT_DELETION_PURGE_ENABLED;
    let purged = 0;

    if (report.eligible > 0 && !armed) {
      logger.warn('accounts are eligible for deletion but ACCOUNT_DELETION_PURGE_ENABLED is false', {
        eligible: report.eligible,
      });
    }

    if (armed) {
      for (const userId of report.eligibleUserIds) {
        try {
          const result = await purgeAccount({ _id: userId });
          purged += 1;
          logger.info('account purged', result);
        } catch (error) {
          // One bad account must not stop the batch; it stays pending and is retried next run.
          logger.error('account purge failed', { userId, message: error.message });
        }
      }
    }

    const audit = await scrubAuditNetworkIdentifiers();
    const earlyAccess = await purgeEarlyAccessRequests();

    return {
      pending: report.pending,
      eligible: report.eligible,
      purged,
      purgeEnabled: env.ACCOUNT_DELETION_PURGE_ENABLED,
      policyConfigured: report.policyConfigured,
      retentionDays: report.retentionDays,
      oldestRequestAgeDays: report.oldestRequestAgeDays,
      truncated: report.truncated,
      auditIdentifiersScrubbed: audit.scrubbed,
      earlyAccessDeleted: earlyAccess.deleted,
    };
  },
};
