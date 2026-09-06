/** Direct messaging request contracts (ADR-009, ADR-025). */

import { z } from 'zod';
import { MESSAGING_LIMITS } from '@evallo/shared';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const messageBody = z
  .string()
  .trim()
  .min(1, 'Write a message first')
  .max(
    MESSAGING_LIMITS.BODY_MAX_LENGTH,
    `Keep it under ${MESSAGING_LIMITS.BODY_MAX_LENGTH} characters`,
  );

export const conversationParamValidation = {
  params: z.object({ conversationId: objectId }),
};

/**
 * Starting a conversation.
 *
 * The recipient is EITHER a person (`recipientUserId`) OR a candidate by profile id
 * (`candidateId`) — the recruiter surfaces know candidates by profile and have no business learning
 * the account id. A candidate can only be addressed THROUGH a company (`companyId`, id or slug),
 * because that is the route by which the sender is allowed to see them at all.
 */
export const startConversationValidation = {
  body: z
    .object({
      recipientUserId: objectId.optional(),
      candidateId: objectId.optional(),
      companyId: z.string().trim().min(1).max(80).optional(),
      interestId: objectId.nullish(),
      body: messageBody,
    })
    .refine((value) => Boolean(value.recipientUserId) !== Boolean(value.candidateId), {
      message: 'Say who the message is for',
      path: ['recipientUserId'],
    })
    .refine((value) => !value.candidateId || Boolean(value.companyId), {
      message: 'A candidate is messaged from a company',
      path: ['companyId'],
    }),
};

/**
 * Sending into an existing conversation. No recipient field on purpose: the thread already knows
 * who it is with, and accepting one here would let a caller aim a message at someone else.
 */
export const sendMessageValidation = {
  params: conversationParamValidation.params,
  body: z.object({ body: messageBody }),
};

export const respondValidation = {
  params: conversationParamValidation.params,
  body: z.object({ accepted: z.boolean() }),
};

export const muteValidation = {
  params: conversationParamValidation.params,
  body: z.object({ muted: z.boolean() }),
};

export const reportValidation = {
  params: conversationParamValidation.params,
  body: z.object({
    reason: z
      .string()
      .trim()
      .min(3, 'Tell us what is wrong')
      .max(MESSAGING_LIMITS.REPORT_REASON_MAX_LENGTH, 'Keep the reason under 500 characters'),
  }),
};
