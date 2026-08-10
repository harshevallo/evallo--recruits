/** REC-15 request contracts (ADR-009). */

import { z } from 'zod';

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

const companyParams = z.object({ companyId: z.string().trim().min(1).max(80) });

export const companyConversationListValidation = { params: companyParams };

export const companyConversationParamValidation = {
  params: companyParams.extend({ conversationId: objectId }),
};

/**
 * Replying inside an existing thread.
 *
 * `candidateId` is absent on purpose: the thread already knows who it is with, and accepting one
 * here would let a caller aim a reply at a different candidate than the URL implies.
 */
export const companyReplyValidation = {
  params: companyParams.extend({ conversationId: objectId }),
  body: z.object({ body: z.string().trim().min(1, 'Write a message first').max(5000) }),
};

/** Opening a thread from a candidate profile or search result. */
export const startConversationValidation = {
  params: companyParams,
  body: z.object({
    candidateId: objectId,
    body: z.string().trim().min(1, 'Write a message first').max(5000),
    interestId: objectId.nullish(),
  }),
};
