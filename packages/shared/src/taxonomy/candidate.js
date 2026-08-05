/**
 * Candidate vocabularies — PRD §8.3, §8.4, §12.
 *
 * Scope follows PRD §20.2: the MVP optimises a small set of **pilot priority roles** rather than
 * every role in §8.4, explicitly "to avoid an unbounded dynamic-profile implementation". Roles
 * outside the list still work — they get the generic sections, just not role-specific questions.
 *
 * These are the option lists. Which questions appear, and in what order, is database
 * configuration in `questionBanks` (ADR-007), not code.
 */

/** PRD §8.4 role families. */
export const ROLE_FAMILIES = Object.freeze({
  PRIVATE_INSTRUCTION: 'private_instruction',
  SCHOOL_TEACHING: 'school_teaching',
  HIGHER_EDUCATION: 'higher_education',
  COUNSELING: 'counseling',
  CURRICULUM: 'curriculum',
  LEADERSHIP: 'leadership',
  LANGUAGE_SPECIALIST: 'language_specialist',
  TRAINING_CONSULTING: 'training_consulting',
});

export const ROLE_FAMILY_LABELS = Object.freeze({
  [ROLE_FAMILIES.PRIVATE_INSTRUCTION]: 'Private and supplemental instruction',
  [ROLE_FAMILIES.SCHOOL_TEACHING]: 'School teaching',
  [ROLE_FAMILIES.HIGHER_EDUCATION]: 'Higher education',
  [ROLE_FAMILIES.COUNSELING]: 'Counseling and student support',
  [ROLE_FAMILIES.CURRICULUM]: 'Curriculum and content',
  [ROLE_FAMILIES.LEADERSHIP]: 'Leadership and operations',
  [ROLE_FAMILIES.LANGUAGE_SPECIALIST]: 'Language and specialist education',
  [ROLE_FAMILIES.TRAINING_CONSULTING]: 'Training and consulting',
});

/**
 * Target roles. The five marked `priority` are PRD §20.2's pilot set — the only ones that get
 * role-specific dynamic questions in MVP.
 */
export const CANDIDATE_ROLE_OPTIONS = Object.freeze([
  { value: 'private_tutor', label: 'Private tutor', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION, priority: true },
  { value: 'test_prep_tutor', label: 'Test-prep tutor', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION, priority: true },
  { value: 'academic_coach', label: 'Academic coach', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION },
  { value: 'school_teacher', label: 'School teacher', family: ROLE_FAMILIES.SCHOOL_TEACHING, priority: true },
  { value: 'teaching_assistant', label: 'Teaching assistant', family: ROLE_FAMILIES.SCHOOL_TEACHING, priority: true },
  { value: 'special_education_teacher', label: 'Special-education teacher', family: ROLE_FAMILIES.SCHOOL_TEACHING },
  { value: 'professor_lecturer', label: 'Professor / lecturer / adjunct', family: ROLE_FAMILIES.HIGHER_EDUCATION, priority: true },
  { value: 'admissions_counselor', label: 'Admissions / academic counselor', family: ROLE_FAMILIES.COUNSELING, priority: true },
  { value: 'school_counselor', label: 'School counselor', family: ROLE_FAMILIES.COUNSELING },
  { value: 'curriculum_designer', label: 'Curriculum or content specialist', family: ROLE_FAMILIES.CURRICULUM, priority: true },
  { value: 'instructional_designer', label: 'Instructional designer', family: ROLE_FAMILIES.CURRICULUM },
  { value: 'academic_coordinator', label: 'Academic coordinator', family: ROLE_FAMILIES.LEADERSHIP },
  { value: 'language_instructor', label: 'Language / ESL instructor', family: ROLE_FAMILIES.LANGUAGE_SPECIALIST },
  { value: 'teacher_trainer', label: 'Teacher trainer', family: ROLE_FAMILIES.TRAINING_CONSULTING },
]);

export const CANDIDATE_ROLE_VALUES = Object.freeze(
  CANDIDATE_ROLE_OPTIONS.map((option) => option.value),
);

/** PRD §20.2 pilot priority roles — the ones with an optimised role-specific experience. */
export const PRIORITY_ROLE_VALUES = Object.freeze(
  CANDIDATE_ROLE_OPTIONS.filter((option) => option.priority).map((option) => option.value),
);

export const CANDIDATE_ROLE_LABELS = Object.freeze(
  Object.fromEntries(CANDIDATE_ROLE_OPTIONS.map((option) => [option.value, option.label])),
);

/** Subject/programme domains — PRD §8.3 section 3. */
export const SUBJECT_OPTIONS = Object.freeze([
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'physics', label: 'Physics' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'biology', label: 'Biology' },
  { value: 'computer_science', label: 'Computer science' },
  { value: 'english_language', label: 'English language' },
  { value: 'english_literature', label: 'English literature' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'economics', label: 'Economics' },
  { value: 'business_studies', label: 'Business studies' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'foreign_languages', label: 'Foreign languages' },
  { value: 'test_prep', label: 'Test preparation' },
  { value: 'admissions_counseling', label: 'Admissions counseling' },
  { value: 'special_education', label: 'Special education' },
  { value: 'early_years', label: 'Early years' },
  { value: 'arts_music', label: 'Arts and music' },
]);

export const SUBJECT_VALUES = Object.freeze(SUBJECT_OPTIONS.map((o) => o.value));
export const SUBJECT_LABELS = Object.freeze(
  Object.fromEntries(SUBJECT_OPTIONS.map((o) => [o.value, o.label])),
);

/** Learner segments — PRD §8.5 requires at least one for publication. */
export const LEARNER_SEGMENT_OPTIONS = Object.freeze([
  { value: 'early_years', label: 'Early years (3–5)' },
  { value: 'primary', label: 'Primary (6–10)' },
  { value: 'middle_school', label: 'Middle school (11–13)' },
  { value: 'high_school', label: 'High school (14–18)' },
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'postgraduate', label: 'Postgraduate' },
  { value: 'adult_learners', label: 'Adult learners' },
  { value: 'special_needs', label: 'Special educational needs' },
]);

export const LEARNER_SEGMENT_VALUES = Object.freeze(LEARNER_SEGMENT_OPTIONS.map((o) => o.value));
export const LEARNER_SEGMENT_LABELS = Object.freeze(
  Object.fromEntries(LEARNER_SEGMENT_OPTIONS.map((o) => [o.value, o.label])),
);

/** Availability — PRD §8.5 "work preference". */
export const AVAILABILITY_OPTIONS = Object.freeze([
  { value: 'immediately', label: 'Immediately' },
  { value: 'within_month', label: 'Within a month' },
  { value: 'within_quarter', label: 'Within three months' },
  { value: 'exploring', label: 'Just exploring' },
]);

export const AVAILABILITY_VALUES = Object.freeze(AVAILABILITY_OPTIONS.map((o) => o.value));
export const AVAILABILITY_LABELS = Object.freeze(
  Object.fromEntries(AVAILABILITY_OPTIONS.map((o) => [o.value, o.label])),
);

/**
 * Countries — PRD §8.5 makes country/region required for publication.
 *
 * A pragmatic list covering the pilot's markets rather than all 249 ISO entries: PRD §20 scopes
 * the MVP to a limited pilot, and a 249-item checkbox list is worse for the candidate than a
 * short one. Extending it is a data change, not a code change.
 */
export const COUNTRY_OPTIONS = Object.freeze([
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AU', label: 'Australia' },
  { value: 'CA', label: 'Canada' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'IE', label: 'Ireland' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'HK', label: 'Hong Kong SAR' },
  { value: 'QA', label: 'Qatar' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'DE', label: 'Germany' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'ES', label: 'Spain' },
  { value: 'OTHER', label: 'Elsewhere' },
]);

export const COUNTRY_VALUES = Object.freeze(COUNTRY_OPTIONS.map((o) => o.value));
export const COUNTRY_LABELS = Object.freeze(
  Object.fromEntries(COUNTRY_OPTIONS.map((o) => [o.value, o.label])),
);

/** IANA time zones covering the pilot markets — PRD §8.5 "location/time-zone preference". */
export const TIMEZONE_OPTIONS = Object.freeze([
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dubai', label: 'Gulf (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
  { value: 'Europe/London', label: 'UK (GMT/BST)' },
  { value: 'Europe/Dublin', label: 'Ireland (GMT/IST)' },
  { value: 'Europe/Berlin', label: 'Central Europe (CET)' },
  { value: 'Africa/Johannesburg', label: 'South Africa (SAST)' },
  { value: 'America/New_York', label: 'US Eastern (ET)' },
  { value: 'America/Chicago', label: 'US Central (CT)' },
  { value: 'America/Denver', label: 'US Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'America/Toronto', label: 'Canada Eastern (ET)' },
  { value: 'Australia/Sydney', label: 'Australia Eastern (AET)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (NZT)' },
]);

export const TIMEZONE_VALUES = Object.freeze(TIMEZONE_OPTIONS.map((o) => o.value));
export const TIMEZONE_LABELS = Object.freeze(
  Object.fromEntries(TIMEZONE_OPTIONS.map((o) => [o.value, o.label])),
);

/** Teaching languages — PRD §8.3 section 1, and Appendix B's Language filter group. */
export const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'bn', label: 'Bengali' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Mandarin' },
  { value: 'ms', label: 'Malay' },
]);

export const LANGUAGE_VALUES = Object.freeze(LANGUAGE_OPTIONS.map((o) => o.value));
export const LANGUAGE_LABELS = Object.freeze(
  Object.fromEntries(LANGUAGE_OPTIONS.map((o) => [o.value, o.label])),
);
