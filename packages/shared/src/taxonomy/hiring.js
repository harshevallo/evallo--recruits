/** Hiring intent vocabularies — PRD §7.5. */

export const ROLE_CATEGORIES = Object.freeze({
  PRIVATE_TUTOR: 'private_tutor',
  TEST_PREP_TUTOR: 'test_prep_tutor',
  SCHOOL_TEACHER: 'school_teacher',
  TEACHING_ASSISTANT: 'teaching_assistant',
  PROFESSOR_LECTURER: 'professor_lecturer',
  ADMISSIONS_COUNSELOR: 'admissions_counselor',
  ACADEMIC_COACH: 'academic_coach',
  CURRICULUM_DESIGNER: 'curriculum_designer',
  CONTENT_WRITER: 'content_writer',
  LANGUAGE_INSTRUCTOR: 'language_instructor',
  SPECIAL_ED_SPECIALIST: 'special_ed_specialist',
  ACADEMIC_ADMINISTRATOR: 'academic_administrator',
});

export const ROLE_CATEGORY_VALUES = Object.freeze(Object.values(ROLE_CATEGORIES));

export const ROLE_CATEGORY_OPTIONS = Object.freeze([
  { value: ROLE_CATEGORIES.PRIVATE_TUTOR, label: 'Private tutor' },
  { value: ROLE_CATEGORIES.TEST_PREP_TUTOR, label: 'Test-prep tutor' },
  { value: ROLE_CATEGORIES.SCHOOL_TEACHER, label: 'School teacher' },
  { value: ROLE_CATEGORIES.TEACHING_ASSISTANT, label: 'Teaching assistant' },
  { value: ROLE_CATEGORIES.PROFESSOR_LECTURER, label: 'Professor / lecturer' },
  { value: ROLE_CATEGORIES.ADMISSIONS_COUNSELOR, label: 'Admissions counselor' },
  { value: ROLE_CATEGORIES.ACADEMIC_COACH, label: 'Academic coach' },
  { value: ROLE_CATEGORIES.CURRICULUM_DESIGNER, label: 'Curriculum designer' },
  { value: ROLE_CATEGORIES.CONTENT_WRITER, label: 'Content writer' },
  { value: ROLE_CATEGORIES.LANGUAGE_INSTRUCTOR, label: 'Language instructor' },
  { value: ROLE_CATEGORIES.SPECIAL_ED_SPECIALIST, label: 'Special-ed specialist' },
  { value: ROLE_CATEGORIES.ACADEMIC_ADMINISTRATOR, label: 'Academic administrator' },
]);

export const ROLE_CATEGORY_LABELS = Object.freeze(
  Object.fromEntries(ROLE_CATEGORY_OPTIONS.map((o) => [o.value, o.label])),
);

export const EMPLOYMENT_TYPES = Object.freeze({
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACT: 'contract',
  FREELANCE: 'freelance',
  INTERNSHIP: 'internship',
  SUBSTITUTE: 'substitute',
  SEASONAL: 'seasonal',
  VOLUNTEER: 'volunteer',
});

export const EMPLOYMENT_TYPE_VALUES = Object.freeze(Object.values(EMPLOYMENT_TYPES));

export const EMPLOYMENT_TYPE_LABELS = Object.freeze({
  [EMPLOYMENT_TYPES.FULL_TIME]: 'Full-time',
  [EMPLOYMENT_TYPES.PART_TIME]: 'Part-time',
  [EMPLOYMENT_TYPES.CONTRACT]: 'Contract',
  [EMPLOYMENT_TYPES.FREELANCE]: 'Freelance',
  [EMPLOYMENT_TYPES.INTERNSHIP]: 'Internship',
  [EMPLOYMENT_TYPES.SUBSTITUTE]: 'Substitute',
  [EMPLOYMENT_TYPES.SEASONAL]: 'Seasonal',
  [EMPLOYMENT_TYPES.VOLUNTEER]: 'Volunteer',
});

export const DELIVERY_MODES = Object.freeze({
  ON_SITE: 'on_site',
  REMOTE: 'remote',
  HYBRID: 'hybrid',
});

export const DELIVERY_MODE_VALUES = Object.freeze(Object.values(DELIVERY_MODES));

export const DELIVERY_MODE_OPTIONS = Object.freeze([
  { value: DELIVERY_MODES.ON_SITE, label: 'On-site' },
  { value: DELIVERY_MODES.REMOTE, label: 'Remote' },
  { value: DELIVERY_MODES.HYBRID, label: 'Hybrid' },
]);

export const DELIVERY_MODE_LABELS = Object.freeze(
  Object.fromEntries(DELIVERY_MODE_OPTIONS.map((o) => [o.value, o.label])),
);
