/** Education services / programs — PRD §13, §7.3. Used as a directory facet (§9.1). */

export const EDUCATION_SERVICES = Object.freeze({
  ACADEMIC_TUTORING: 'academic_tutoring',
  TEST_PREPARATION: 'test_preparation',
  ADMISSIONS_COUNSELING: 'admissions_counseling',
  CAREER_COUNSELING: 'career_counseling',
  CURRICULUM_DESIGN: 'curriculum_design',
  TEACHER_TRAINING: 'teacher_training',
  LANGUAGE_INSTRUCTION: 'language_instruction',
  SPECIAL_EDUCATION_SUPPORT: 'special_education_support',
  STEM_ENRICHMENT: 'stem_enrichment',
  ARTS_MUSIC: 'arts_music',
  EARLY_CHILDHOOD: 'early_childhood',
  HOMEWORK_SUPPORT: 'homework_support',
});

export const EDUCATION_SERVICE_VALUES = Object.freeze(Object.values(EDUCATION_SERVICES));

export const EDUCATION_SERVICE_OPTIONS = Object.freeze([
  { value: EDUCATION_SERVICES.ACADEMIC_TUTORING, label: 'Academic tutoring' },
  { value: EDUCATION_SERVICES.TEST_PREPARATION, label: 'Test preparation' },
  { value: EDUCATION_SERVICES.ADMISSIONS_COUNSELING, label: 'Admissions counseling' },
  { value: EDUCATION_SERVICES.CAREER_COUNSELING, label: 'Career counseling' },
  { value: EDUCATION_SERVICES.CURRICULUM_DESIGN, label: 'Curriculum design' },
  { value: EDUCATION_SERVICES.TEACHER_TRAINING, label: 'Teacher training' },
  { value: EDUCATION_SERVICES.LANGUAGE_INSTRUCTION, label: 'Language instruction' },
  { value: EDUCATION_SERVICES.SPECIAL_EDUCATION_SUPPORT, label: 'Special education support' },
  { value: EDUCATION_SERVICES.STEM_ENRICHMENT, label: 'STEM enrichment' },
  { value: EDUCATION_SERVICES.ARTS_MUSIC, label: 'Arts & music' },
  { value: EDUCATION_SERVICES.EARLY_CHILDHOOD, label: 'Early childhood' },
  { value: EDUCATION_SERVICES.HOMEWORK_SUPPORT, label: 'Homework support' },
]);

export const EDUCATION_SERVICE_LABELS = Object.freeze(
  Object.fromEntries(EDUCATION_SERVICE_OPTIONS.map((o) => [o.value, o.label])),
);
