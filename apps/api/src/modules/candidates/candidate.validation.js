import { z } from 'zod';

/**
 * CAN-02 section save.
 *
 * Only the envelope is validated here. The answers themselves are checked against the **question
 * bank** in `builder.service.js` — their rules are configuration (ADR-007), so a static Zod schema
 * could not express them without duplicating the bank in code.
 */
export const saveSectionValidation = {
  params: z.object({
    sectionKey: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9_]+$/, 'Invalid section'),
  }),
  body: z.object({
    values: z.record(z.string(), z.unknown()).default({}),
  }),
};

const objectIdParam = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

const slugParam = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Invalid company address'),
});

/** CAN-03 — publish. Status is optional; the service defaults to discoverable. */
export const publishValidation = {
  body: z.object({
    status: z.enum(['discoverable', 'private']).optional(),
  }),
};

/** CAN-04 — visibility. At least one field, or the request is a no-op. */
export const visibilityValidation = {
  body: z
    .object({
      status: z.enum(['draft', 'private', 'discoverable', 'paused', 'archived']).optional(),
      contactVisibility: z
        .enum(['hidden', 'authorized_recruiters', 'after_interest', 'on_request'])
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'Nothing to update',
    }),
};

export const blockCompanyValidation = { body: z.object({ companyId: objectIdParam }) };
export const unblockCompanyValidation = { params: z.object({ companyId: objectIdParam }) };

/** CAN-06 — company relationship and save. */
export const companySlugValidation = { params: slugParam };

/** CAN-07 — interest submission (PRD §8.7 steps 4–6). */
export const candidateInterestValidation = {
  params: slugParam,
  body: z.object({
    hiringIntentId: objectIdParam.optional(),
    message: z.string().trim().max(1000, 'Keep your note under 1000 characters').optional(),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Please confirm before submitting' }),
    }),
  }),
};

export const withdrawInterestValidation = { params: z.object({ interestId: objectIdParam }) };

/** CAN-09 — messages. */
export const conversationParamValidation = {
  params: z.object({ conversationId: objectIdParam }),
};

export const replyValidation = {
  params: z.object({ conversationId: objectIdParam }),
  body: z.object({
    body: z.string().trim().min(1, 'Write a message').max(5000, 'Keep it under 5000 characters'),
  }),
};

/** PRD §11.2 — accept / decline. */
export const respondConversationValidation = {
  params: z.object({ conversationId: objectIdParam }),
  body: z.object({ accepted: z.boolean() }),
};

/** PRD §11.2 — mute / unmute. */
export const muteConversationValidation = {
  params: z.object({ conversationId: objectIdParam }),
  body: z.object({ muted: z.boolean() }),
};

export const reportConversationValidation = {
  params: z.object({ conversationId: objectIdParam }),
  body: z.object({
    reason: z.string().trim().min(1, 'Tell us what is wrong').max(500),
  }),
};
