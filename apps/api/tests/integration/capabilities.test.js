/**
 * The one-account model.
 *
 * Verifies that capabilities are DERIVED from CandidateProfile and CompanyMember, never from a
 * role on the User — including the case a global role cannot represent: the same person holding
 * a different role at each of several companies while also being a candidate.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { can, canAll, PERMISSIONS, COMPANY_ROLES } from '@evallo/shared';
import { User } from '../../src/modules/users/user.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { CompanyMember } from '../../src/modules/memberships/companyMember.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { getUserCapabilities } from '../../src/modules/users/capability.service.js';
import { createCompany } from '../../src/modules/companies/company.service.js';

const CAP_EMAIL = 'cap@example.com';

let user;

async function makeCompany(slug, name) {
  return Company.create({
    slug,
    name,
    organizationType: 'tutoring_center',
    status: 'published',
    location: { country: 'US', city: 'Denver' },
  });
}

before(async () => {
  await connectDatabase();
});

/**
 * Cleanup is scoped to THIS suite's fixtures.
 *
 * These used to be unscoped `deleteMany({})`, which wiped every candidate profile and every
 * company membership in the database — including real accounts, because the suites run against
 * the shared development database. Never widen these filters.
 */
async function cleanupFixtures() {
  const fixture = await User.findOne({ email: CAP_EMAIL });
  if (fixture) {
    await CompanyMember.deleteMany({ userId: fixture._id });
    await CandidateProfile.deleteMany({ userId: fixture._id });
  }
  await Company.deleteMany({ slug: /^cap-/ });
  await User.deleteMany({ email: CAP_EMAIL });
}

after(async () => {
  await cleanupFixtures();
  await disconnectDatabase();
});

beforeEach(async () => {
  await cleanupFixtures();

  user = await User.create({
    email: CAP_EMAIL,
    name: 'Cap User',
  });

  await CompanyMember.deleteMany({ userId: user._id });
  await CandidateProfile.deleteMany({ userId: user._id });
});

describe('the User document', () => {
  test('has NO candidate or recruiter role field', () => {
    const raw = user.toObject();

    assert.ok(!('role' in raw), 'a global role field must not exist');
    assert.ok(!('isCandidate' in raw));
    assert.ok(!('isRecruiter' in raw));
    assert.ok(!('userType' in raw));
    assert.ok(!('accountType' in raw));
  });

  test('carries only a platform role, defaulting to member', () => {
    assert.equal(user.platformRole, 'member');
  });

  test('public profile exposes no application role', () => {
    const profile = user.toPublicProfile();
    assert.ok(!('role' in profile));
    assert.equal(profile.platformRole, 'member');
  });
});

describe('capabilities are derived, not stored', () => {
  test('a fresh user is neither candidate nor recruiter', async () => {
    const caps = await getUserCapabilities(user._id);

    assert.equal(caps.hasCandidateProfile, false);
    assert.equal(caps.isRecruiterAnywhere, false);
    assert.deepEqual(caps.companies, []);
  });

  test('creating a CandidateProfile makes the user a candidate', async () => {
    await CandidateProfile.create({ userId: user._id, headline: 'Physics teacher' });

    const caps = await getUserCapabilities(user._id);
    assert.equal(caps.hasCandidateProfile, true);
    assert.equal(caps.candidateProfile.headline, 'Physics teacher');
  });

  test('creating a company makes the user its OWNER via CompanyMember', async () => {
    const company = await createCompany(user._id, {
      name: 'Cap Owner Co',
      organizationType: 'tutoring_center',
      location: { country: 'US' },
    });

    const membership = await CompanyMember.findOne({ userId: user._id, companyId: company._id });
    assert.equal(membership.role, COMPANY_ROLES.OWNER);
    assert.equal(membership.status, 'active');

    // The user document is untouched by becoming a recruiter.
    const reloaded = await User.findById(user._id).lean();
    assert.ok(!('role' in reloaded));
  });

  test('the SAME user is a candidate AND a recruiter simultaneously', async () => {
    await CandidateProfile.create({ userId: user._id });
    await createCompany(user._id, {
      name: 'Cap Both Co',
      organizationType: 'tutoring_center',
      location: { country: 'US' },
    });

    const caps = await getUserCapabilities(user._id);

    assert.equal(caps.hasCandidateProfile, true, 'still a candidate');
    assert.equal(caps.isRecruiterAnywhere, true, 'and a recruiter');
    assert.equal(caps.companies.length, 1);
  });

  test('one user holds a DIFFERENT role at each of several companies', async () => {
    const [a, b, c] = await Promise.all([
      makeCompany('cap-alpha', 'Cap Alpha'),
      makeCompany('cap-beta', 'Cap Beta'),
      makeCompany('cap-gamma', 'Cap Gamma'),
    ]);

    await CompanyMember.create([
      { userId: user._id, companyId: a._id, role: COMPANY_ROLES.OWNER, status: 'active' },
      { userId: user._id, companyId: b._id, role: COMPANY_ROLES.RECRUITER, status: 'active' },
      { userId: user._id, companyId: c._id, role: COMPANY_ROLES.VIEWER, status: 'active' },
    ]);

    const caps = await getUserCapabilities(user._id);
    const byName = Object.fromEntries(caps.companies.map((x) => [x.name, x]));

    assert.equal(caps.companies.length, 3);
    assert.equal(byName['Cap Alpha'].role, COMPANY_ROLES.OWNER);
    assert.equal(byName['Cap Beta'].role, COMPANY_ROLES.RECRUITER);
    assert.equal(byName['Cap Gamma'].role, COMPANY_ROLES.VIEWER);

    // Permissions differ per company — the thing a global role cannot express.
    assert.ok(byName['Cap Alpha'].permissions.includes(PERMISSIONS.COMPANY_DELETE));
    assert.ok(!byName['Cap Beta'].permissions.includes(PERMISSIONS.COMPANY_DELETE));
    assert.ok(!byName['Cap Gamma'].permissions.includes(PERMISSIONS.MESSAGE_SEND));
  });

  test('a removed membership disappears from capabilities immediately', async () => {
    const company = await makeCompany('cap-revoke', 'Cap Revoke');
    const membership = await CompanyMember.create({
      userId: user._id,
      companyId: company._id,
      role: COMPANY_ROLES.RECRUITER,
      status: 'active',
    });

    assert.equal((await getUserCapabilities(user._id)).companies.length, 1);

    await CompanyMember.updateOne({ _id: membership._id }, { $set: { status: 'removed' } });

    const after = await getUserCapabilities(user._id);
    assert.equal(after.companies.length, 0, 'revocation takes effect on the next request');
    assert.equal(after.isRecruiterAnywhere, false);
  });

  test('one membership per user per company', async () => {
    const company = await makeCompany('cap-dupe', 'Cap Dupe');
    await CompanyMember.create({ userId: user._id, companyId: company._id, role: 'recruiter' });

    await assert.rejects(
      () => CompanyMember.create({ userId: user._id, companyId: company._id, role: 'owner' }),
      (error) => error.code === 11000,
    );
  });

  test('one candidate profile per user', async () => {
    await CandidateProfile.create({ userId: user._id });
    await assert.rejects(
      () => CandidateProfile.create({ userId: user._id }),
      (error) => error.code === 11000,
    );
  });
});

describe('permission resolution', () => {
  test('an inactive membership grants nothing', () => {
    const suspended = { role: COMPANY_ROLES.OWNER, status: 'suspended' };
    assert.equal(can(suspended, PERMISSIONS.CANDIDATE_VIEW), false, 'fails closed');
  });

  test('role determines permissions, per company', () => {
    const owner = { role: COMPANY_ROLES.OWNER, status: 'active' };
    const viewer = { role: COMPANY_ROLES.VIEWER, status: 'active' };

    assert.ok(canAll(owner, [PERMISSIONS.COMPANY_DELETE, PERMISSIONS.MEMBER_MANAGE]));
    assert.equal(can(viewer, PERMISSIONS.COMPANY_DELETE), false);
    assert.equal(can(viewer, PERMISSIONS.CANDIDATE_VIEW), true);
  });

  test('an override grants beyond the role without changing it', () => {
    const admin = {
      role: COMPANY_ROLES.ADMIN,
      status: 'active',
      permissionOverrides: [PERMISSIONS.COMPANY_TRANSFER],
    };

    assert.equal(can(admin, PERMISSIONS.COMPANY_TRANSFER), true);
    assert.equal(admin.role, COMPANY_ROLES.ADMIN);
  });
});
