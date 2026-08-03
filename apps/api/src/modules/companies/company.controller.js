import { sendCreated, sendSuccess } from '../../lib/response.js';
import { ApiError } from '../../lib/ApiError.js';
import { User } from '../users/user.model.js';
import { createCompany, listCompanyMembers } from './company.service.js';

async function requireAppUser(req) {
  const user = await User.findById(req.authUser.userId).lean();
  if (!user) throw ApiError.unauthenticated('Your account could not be found.');
  return user;
}

/** POST /api/companies — create a company and become its owner. */
export async function postCompany(req, res) {
  const user = await requireAppUser(req);
  const company = await createCompany(user._id, req.body);

  return sendCreated(res, {
    id: String(company._id),
    name: company.name,
    slug: company.slug,
    status: company.status,
    // The creator is always the owner. Returned so the client can update context immediately.
    role: 'owner',
  });
}

/** GET /api/companies/:companyId/members — requires membership + member:manage. */
export async function getCompanyMembers(req, res) {
  const members = await listCompanyMembers(req.company._id);

  return sendSuccess(res, {
    company: { id: String(req.company._id), name: req.company.name, slug: req.company.slug },
    // Echoed so the caller can see the role this response was authorised by.
    yourRole: req.membership.role,
    members,
  });
}
