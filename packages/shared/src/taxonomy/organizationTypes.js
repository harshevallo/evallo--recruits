/** Organization types — PRD §13 (Company identity). */

export const ORGANIZATION_TYPES = Object.freeze({
  TUTORING_CENTER: 'tutoring_center',
  TEST_PREP: 'test_prep',
  ONLINE_TUTORING: 'online_tutoring',
  K12_SCHOOL: 'k12_school',
  INTERNATIONAL_SCHOOL: 'international_school',
  COLLEGE_UNIVERSITY: 'college_university',
  ADMISSIONS_CONSULTING: 'admissions_consulting',
  CURRICULUM_PUBLISHER: 'curriculum_publisher',
  EDTECH: 'edtech',
  TRAINING_PROVIDER: 'training_provider',
  SPECIAL_EDUCATION: 'special_education',
  LANGUAGE_SCHOOL: 'language_school',
});

export const ORGANIZATION_TYPE_VALUES = Object.freeze(Object.values(ORGANIZATION_TYPES));

export const ORGANIZATION_TYPE_OPTIONS = Object.freeze([
  { value: ORGANIZATION_TYPES.TUTORING_CENTER, label: 'Tutoring center' },
  { value: ORGANIZATION_TYPES.TEST_PREP, label: 'Test prep' },
  { value: ORGANIZATION_TYPES.ONLINE_TUTORING, label: 'Online tutoring' },
  { value: ORGANIZATION_TYPES.K12_SCHOOL, label: 'K–12 school' },
  { value: ORGANIZATION_TYPES.INTERNATIONAL_SCHOOL, label: 'International school' },
  { value: ORGANIZATION_TYPES.COLLEGE_UNIVERSITY, label: 'College / university' },
  { value: ORGANIZATION_TYPES.ADMISSIONS_CONSULTING, label: 'Admissions consulting' },
  { value: ORGANIZATION_TYPES.CURRICULUM_PUBLISHER, label: 'Curriculum publisher' },
  { value: ORGANIZATION_TYPES.EDTECH, label: 'EdTech' },
  { value: ORGANIZATION_TYPES.TRAINING_PROVIDER, label: 'Training provider' },
  { value: ORGANIZATION_TYPES.SPECIAL_EDUCATION, label: 'Special education' },
  { value: ORGANIZATION_TYPES.LANGUAGE_SCHOOL, label: 'Language school' },
]);

export const ORGANIZATION_TYPE_LABELS = Object.freeze(
  Object.fromEntries(ORGANIZATION_TYPE_OPTIONS.map((o) => [o.value, o.label])),
);

/**
 * Headcount bands — PRD §7.4 renders this as "{sizeRange} employees" on the public profile.
 *
 * `companies.sizeRange` stays an unconstrained String on the model rather than an enum. The value
 * is a display band, not a facet: nothing filters, sorts, or aggregates on it, so an enum would buy
 * no query guarantee while making any row that predates this list — or arrives from an import —
 * fail validation on its next unrelated save. The picker constrains what is entered from here on,
 * which is where the inconsistency actually came from.
 */
export const COMPANY_SIZE_OPTIONS = Object.freeze([
  { value: '1-10', label: '1–10' },
  { value: '11-50', label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '201-500', label: '201–500' },
  { value: '501-1000', label: '501–1000' },
  { value: '1000+', label: '1000+' },
]);

export const COMPANY_SIZE_VALUES = Object.freeze(COMPANY_SIZE_OPTIONS.map((o) => o.value));
