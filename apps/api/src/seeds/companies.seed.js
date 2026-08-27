/**
 * Development seed for PUB-01.
 *
 * Run: npm run seed --workspace=apps/api
 *
 * Idempotent — upserts by slug, so re-running refreshes rather than duplicates.
 * All organisations here are fictional.
 */

import {
  COMPANY_STATUS,
  MODERATION_STATUS,
  HIRING_INTENT_STATUS,
  ORGANIZATION_TYPES as OT,
  EDUCATION_SERVICES as ES,
  ROLE_CATEGORIES as RC,
  EMPLOYMENT_TYPES as ET,
  DELIVERY_MODES as DM,
  LEARNER_SEGMENTS as LS,
} from '@evallo/shared';
import { connectDatabase, disconnectDatabase } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { Company } from '../modules/companies/company.model.js';
import { HiringIntent } from '../modules/hiring-intents/hiringIntent.model.js';

/*
 * Cover images point at Unsplash. They are DEV FIXTURE data only — the same illustrative photos the
 * approved PUB-02 reference used — and exist so the cover band renders as something other than an
 * empty slate panel while working on the page. No production path fetches them: a real company's
 * `coverImageUrl` is whatever it enters in the REC-03 step.
 */
const COVER = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=70`;

const COMPANIES = [
  {
    slug: 'seven-square-learning',
    name: 'Seven Square Learning',
    organizationType: OT.TEST_PREP,
    tagline: 'Test Prep & Academic Tutoring',
    location: { country: 'US', region: 'Illinois', city: 'Chicago', timezone: 'America/Chicago' },
    educationServices: [ES.TEST_PREPARATION, ES.ACADEMIC_TUTORING],
    subjects: ['Mathematics', 'Physics', 'SAT', 'ACT'],
    deliveryModes: [DM.HYBRID, DM.REMOTE],
    learnerSegments: [LS.HIGH_SCHOOL, LS.MIDDLE_SCHOOL, LS.UNDERGRADUATE],
    website: 'https://sevensquare.example',
    coverImageUrl: COVER('1522071820081-009f0129c71c'),
    foundingYear: 2016,
    sizeRange: '11-50',
    publicContact: { email: 'careers@sevensquare.example' },
    metrics: [
      { value: '4,200+', label: 'Students taught' },
      { value: '180 pts', label: 'Median SAT gain' },
      { value: '91%', label: 'Instructor retention' },
    ],
    pullQuote: {
      text: 'We teach to a documented starting score and a target. Everything else is detail.',
      attribution: 'Founding instructor team',
    },
    perks: [
      'Annual subject training budget',
      'Exam registration reimbursed',
      'Six-student cohort cap',
      'Flexible remote hours',
    ],
    description: {
      short: 'Small-group and one-to-one SAT/ACT preparation with measured score outcomes.',
      full: 'Seven Square Learning runs test-preparation programmes for high-school students across the Midwest. We combine diagnostic assessment, individualised study plans, and weekly progress reporting to families. Our instructors teach small cohorts of no more than six students, and every programme is built around a documented starting score and a target.',
      mission: 'Make high-quality test preparation measurable and accountable.',
      culture: 'Instructors set their own teaching approach within a shared assessment framework. We fund exam registration and annual subject training for every tutor.',
      philosophy: 'Diagnose before you teach. Every programme opens with a full-length diagnostic, and no study plan is written until we can name which question types are actually costing the student points.',
    },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Senior SAT Math Tutor', roleCategories: [RC.TEST_PREP_TUTOR], employmentTypes: [ET.FULL_TIME], deliveryModes: [DM.REMOTE] },
      { title: 'AP Physics Instructor', roleCategories: [RC.SCHOOL_TEACHER], employmentTypes: [ET.PART_TIME], deliveryModes: [DM.ON_SITE] },
    ],
  },
  {
    slug: 'northgate-academy',
    name: 'Northgate Academy',
    organizationType: OT.K12_SCHOOL,
    tagline: 'Independent day school, grades 6–12',
    location: { country: 'US', region: 'Massachusetts', city: 'Boston', timezone: 'America/New_York' },
    educationServices: [ES.STEM_ENRICHMENT, ES.ACADEMIC_TUTORING, ES.CAREER_COUNSELING],
    subjects: ['Biology', 'Chemistry', 'English Literature'],
    deliveryModes: [DM.ON_SITE],
    learnerSegments: [LS.MIDDLE_SCHOOL, LS.HIGH_SCHOOL],
    website: 'https://northgate.example',
    coverImageUrl: COVER('1523050854058-8df90110c9f1'),
    foundingYear: 1974,
    sizeRange: '51-200',
    metrics: [
      { value: '620', label: 'Students enrolled' },
      { value: '1974', label: 'Founded' },
      { value: '9:1', label: 'Student–teacher ratio' },
    ],
    perks: [
      'Two protected planning periods daily',
      'Departmental materials budget',
      'Tuition remission for staff children',
    ],
    description: {
      short: 'A college-preparatory school focused on inquiry-led science teaching.',
      full: 'Northgate Academy is an independent day school serving roughly 620 students in grades 6 through 12. Our science and mathematics departments run a laboratory-first curriculum, and every student completes an independent research project before graduating.',
      culture: 'Teachers are given two protected planning periods a day and a departmental budget for classroom materials.',
      philosophy: 'Laboratory first. Students meet a phenomenon before they meet the equation that explains it, and every year ends with work they designed themselves.',
    },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Middle School Science Teacher', roleCategories: [RC.SCHOOL_TEACHER], employmentTypes: [ET.FULL_TIME], deliveryModes: [DM.ON_SITE] },
      { title: 'Learning Support Specialist', roleCategories: [RC.SPECIAL_ED_SPECIALIST], employmentTypes: [ET.PART_TIME], deliveryModes: [DM.ON_SITE] },
    ],
  },
  {
    slug: 'meridian-admissions',
    name: 'Meridian Admissions',
    organizationType: OT.ADMISSIONS_CONSULTING,
    tagline: 'University admissions guidance for international students',
    location: { country: 'IN', region: 'Karnataka', city: 'Bengaluru', timezone: 'Asia/Kolkata' },
    educationServices: [ES.ADMISSIONS_COUNSELING, ES.CAREER_COUNSELING],
    subjects: ['Essay Writing', 'Interview Preparation'],
    deliveryModes: [DM.REMOTE],
    learnerSegments: [LS.HIGH_SCHOOL, LS.UNDERGRADUATE],
    website: 'https://meridian-admissions.example',
    coverImageUrl: COVER('1497633762265-9d179a990aa6'),
    foundingYear: 2019,
    sizeRange: '11-50',
    metrics: [
      { value: '18', label: 'Students per counsellor' },
      { value: '2019', label: 'Founded' },
    ],
    pullQuote: {
      text: 'Students write their own essays. We coach, question, and edit — we do not ghostwrite.',
    },
    perks: ['Capped admissions caseload', 'Fully remote team', 'Annual counsellor conference'],
    publicContact: { email: 'hello@meridian-admissions.example', phone: '+91 80 4000 0000' },
    acceptsGeneralInterest: true,
    description: {
      short: 'Application strategy and essay mentoring for US and UK undergraduate admissions.',
      full: 'Meridian Admissions supports students applying to universities in the United States, United Kingdom, and Canada. Counsellors carry a maximum of eighteen students per admissions cycle so that every application receives sustained attention.',
      values: 'Students write their own essays. We coach, question, and edit — we do not ghostwrite.',
      philosophy: 'Fit before rank. We start from what a student actually wants out of four years, and the list follows from that rather than the other way round.',
    },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Admissions Counselor', roleCategories: [RC.ADMISSIONS_COUNSELOR], employmentTypes: [ET.CONTRACT, ET.PART_TIME], deliveryModes: [DM.REMOTE] },
    ],
  },
  {
    slug: 'lumen-online-tutoring',
    name: 'Lumen Online Tutoring',
    organizationType: OT.ONLINE_TUTORING,
    tagline: 'One-to-one tutoring, anywhere',
    location: { country: 'GB', region: 'England', city: 'London', timezone: 'Europe/London' },
    educationServices: [ES.ACADEMIC_TUTORING, ES.HOMEWORK_SUPPORT],
    subjects: ['Mathematics', 'Physics', 'Computer Science'],
    deliveryModes: [DM.REMOTE],
    description: { short: 'A remote-first tutoring network covering GCSE and A-Level subjects.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Mathematics Tutor', roleCategories: [RC.PRIVATE_TUTOR], employmentTypes: [ET.FREELANCE], deliveryModes: [DM.REMOTE] },
      { title: 'Computer Science Tutor', roleCategories: [RC.PRIVATE_TUTOR], employmentTypes: [ET.PART_TIME], deliveryModes: [DM.REMOTE] },
      { title: 'Curriculum Designer', roleCategories: [RC.CURRICULUM_DESIGNER], employmentTypes: [ET.CONTRACT], deliveryModes: [DM.REMOTE] },
    ],
  },
  {
    slug: 'atlas-curriculum-works',
    name: 'Atlas Curriculum Works',
    organizationType: OT.CURRICULUM_PUBLISHER,
    tagline: 'Standards-aligned curriculum for schools',
    location: { country: 'CA', region: 'Ontario', city: 'Toronto', timezone: 'America/Toronto' },
    educationServices: [ES.CURRICULUM_DESIGN, ES.TEACHER_TRAINING],
    subjects: ['Mathematics', 'Science', 'Assessment Design'],
    deliveryModes: [DM.REMOTE, DM.HYBRID],
    description: { short: 'We build course maps, assessments, and teacher guides for K–12 partners.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Assessment Writer', roleCategories: [RC.CONTENT_WRITER], employmentTypes: [ET.CONTRACT], deliveryModes: [DM.REMOTE] },
    ],
  },
  {
    slug: 'harbour-language-institute',
    name: 'Harbour Language Institute',
    organizationType: OT.LANGUAGE_SCHOOL,
    tagline: 'English and Spanish instruction for all levels',
    location: { country: 'ES', region: 'Catalonia', city: 'Barcelona', timezone: 'Europe/Madrid' },
    educationServices: [ES.LANGUAGE_INSTRUCTION, ES.TEST_PREPARATION],
    subjects: ['English', 'Spanish', 'IELTS', 'TOEFL'],
    deliveryModes: [DM.HYBRID],
    description: { short: 'CEFR-aligned language courses and exam preparation.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'ESL Instructor', roleCategories: [RC.LANGUAGE_INSTRUCTOR], employmentTypes: [ET.FULL_TIME, ET.PART_TIME], deliveryModes: [DM.HYBRID] },
    ],
  },
  {
    slug: 'brightpath-early-learning',
    name: 'BrightPath Early Learning',
    organizationType: OT.TUTORING_CENTER,
    tagline: 'Foundational literacy and numeracy',
    location: { country: 'AU', region: 'Victoria', city: 'Melbourne', timezone: 'Australia/Melbourne' },
    educationServices: [ES.EARLY_CHILDHOOD, ES.HOMEWORK_SUPPORT],
    subjects: ['Phonics', 'Early Numeracy'],
    deliveryModes: [DM.ON_SITE],
    description: { short: 'Play-based early years learning centres across metropolitan Melbourne.' },
    isCurrentlyHiring: false,
    intents: [],
  },
  {
    slug: 'vertex-stem-academy',
    name: 'Vertex STEM Academy',
    organizationType: OT.TUTORING_CENTER,
    tagline: 'Competition maths, robotics, and coding',
    location: { country: 'IN', region: 'Maharashtra', city: 'Pune', timezone: 'Asia/Kolkata' },
    educationServices: [ES.STEM_ENRICHMENT, ES.ACADEMIC_TUTORING],
    subjects: ['Olympiad Mathematics', 'Robotics', 'Python'],
    deliveryModes: [DM.ON_SITE, DM.HYBRID],
    description: { short: 'Enrichment programmes for olympiad and competitive examination students.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Olympiad Mathematics Coach', roleCategories: [RC.ACADEMIC_COACH, RC.PRIVATE_TUTOR], employmentTypes: [ET.PART_TIME], deliveryModes: [DM.ON_SITE] },
    ],
  },
  {
    slug: 'cedar-hill-university',
    name: 'Cedar Hill University',
    organizationType: OT.COLLEGE_UNIVERSITY,
    tagline: 'Liberal arts and sciences',
    location: { country: 'US', region: 'Oregon', city: 'Portland', timezone: 'America/Los_Angeles' },
    educationServices: [ES.CAREER_COUNSELING, ES.TEACHER_TRAINING],
    subjects: ['Mathematics', 'Economics', 'History'],
    deliveryModes: [DM.ON_SITE],
    description: { short: 'A teaching-focused university with small seminar classes.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Adjunct Lecturer, Economics', roleCategories: [RC.PROFESSOR_LECTURER], employmentTypes: [ET.CONTRACT], deliveryModes: [DM.ON_SITE] },
    ],
  },
  {
    slug: 'kinetic-learning-labs',
    name: 'Kinetic Learning Labs',
    organizationType: OT.EDTECH,
    tagline: 'Adaptive practice for secondary maths',
    location: { country: 'SG', region: 'Singapore', city: 'Singapore', timezone: 'Asia/Singapore' },
    educationServices: [ES.CURRICULUM_DESIGN, ES.ACADEMIC_TUTORING],
    subjects: ['Mathematics', 'Data Science'],
    deliveryModes: [DM.REMOTE],
    description: { short: 'An adaptive practice platform used by schools across Southeast Asia.' },
    isCurrentlyHiring: false,
    intents: [],
  },
  {
    slug: 'openfield-special-education',
    name: 'Openfield Special Education',
    organizationType: OT.SPECIAL_EDUCATION,
    tagline: 'Individualised support and advocacy',
    location: { country: 'GB', region: 'Scotland', city: 'Edinburgh', timezone: 'Europe/London' },
    educationServices: [ES.SPECIAL_EDUCATION_SUPPORT, ES.ACADEMIC_TUTORING],
    subjects: ['Literacy Intervention', 'Executive Function'],
    deliveryModes: [DM.HYBRID],
    description: { short: 'Specialist tutors supporting learners with dyslexia, ADHD, and autism.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Specialist Literacy Tutor', roleCategories: [RC.SPECIAL_ED_SPECIALIST], employmentTypes: [ET.PART_TIME], deliveryModes: [DM.HYBRID] },
    ],
  },
  {
    slug: 'summit-teacher-training',
    name: 'Summit Teacher Training',
    organizationType: OT.TRAINING_PROVIDER,
    tagline: 'Professional development for educators',
    location: { country: 'AE', region: 'Dubai', city: 'Dubai', timezone: 'Asia/Dubai' },
    educationServices: [ES.TEACHER_TRAINING, ES.CURRICULUM_DESIGN],
    subjects: ['Pedagogy', 'Assessment', 'Classroom Management'],
    deliveryModes: [DM.HYBRID, DM.REMOTE],
    description: { short: 'Accredited CPD programmes for international school teachers.' },
    isCurrentlyHiring: true,
    intents: [
      { title: 'Professional Development Facilitator', roleCategories: [RC.ACADEMIC_ADMINISTRATOR], employmentTypes: [ET.CONTRACT], deliveryModes: [DM.HYBRID] },
    ],
  },
  // Not published — must never appear in the directory (PRD §9.3).
  {
    slug: 'draft-tutoring-co',
    name: 'Draft Tutoring Co',
    organizationType: OT.TUTORING_CENTER,
    tagline: 'Unpublished draft',
    location: { country: 'US', city: 'Austin', timezone: 'America/Chicago' },
    educationServices: [ES.ACADEMIC_TUTORING],
    deliveryModes: [DM.REMOTE],
    isCurrentlyHiring: false,
    status: COMPANY_STATUS.DRAFT,
    intents: [],
  },
];

async function seed() {
  await connectDatabase();

  let companyCount = 0;
  let intentCount = 0;

  for (const { intents, ...data } of COMPANIES) {
    const status = data.status ?? COMPANY_STATUS.PUBLISHED;

    const company = await Company.findOneAndUpdate(
      { slug: data.slug },
      {
        $set: {
          ...data,
          status,
          moderationStatus: MODERATION_STATUS.NONE,
          publishedAt: status === COMPANY_STATUS.PUBLISHED ? new Date() : undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    companyCount += 1;

    await HiringIntent.deleteMany({ companyId: company._id });

    for (const intent of intents) {
      await HiringIntent.create({
        ...intent,
        companyId: company._id,
        status: HIRING_INTENT_STATUS.ACTIVE,
      });
      intentCount += 1;
    }
  }

  logger.info('Seed complete', { companies: companyCount, hiringIntents: intentCount });
  await disconnectDatabase();
}

seed().catch((error) => {
  logger.error('Seed failed', { message: error.message, stack: error.stack });
  process.exit(1);
});
