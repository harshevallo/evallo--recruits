import { z } from 'zod';
import { common, ORGANIZATION_TYPE_VALUES, COMPANY_ROLE_VALUES } from '@evallo/shared';

export const createCompanyValidation = {
  body: z.object({
    name: z.string().trim().min(2, 'Company name is required').max(120),
    organizationType: z.enum(ORGANIZATION_TYPE_VALUES, {
      errorMap: () => ({ message: 'Choose an organization type' }),
    }),
    tagline: z.string().trim().max(160).optional(),
    location: z.object({
      country: common.countryCode,
      region: z.string().trim().max(120).optional(),
      city: z.string().trim().max(120).optional(),
    }),
  }),
};

export const companyParamValidation = {
  params: z.object({ companyId: z.string().trim().min(1).max(80) }),
};

/** REC-02 — wizard step save. Field-level rules live in the service, beside the step definition. */
export const companyStepValidation = {
  params: z.object({
    companyId: z.string().trim().min(1).max(80),
    stepKey: z
      .string()
      .trim()
      .regex(/^[a-z_]+$/, 'Invalid step'),
  }),
  body: z.object({ values: z.record(z.string(), z.unknown()).default({}) }),
};

/** REC-01 — invitation actions on the personal surface. */
export const invitationParamValidation = {
  params: z.object({
    invitationId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'Invalid invitation'),
  }),
};

/**
 * REC-07 — invite a teammate.
 *
 * `role` accepts every company role including `owner`; whether the CALLER may grant it is an
 * authorization question, answered in the service against their membership. Rejecting it here
 * would return a validation error for what is really a permissions failure.
 */
export const createInvitationValidation = {
  params: z.object({ companyId: z.string().trim().min(1).max(80) }),
  body: z.object({
    email: common.email,
    role: z.enum(COMPANY_ROLE_VALUES, {
      errorMap: () => ({ message: 'Choose a role for this teammate' }),
    }),
  }),
};

/** REC-07 — resend or cancel one invitation, within a company. */
export const companyInvitationParamValidation = {
  params: z.object({
    companyId: z.string().trim().min(1).max(80),
    invitationId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'Invalid invitation'),
  }),
};

/**
 * REC-08 — act on one member within a company.
 *
 * `memberId` is a membership id, not a user id: the same person holds a different membership at
 * every company they belong to, and the route must not be satisfiable with an id borrowed from
 * another company.
 */
export const companyMemberParamValidation = {
  params: z.object({
    companyId: z.string().trim().min(1).max(80),
    memberId: z
      .string()
      .trim()
      .regex(/^[a-f\d]{24}$/i, 'Invalid member'),
  }),
};

/**
 * REC-08 — change a member's role.
 *
 * Accepts every role including `owner`. Whether the CALLER may grant it is an authorization
 * question the service answers against their membership — rejecting it here would report a
 * permissions failure as a validation error.
 */
export const changeMemberRoleValidation = {
  params: companyMemberParamValidation.params,
  body: z.object({
    role: z.enum(COMPANY_ROLE_VALUES, {
      errorMap: () => ({ message: 'Choose a role for this member' }),
    }),
  }),
};
