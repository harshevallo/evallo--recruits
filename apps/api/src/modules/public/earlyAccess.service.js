/**
 * Early-access capture — business logic lives here, never in the controller (ADR-011).
 */

import { EarlyAccessRequest } from './earlyAccessRequest.model.js';

/**
 * Record a waitlist request.
 *
 * Idempotent: a repeat submission from the same email updates the existing record and reports
 * `already_registered` rather than creating a duplicate or returning a conflict. The unique
 * index on `email` guarantees this even under concurrent requests.
 *
 * @param {{ segment: string, name: string, email: string }} input  Already validated
 * @param {{ referrer?: string, utm?: object, landingPath?: string, ip?: string, userAgent?: string }} context
 * @returns {Promise<{ status: 'received'|'already_registered' }>}
 */
export async function submitEarlyAccessRequest(input, context = {}) {
  const now = new Date();

  const existing = await EarlyAccessRequest.findOne({ email: input.email })
    .select('_id')
    .lean();

  if (existing) {
    // Refresh intent and count the repeat, but never overwrite operator-managed fields
    // such as `status` or `notes`.
    await EarlyAccessRequest.updateOne(
      { _id: existing._id },
      {
        $set: { name: input.name, segment: input.segment, lastSubmittedAt: now },
        $inc: { submissionCount: 1 },
      },
    );

    return { status: 'already_registered' };
  }

  try {
    await EarlyAccessRequest.create({
      email: input.email,
      name: input.name,
      segment: input.segment,
      consentedAt: now,
      lastSubmittedAt: now,
      submissionCount: 1,
      source: {
        referrer: context.referrer,
        utmSource: context.utm?.utm_source,
        utmMedium: context.utm?.utm_medium,
        utmCampaign: context.utm?.utm_campaign,
        landingPath: context.landingPath,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { status: 'received' };
  } catch (error) {
    // Lost a race against a concurrent submit of the same email. The unique index did its job;
    // treat it as the idempotent path rather than an error.
    if (error?.code === 11000) {
      return { status: 'already_registered' };
    }
    throw error;
  }
}
