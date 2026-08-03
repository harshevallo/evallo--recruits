/**
 * Resolves which company the request is acting through, and the caller's membership in it.
 *
 * This is where "recruiter" is decided — per request, per company, from the database. The access
 * token deliberately carries no roles, so a membership that was revoked a second ago is already
 * gone here.
 *
 * Fails closed: no active membership means no company context.
 */

import { MEMBERSHIP_STATUS, ERROR_CODES } from '@evallo/shared';
import { ApiError } from '../lib/ApiError.js';
import { User } from '../modules/users/user.model.js';
import { Company } from '../modules/companies/company.model.js';
import { CompanyMember } from '../modules/memberships/companyMember.model.js';

/**
 * Attaches `req.user` (the MongoDB user), `req.company`, and `req.membership`.
 *
 * The company is taken from the route param — never from the request body, and never from a
 * client-supplied claim.
 *
 * @param {{ param?: string }} [options]
 */
export function resolveCompanyContext({ param = 'companyId' } = {}) {
  return async function resolve(req, _res, next) {
    try {
      if (!req.authUser?.userId) {
        return next(ApiError.unauthenticated());
      }

      const user = await User.findById(req.authUser.userId).lean();
      if (!user) return next(ApiError.unauthenticated('Your account could not be found.'));

      req.user = user;

      const identifier = req.params[param];
      if (!identifier) return next(ApiError.notFound('Company not specified.'));

      // Accept an id or a slug so company URLs stay human-readable.
      const company = await Company.findOne(
        /^[0-9a-fA-F]{24}$/.test(identifier) ? { _id: identifier } : { slug: identifier },
      ).lean();

      if (!company) return next(ApiError.notFound('Company not found.'));

      const membership = await CompanyMember.findOne({
        userId: user._id,
        companyId: company._id,
        status: MEMBERSHIP_STATUS.ACTIVE,
      }).lean();

      /**
       * 404, not 403. Confirming the company exists to someone with no membership discloses
       * private organisations, so a non-member sees the same response as for a missing company.
       */
      if (!membership) {
        return next(
          new ApiError(ERROR_CODES.MEMBERSHIP_REQUIRED, 'Company not found.', { status: 404 }),
        );
      }

      req.company = company;
      req.membership = membership;

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
