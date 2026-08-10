/**
 * Question bank v1 — the seeded configuration for CAN-02 (ADR-007, PRD §8.3).
 *
 * Scope note. PRD §8.3 lists twelve sections. Sections 4–11 (experience, education, credentials,
 * scores, teaching practice, outcomes, portfolio/media, references) are the **evidence layer**:
 * ADR-008 puts each in its own collection with its own per-item visibility and verification
 * state, which no single form can capture. They are not in this bank, and PRD §20.3 already
 * defers reference collection and credential issuer verification to Phase 2.
 *
 * What is here is every section the profile document can carry today, which is also everything
 * PRD §8.5 marks "required for publication" apart from an experience entry. Extending the bank is
 * a new version of this data — not a code change — which is the whole point of ADR-007.
 */

import { QUESTION_TYPES, ANSWER_TARGETS } from './questionBank.model.js';

export const QUESTION_BANK_VERSION = 6;

export const QUESTION_BANK = Object.freeze([
  {
    key: 'professional_identity',
    title: 'Professional identity',
    description: 'How you introduce yourself to a recruiter. This is the first thing they read.',
    order: 1,
    optional: false,
    questions: [
      {
        /*
         * The personal layer owns the name (05_DATABASE_SCHEMA §2), so this writes `users.name`
         * rather than copying it onto the candidate profile. One field, not first/last: the model
         * stores one name, and splitting it in the form would invent a structure nothing reads.
         */
        key: 'fullName',
        label: 'Full name',
        placeholder: 'e.g. Sarah Jenkins',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.USER,
        field: 'name',
        maxLength: 120,
      },
      {
        key: 'headline',
        label: 'Professional headline',
        help: 'One line. For example: "IB Physics teacher · 10 years · Bengaluru".',
        placeholder: 'IB Physics teacher · 10 years',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'headline',
        requiredForPublish: true,
        maxLength: 200,
      },
      {
        key: 'summary',
        label: 'Short introduction',
        help: 'Two to four sentences on how you teach and who you teach.',
        type: QUESTION_TYPES.LONG_TEXT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'summary',
        requiredForPublish: true,
        maxLength: 2000,
      },
      {
        key: 'pronouns',
        label: 'Pronouns',
        help: 'Optional. Shown on your profile exactly as you write it.',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 40,
      },
      {
        // PRD §8.5 — country/region is required for publication.
        key: 'country',
        label: 'Where are you based?',
        type: QUESTION_TYPES.SINGLE_SELECT,
        target: ANSWER_TARGETS.USER,
        field: 'location.country',
        optionSet: 'countries',
        requiredForPublish: true,
      },
      {
        key: 'region',
        label: 'State, region, or city',
        help: 'Helps companies hiring for a specific area find you.',
        placeholder: 'Bengaluru, Karnataka',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.USER,
        field: 'location.region',
        maxLength: 120,
      },
      {
        /*
         * Time zone sits beside location because that is the question it answers — "when can we
         * reach you", not "what job do you want". PRD §8.5 counts it under work preference; which
         * SCREEN it appears on is a bank ordering decision, and the answer is stored identically
         * either way.
         */
        key: 'timezone',
        label: 'Primary time zone',
        type: QUESTION_TYPES.SINGLE_SELECT,
        target: ANSWER_TARGETS.USER,
        field: 'location.timezone',
        optionSet: 'timezones',
        requiredForPublish: true,
      },
      {
        key: 'languages',
        presentation: 'chips',
        label: 'Languages you teach in',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.USER,
        field: 'languages',
        optionSet: 'languages',
      },
    ],
  },
  {
    key: 'role_preferences',
    title: 'Roles and work preferences',
    description: 'The opportunities you want. This is what companies filter on.',
    order: 2,
    optional: false,
    questions: [
      {
        key: 'targetRoles',
        presentation: 'cards',
        label: 'Target education roles',
        help: 'Select all roles you are seeking. Your selections tailor specific prompts across the builder.',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'targetRoles',
        optionSet: 'candidateRoles',
        requiredForPublish: true,
      },
      {
        key: 'employmentTypes',
        presentation: 'pills',
        label: 'Engagement type',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'employmentTypes',
        optionSet: 'employmentTypes',
        requiredForPublish: true,
      },
      {
        key: 'deliveryModes',
        presentation: 'pills',
        label: 'Delivery mode',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'deliveryModes',
        optionSet: 'deliveryModes',
        requiredForPublish: true,
      },
      {
        key: 'availability',
        label: 'When could you start?',
        type: QUESTION_TYPES.SINGLE_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'availability',
        optionSet: 'availability',
        requiredForPublish: true,
      },
      {
        /*
         * Appendix C, location conditionality: on-site interest triggers a location question;
         * a remote-only candidate is never forced through commuting questions.
         */
        key: 'onsiteCity',
        label: 'Which city or area can you work on-site in?',
        help: 'Only asked because you selected on-site or hybrid work.',
        placeholder: 'Central Bengaluru, up to 15 km',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.USER,
        field: 'location.city',
        maxLength: 120,
        onlyForDeliveryModes: ['on_site', 'hybrid'],
      },
      {
        key: 'yearsExperience',
        label: 'Years of teaching experience',
        type: QUESTION_TYPES.NUMBER,
        target: ANSWER_TARGETS.PROFILE,
        field: 'yearsExperience',
        min: 0,
        max: 60,
      },
      {
        /*
         * Compensation and work authorisation are answers, not profile columns: they are free
         * text that nothing filters or indexes today, so they live in `candidateAnswers` where a
         * bank revision can change or retire them without a migration.
         */
        key: 'compensation',
        label: 'Expected rate / compensation',
        placeholder: 'e.g. ₹1,500–2,000 / hr, or 12–15 LPA',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 120,
      },
      {
        key: 'workAuthorization',
        label: 'Work authorization',
        placeholder: 'e.g. Indian citizen, H-1B, Right to work in the UK',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 160,
      },
    ],
  },
  {
    key: 'teaching_expertise',
    title: 'Teaching expertise',
    description: 'What you teach, and whom you teach it to.',
    order: 3,
    optional: false,
    questions: [
      {
        key: 'subjects',
        presentation: 'chips',
        label: 'Subjects and standardised tests',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'subjects',
        optionSet: 'subjects',
        requiredForPublish: true,
      },
      {
        key: 'learnerSegments',
        presentation: 'tiles',
        label: 'Learner levels',
        help: 'The age groups or levels you teach.',
        type: QUESTION_TYPES.MULTI_SELECT,
        target: ANSWER_TARGETS.PROFILE,
        field: 'learnerSegments',
        optionSet: 'learnerSegments',
        requiredForPublish: true,
      },
      {
        // PRD §20.2 — a role-specific question for two of the pilot priority roles.
        key: 'testsPrepared',
        label: 'Which tests do you prepare students for?',
        help: 'For example: SAT, ACT, IELTS, JEE.',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 200,
        onlyForRoles: ['test_prep_tutor', 'private_tutor'],
      },
      {
        key: 'curriculaTaught',
        label: 'Curricula and special populations',
        help: 'For example: IB, CBSE, A-levels, AP.',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 200,
        onlyForRoles: ['school_teacher', 'teaching_assistant', 'professor_lecturer'],
      },
    ],
  },
  {
    key: 'teaching_practice',
    title: 'Teaching practice',
    description: 'How you approach the work. Optional, but it is what makes a profile memorable.',
    order: 4,
    optional: true,
    questions: [
      {
        key: 'philosophy',
        label: 'Your teaching philosophy',
        help: 'What do you believe makes teaching effective?',
        type: QUESTION_TYPES.LONG_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 2000,
      },
      {
        key: 'differentiation',
        label: 'How do you support learners at different levels?',
        type: QUESTION_TYPES.LONG_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 2000,
      },
      {
        /*
         * PRD §20.2 role-specific depth. `onlyForRoles` is what makes the tutoring block appear
         * and disappear with the candidate's role selection — the conditional behaviour is bank
         * configuration, evaluated by isQuestionVisible, not a switch in the page.
         */
        key: 'diagnosticProcess',
        label: 'Describe your diagnostic process for building individual study plans.',
        placeholder: 'When a student first comes to me, I begin by…',
        type: QUESTION_TYPES.LONG_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 2000,
        group: 'test_prep',
        onlyForRoles: ['test_prep_tutor', 'private_tutor'],
      },
      {
        key: 'scoreGains',
        label: 'Representative score gains achieved',
        placeholder: 'e.g. Average +150 points on the SAT over 3 months from a 1200 base',
        type: QUESTION_TYPES.SHORT_TEXT,
        target: ANSWER_TARGETS.ANSWER,
        maxLength: 200,
        group: 'test_prep',
        onlyForRoles: ['test_prep_tutor', 'private_tutor'],
      },
    ],
  },
]);
