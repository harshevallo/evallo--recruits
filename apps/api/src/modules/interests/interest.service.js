/**
 * Expression of interest — PRD §8.7, §11.1.
 */

import {
  COMPANY_STATUS,
  MODERATION_STATUS,
  HIRING_INTENT_STATUS,
  ERROR_CODES,
} from '@evallo/shared';
import { ApiError } from '../../lib/ApiError.js';
import { Company } from '../companies/company.model.js';
import { HiringIntent } from '../hiring-intents/hiringIntent.model.js';
import { ExpressionOfInterest } from './expressionOfInterest.model.js';

/**
 * Submit interest in a company, optionally scoped to one of its active hiring intents.
 *
 * Idempotent: a repeat submission for the same email/company/intent returns the existing record
 * rather than creating a duplicate (PRD §21.5).
 *
 * @param {string} slug
 * @param {{ name, email, message?, hiringIntentId? }} input  Already validated
 * @param {{ ip?, userAgent? }} context
 */
export async function submitCompanyInterest(slug, input, context = {}) {
  const company = await Company.findOne({
    slug,
    status: COMPANY_STATUS.PUBLISHED,
    moderationStatus: { $in: [MODERATION_STATUS.NONE, null] },
  })
    .select('_id acceptsGeneralInterest isCurrentlyHiring')
    .lean();

  if (!company) throw ApiError.notFound('Company not found.');

  let hiringIntentId = null;

  if (input.hiringIntentId) {
    const intent = await HiringIntent.findOne({
      _id: input.hiringIntentId,
      companyId: company._id,
    })
      .select('_id status')
      .lean();

    if (!intent) throw ApiError.notFound('That role is no longer listed.');

    // PRD §21.5 — interest in a closed intent is refused with an informative alternative,
    // not a bare error.
    if (intent.status !== HIRING_INTENT_STATUS.ACTIVE) {
      throw new ApiError(
        ERROR_CODES.INTENT_CLOSED,
        'That role is no longer accepting interest. You can still express general interest in this company.',
      );
    }

    hiringIntentId = intent._id;
  }

  const now = new Date();

  const existing = await ExpressionOfInterest.findOne({
    companyId: company._id,
    'contact.email': input.email,
    hiringIntentId,
  })
    .select('_id')
    .lean();

  if (existing) return { status: 'already_submitted' };

  try {
    await ExpressionOfInterest.create({
      companyId: company._id,
      hiringIntentId,
      candidateId: null,
      contact: { name: input.name, email: input.email },
      message: input.message,
      consent: { grantedAt: now },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { status: 'submitted' };
  } catch (error) {
    // Lost a race on the unique partial index — the idempotent outcome, not a failure.
    if (error?.code === 11000) return { status: 'already_submitted' };
    throw error;
  }
}
