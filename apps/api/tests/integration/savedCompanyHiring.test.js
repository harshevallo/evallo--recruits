/**
 * Derived hiring status on the candidate's own surfaces — `listSavedCompanies` and
 * `getCompanyRelationship`.
 *
 * ── Why these exist ───────────────────────────────────────────────────────────────────────────
 *
 * "Hiring" has two definitions: a MANUAL flag nothing keeps in step with reality, and the fact of
 * having at least one ACTIVE role. The public directory and profile answer with both — see
 * `resolveIsHiring` — but these two candidate-facing serializers answered with the flag alone. A
 * company with two open roles and the flag off therefore showed no "Hiring" badge on the saved
 * list while its own profile, one click away, said "Currently hiring".
 *
 * The interesting case is the FIRST one below: flag `false`, one active role, expected `true`. It
 * is the case the flag alone gets wrong, and the only one that would still pass if these
 * serializers quietly went back to reading `isCurrentlyHiring`.
 *
 * `isCurrentlyHiring` is asserted alongside `isHiring` throughout: the field was kept, not
 * replaced, so anything already reading it keeps working.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANDIDATE_VISIBILITY,
  CONTACT_VISIBILITY,
  COMPANY_STATUS,
  HIRING_INTENT_STATUS,
} from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../../src/lib/db.js';
import { User } from '../../src/modules/users/user.model.js';
import { CandidateProfile } from '../../src/modules/candidates/candidateProfile.model.js';
import { Company } from '../../src/modules/companies/company.model.js';
import { HiringIntent } from '../../src/modules/hiring-intents/hiringIntent.model.js';
import { SavedCompany } from '../../src/modules/candidates/savedCompany.model.js';
import {
  listSavedCompanies,
  getCompanyRelationship,
} from '../../src/modules/candidates/candidateInterest.service.js';

const CANDIDATE_EMAIL = 'saved-hiring@example.test';

/** Three companies, one per case in the matrix. */
const SLUGS = {
  ROLES_ONLY: 'saved-hiring-roles-only',
  NEITHER: 'saved-hiring-neither',
  FLAGGED: 'saved-hiring-flagged',
};

let profile;

before(connectDatabase);

after(async () => {
  await cleanup();
  await disconnectDatabase();
});

async function cleanup() {
  const slugs = Object.values(SLUGS);
  const companies = await Company.find({ slug: { $in: slugs } }).select('_id').lean();
  const ids = companies.map((c) => c._id);

  await HiringIntent.deleteMany({ companyId: { $in: ids } });
  await SavedCompany.deleteMany({ companyId: { $in: ids } });
  await Company.deleteMany({ slug: { $in: slugs } });

  const users = await User.find({ email: CANDIDATE_EMAIL }).select('_id').lean();
  await CandidateProfile.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: CANDIDATE_EMAIL });
}

const makeCompany = (slug, name, isCurrentlyHiring) =>
  Company.create({
    slug,
    name,
    organizationType: 'tutoring_center',
    status: COMPANY_STATUS.PUBLISHED,
    location: { country: 'IN' },
    isCurrentlyHiring,
  });

const addActiveRole = (companyId) =>
  HiringIntent.create({
    companyId,
    title: 'Open Role',
    status: HIRING_INTENT_STATUS.ACTIVE,
    roleCategories: ['private_tutor'],
    employmentTypes: ['part_time'],
    deliveryModes: ['remote'],
  });

/** The saved-list row for one slug. */
async function savedRow(slug) {
  const rows = await listSavedCompanies(profile);
  return rows.find((row) => row.company.slug === slug)?.company;
}

beforeEach(async () => {
  await cleanup();

  const user = await User.create({
    email: CANDIDATE_EMAIL,
    name: 'Saved Hiring Candidate',
    emailVerified: true,
  });
  profile = await CandidateProfile.create({
    userId: user._id,
    status: CANDIDATE_VISIBILITY.DISCOVERABLE,
    contactVisibility: CONTACT_VISIBILITY.HIDDEN,
  });

  /* Flag OFF, one ACTIVE role — the case the manual flag alone gets wrong. */
  const rolesOnly = await makeCompany(SLUGS.ROLES_ONLY, 'Roles Only Academy', false);
  await addActiveRole(rolesOnly._id);

  /* Flag OFF, no roles at all. */
  const neither = await makeCompany(SLUGS.NEITHER, 'Quiet Academy', false);

  /* Flag ON — the pre-existing behaviour that must not regress. */
  const flagged = await makeCompany(SLUGS.FLAGGED, 'Flagged Academy', true);

  await SavedCompany.insertMany(
    [rolesOnly, neither, flagged].map((company) => ({
      candidateId: profile._id,
      companyId: company._id,
    })),
  );
});

describe('listSavedCompanies', () => {
  test('an active role makes a company hiring even with the flag off', async () => {
    const company = await savedRow(SLUGS.ROLES_ONLY);

    assert.equal(company.isHiring, true, 'two open roles is what "hiring" means');
    assert.equal(company.isCurrentlyHiring, false, 'the raw flag is reported unchanged');
  });

  test('no flag and no roles is not hiring', async () => {
    const company = await savedRow(SLUGS.NEITHER);

    assert.equal(company.isHiring, false);
    assert.equal(company.isCurrentlyHiring, false);
  });

  test('a company that marked itself hiring still is', async () => {
    const company = await savedRow(SLUGS.FLAGGED);

    assert.equal(company.isHiring, true, 'the manual flag alone is still sufficient');
    assert.equal(company.isCurrentlyHiring, true);
  });

  /**
   * A DRAFT role is not evidence of anything.
   *
   * The clause matches on `status: active` specifically, and an unpublished draft must not make a
   * company look like it is hiring — that would be worse than the bug being fixed.
   */
  test('a draft role does not make a company hiring', async () => {
    const company = await Company.findOne({ slug: SLUGS.NEITHER });
    await HiringIntent.create({
      companyId: company._id,
      title: 'Not posted yet',
      status: HIRING_INTENT_STATUS.DRAFT,
      roleCategories: ['private_tutor'],
      employmentTypes: ['part_time'],
      deliveryModes: ['remote'],
    });

    assert.equal((await savedRow(SLUGS.NEITHER)).isHiring, false);
  });
});

describe('getCompanyRelationship', () => {
  test('an active role makes a company hiring even with the flag off', async () => {
    const relationship = await getCompanyRelationship(profile, SLUGS.ROLES_ONLY);

    assert.equal(relationship.isHiring, true);
    assert.equal(relationship.isCurrentlyHiring, false, 'the raw flag is reported unchanged');
  });

  test('no flag and no roles is not hiring', async () => {
    const relationship = await getCompanyRelationship(profile, SLUGS.NEITHER);

    assert.equal(relationship.isHiring, false);
    assert.equal(relationship.isCurrentlyHiring, false);
  });

  test('a company that marked itself hiring still is', async () => {
    const relationship = await getCompanyRelationship(profile, SLUGS.FLAGGED);

    assert.equal(relationship.isHiring, true);
    assert.equal(relationship.isCurrentlyHiring, true);
  });
});

/**
 * The point of the whole change: these two surfaces and the public profile must never disagree
 * about one company. Asserted directly rather than inferred from the three cases above.
 */
describe('the candidate surfaces agree with the public profile', () => {
  test('saved list, relationship and public profile give the same answer', async () => {
    const { getPublicCompanyBySlug } = await import(
      '../../src/modules/public/companyPublic.service.js'
    );

    for (const slug of Object.values(SLUGS)) {
      const [row, relationship, publicView] = await Promise.all([
        savedRow(slug),
        getCompanyRelationship(profile, slug),
        getPublicCompanyBySlug(slug),
      ]);

      assert.equal(
        row.isHiring,
        publicView.isHiring,
        `saved list disagrees with the public profile for ${slug}`,
      );
      assert.equal(
        relationship.isHiring,
        publicView.isHiring,
        `relationship overlay disagrees with the public profile for ${slug}`,
      );
    }
  });
});
