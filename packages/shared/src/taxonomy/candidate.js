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
  { value: 'private_tutor', label: 'Private tutor', description: 'One-to-one coaching and academic support.', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION, priority: true },
  { value: 'test_prep_tutor', label: 'Test-prep tutor', description: 'Standardised tests, score growth, timed practice.', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION, priority: true },
  { value: 'academic_coach', label: 'Academic coach', description: 'Study skills, executive function, accountability.', family: ROLE_FAMILIES.PRIVATE_INSTRUCTION },
  { value: 'school_teacher', label: 'School teacher', description: 'Classroom instruction, K-12, curriculum delivery.', family: ROLE_FAMILIES.SCHOOL_TEACHING, priority: true },
  { value: 'teaching_assistant', label: 'Teaching assistant', description: 'Classroom support alongside a lead teacher.', family: ROLE_FAMILIES.SCHOOL_TEACHING, priority: true },
  { value: 'special_education_teacher', label: 'Special-education teacher', description: 'Individual education plans and accommodations.', family: ROLE_FAMILIES.SCHOOL_TEACHING },
  { value: 'professor_lecturer', label: 'Professor / lecturer / adjunct', description: 'Higher education teaching and assessment.', family: ROLE_FAMILIES.HIGHER_EDUCATION, priority: true },
  { value: 'admissions_counselor', label: 'Admissions / academic counselor', description: 'College advising, applications, student mentoring.', family: ROLE_FAMILIES.COUNSELING, priority: true },
  { value: 'school_counselor', label: 'School counselor', description: 'Pastoral support and guidance inside a school.', family: ROLE_FAMILIES.COUNSELING },
  { value: 'curriculum_designer', label: 'Curriculum or content specialist', description: 'Instructional design, content, assessments.', family: ROLE_FAMILIES.CURRICULUM, priority: true },
  { value: 'instructional_designer', label: 'Instructional designer', description: 'Learning experiences and course architecture.', family: ROLE_FAMILIES.CURRICULUM },
  { value: 'academic_coordinator', label: 'Academic coordinator', description: 'Programme planning and teacher coordination.', family: ROLE_FAMILIES.LEADERSHIP },
  { value: 'language_instructor', label: 'Language / ESL instructor', description: 'Language acquisition and fluency teaching.', family: ROLE_FAMILIES.LANGUAGE_SPECIALIST },
  { value: 'teacher_trainer', label: 'Teacher trainer', description: 'Training and developing other educators.', family: ROLE_FAMILIES.TRAINING_CONSULTING },
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

/**
 * Learner segments — PRD §8.5 requires at least one for publication.
 *
 * Shared with the COMPANY profile (`companies.learnerSegments`), which describes who an
 * organisation teaches. One vocabulary on both sides is what makes "teaches SEN learners"
 * matchable between an educator and an employer rather than two unrelated strings.
 */
export const LEARNER_SEGMENTS = Object.freeze({
  EARLY_YEARS: 'early_years',
  PRIMARY: 'primary',
  MIDDLE_SCHOOL: 'middle_school',
  HIGH_SCHOOL: 'high_school',
  UNDERGRADUATE: 'undergraduate',
  POSTGRADUATE: 'postgraduate',
  ADULT_LEARNERS: 'adult_learners',
  SPECIAL_NEEDS: 'special_needs',
});

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
 * Countries — every officially-assigned ISO 3166-1 alpha-2 territory (249), PRD §8.5.
 *
 * This was a 17-entry pilot shortlist plus "Elsewhere". That was defensible while the list was a
 * dropdown you scrolled, and wrong the moment a real educator outside those markets tried to say
 * where they live: "Elsewhere" is not a country, it cannot be searched on, and a recruiter reading
 * it learns nothing. The country is also a search facet (REC-12 joins `users` for it), so a
 * bucketed value made a whole population unfindable rather than merely unlabelled.
 *
 * MEMBERSHIP is the ISO list, chosen deliberately rather than taken from whatever the runtime's
 * ICU happens to carry — ICU also exposes deprecated codes (ZR) and pseudo-codes (ZZ, EU, UK).
 * SPELLING is CLDR English, generated rather than hand-typed so no entry is a typo.
 *
 * Sorted by LABEL, not by code, because the list is read alphabetically and searched by name. The
 * pilot markets are not floated to the top: with 249 entries the control is a search box, and a
 * list whose order does not match its labels is harder to scan than one that simply reads A–Z.
 *
 * `OTHER` is retained at the end for the profiles that already stored it. It is deliberately last
 * and deliberately not removed — dropping a value that exists in the database turns a saved answer
 * into a validation failure the next time its owner edits an unrelated field.
 */
export const COUNTRY_OPTIONS = Object.freeze([
  { value: 'AF', label: 'Afghanistan' },
  { value: 'AX', label: 'Åland Islands' },
  { value: 'AL', label: 'Albania' },
  { value: 'DZ', label: 'Algeria' },
  { value: 'AS', label: 'American Samoa' },
  { value: 'AD', label: 'Andorra' },
  { value: 'AO', label: 'Angola' },
  { value: 'AI', label: 'Anguilla' },
  { value: 'AQ', label: 'Antarctica' },
  { value: 'AG', label: 'Antigua & Barbuda' },
  { value: 'AR', label: 'Argentina' },
  { value: 'AM', label: 'Armenia' },
  { value: 'AW', label: 'Aruba' },
  { value: 'AU', label: 'Australia' },
  { value: 'AT', label: 'Austria' },
  { value: 'AZ', label: 'Azerbaijan' },
  { value: 'BS', label: 'Bahamas' },
  { value: 'BH', label: 'Bahrain' },
  { value: 'BD', label: 'Bangladesh' },
  { value: 'BB', label: 'Barbados' },
  { value: 'BY', label: 'Belarus' },
  { value: 'BE', label: 'Belgium' },
  { value: 'BZ', label: 'Belize' },
  { value: 'BJ', label: 'Benin' },
  { value: 'BM', label: 'Bermuda' },
  { value: 'BT', label: 'Bhutan' },
  { value: 'BO', label: 'Bolivia' },
  { value: 'BA', label: 'Bosnia & Herzegovina' },
  { value: 'BW', label: 'Botswana' },
  { value: 'BV', label: 'Bouvet Island' },
  { value: 'BR', label: 'Brazil' },
  { value: 'IO', label: 'British Indian Ocean Territory' },
  { value: 'VG', label: 'British Virgin Islands' },
  { value: 'BN', label: 'Brunei' },
  { value: 'BG', label: 'Bulgaria' },
  { value: 'BF', label: 'Burkina Faso' },
  { value: 'BI', label: 'Burundi' },
  { value: 'KH', label: 'Cambodia' },
  { value: 'CM', label: 'Cameroon' },
  { value: 'CA', label: 'Canada' },
  { value: 'CV', label: 'Cape Verde' },
  { value: 'BQ', label: 'Caribbean Netherlands' },
  { value: 'KY', label: 'Cayman Islands' },
  { value: 'CF', label: 'Central African Republic' },
  { value: 'TD', label: 'Chad' },
  { value: 'CL', label: 'Chile' },
  { value: 'CN', label: 'China' },
  { value: 'CX', label: 'Christmas Island' },
  { value: 'CC', label: 'Cocos (Keeling) Islands' },
  { value: 'CO', label: 'Colombia' },
  { value: 'KM', label: 'Comoros' },
  { value: 'CG', label: 'Congo - Brazzaville' },
  { value: 'CD', label: 'Congo - Kinshasa' },
  { value: 'CK', label: 'Cook Islands' },
  { value: 'CR', label: 'Costa Rica' },
  { value: 'CI', label: 'Côte d’Ivoire' },
  { value: 'HR', label: 'Croatia' },
  { value: 'CU', label: 'Cuba' },
  { value: 'CW', label: 'Curaçao' },
  { value: 'CY', label: 'Cyprus' },
  { value: 'CZ', label: 'Czechia' },
  { value: 'DK', label: 'Denmark' },
  { value: 'DJ', label: 'Djibouti' },
  { value: 'DM', label: 'Dominica' },
  { value: 'DO', label: 'Dominican Republic' },
  { value: 'EC', label: 'Ecuador' },
  { value: 'EG', label: 'Egypt' },
  { value: 'SV', label: 'El Salvador' },
  { value: 'GQ', label: 'Equatorial Guinea' },
  { value: 'ER', label: 'Eritrea' },
  { value: 'EE', label: 'Estonia' },
  { value: 'SZ', label: 'Eswatini' },
  { value: 'ET', label: 'Ethiopia' },
  { value: 'FK', label: 'Falkland Islands' },
  { value: 'FO', label: 'Faroe Islands' },
  { value: 'FJ', label: 'Fiji' },
  { value: 'FI', label: 'Finland' },
  { value: 'FR', label: 'France' },
  { value: 'GF', label: 'French Guiana' },
  { value: 'PF', label: 'French Polynesia' },
  { value: 'TF', label: 'French Southern Territories' },
  { value: 'GA', label: 'Gabon' },
  { value: 'GM', label: 'Gambia' },
  { value: 'GE', label: 'Georgia' },
  { value: 'DE', label: 'Germany' },
  { value: 'GH', label: 'Ghana' },
  { value: 'GI', label: 'Gibraltar' },
  { value: 'GR', label: 'Greece' },
  { value: 'GL', label: 'Greenland' },
  { value: 'GD', label: 'Grenada' },
  { value: 'GP', label: 'Guadeloupe' },
  { value: 'GU', label: 'Guam' },
  { value: 'GT', label: 'Guatemala' },
  { value: 'GG', label: 'Guernsey' },
  { value: 'GN', label: 'Guinea' },
  { value: 'GW', label: 'Guinea-Bissau' },
  { value: 'GY', label: 'Guyana' },
  { value: 'HT', label: 'Haiti' },
  { value: 'HM', label: 'Heard & McDonald Islands' },
  { value: 'HN', label: 'Honduras' },
  { value: 'HK', label: 'Hong Kong SAR China' },
  { value: 'HU', label: 'Hungary' },
  { value: 'IS', label: 'Iceland' },
  { value: 'IN', label: 'India' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'IR', label: 'Iran' },
  { value: 'IQ', label: 'Iraq' },
  { value: 'IE', label: 'Ireland' },
  { value: 'IM', label: 'Isle of Man' },
  { value: 'IL', label: 'Israel' },
  { value: 'IT', label: 'Italy' },
  { value: 'JM', label: 'Jamaica' },
  { value: 'JP', label: 'Japan' },
  { value: 'JE', label: 'Jersey' },
  { value: 'JO', label: 'Jordan' },
  { value: 'KZ', label: 'Kazakhstan' },
  { value: 'KE', label: 'Kenya' },
  { value: 'KI', label: 'Kiribati' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'KG', label: 'Kyrgyzstan' },
  { value: 'LA', label: 'Laos' },
  { value: 'LV', label: 'Latvia' },
  { value: 'LB', label: 'Lebanon' },
  { value: 'LS', label: 'Lesotho' },
  { value: 'LR', label: 'Liberia' },
  { value: 'LY', label: 'Libya' },
  { value: 'LI', label: 'Liechtenstein' },
  { value: 'LT', label: 'Lithuania' },
  { value: 'LU', label: 'Luxembourg' },
  { value: 'MO', label: 'Macao SAR China' },
  { value: 'MG', label: 'Madagascar' },
  { value: 'MW', label: 'Malawi' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'MV', label: 'Maldives' },
  { value: 'ML', label: 'Mali' },
  { value: 'MT', label: 'Malta' },
  { value: 'MH', label: 'Marshall Islands' },
  { value: 'MQ', label: 'Martinique' },
  { value: 'MR', label: 'Mauritania' },
  { value: 'MU', label: 'Mauritius' },
  { value: 'YT', label: 'Mayotte' },
  { value: 'MX', label: 'Mexico' },
  { value: 'FM', label: 'Micronesia' },
  { value: 'MD', label: 'Moldova' },
  { value: 'MC', label: 'Monaco' },
  { value: 'MN', label: 'Mongolia' },
  { value: 'ME', label: 'Montenegro' },
  { value: 'MS', label: 'Montserrat' },
  { value: 'MA', label: 'Morocco' },
  { value: 'MZ', label: 'Mozambique' },
  { value: 'MM', label: 'Myanmar (Burma)' },
  { value: 'NA', label: 'Namibia' },
  { value: 'NR', label: 'Nauru' },
  { value: 'NP', label: 'Nepal' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'NC', label: 'New Caledonia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'NI', label: 'Nicaragua' },
  { value: 'NE', label: 'Niger' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'NU', label: 'Niue' },
  { value: 'NF', label: 'Norfolk Island' },
  { value: 'KP', label: 'North Korea' },
  { value: 'MK', label: 'North Macedonia' },
  { value: 'MP', label: 'Northern Mariana Islands' },
  { value: 'NO', label: 'Norway' },
  { value: 'OM', label: 'Oman' },
  { value: 'PK', label: 'Pakistan' },
  { value: 'PW', label: 'Palau' },
  { value: 'PS', label: 'Palestinian Territories' },
  { value: 'PA', label: 'Panama' },
  { value: 'PG', label: 'Papua New Guinea' },
  { value: 'PY', label: 'Paraguay' },
  { value: 'PE', label: 'Peru' },
  { value: 'PH', label: 'Philippines' },
  { value: 'PN', label: 'Pitcairn Islands' },
  { value: 'PL', label: 'Poland' },
  { value: 'PT', label: 'Portugal' },
  { value: 'PR', label: 'Puerto Rico' },
  { value: 'QA', label: 'Qatar' },
  { value: 'RE', label: 'Réunion' },
  { value: 'RO', label: 'Romania' },
  { value: 'RU', label: 'Russia' },
  { value: 'RW', label: 'Rwanda' },
  { value: 'WS', label: 'Samoa' },
  { value: 'SM', label: 'San Marino' },
  { value: 'ST', label: 'São Tomé & Príncipe' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'SN', label: 'Senegal' },
  { value: 'RS', label: 'Serbia' },
  { value: 'SC', label: 'Seychelles' },
  { value: 'SL', label: 'Sierra Leone' },
  { value: 'SG', label: 'Singapore' },
  { value: 'SX', label: 'Sint Maarten' },
  { value: 'SK', label: 'Slovakia' },
  { value: 'SI', label: 'Slovenia' },
  { value: 'SB', label: 'Solomon Islands' },
  { value: 'SO', label: 'Somalia' },
  { value: 'ZA', label: 'South Africa' },
  { value: 'GS', label: 'South Georgia & South Sandwich Islands' },
  { value: 'KR', label: 'South Korea' },
  { value: 'SS', label: 'South Sudan' },
  { value: 'ES', label: 'Spain' },
  { value: 'LK', label: 'Sri Lanka' },
  { value: 'BL', label: 'St. Barthélemy' },
  { value: 'SH', label: 'St. Helena' },
  { value: 'KN', label: 'St. Kitts & Nevis' },
  { value: 'LC', label: 'St. Lucia' },
  { value: 'MF', label: 'St. Martin' },
  { value: 'PM', label: 'St. Pierre & Miquelon' },
  { value: 'VC', label: 'St. Vincent & Grenadines' },
  { value: 'SD', label: 'Sudan' },
  { value: 'SR', label: 'Suriname' },
  { value: 'SJ', label: 'Svalbard & Jan Mayen' },
  { value: 'SE', label: 'Sweden' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'SY', label: 'Syria' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'TJ', label: 'Tajikistan' },
  { value: 'TZ', label: 'Tanzania' },
  { value: 'TH', label: 'Thailand' },
  { value: 'TL', label: 'Timor-Leste' },
  { value: 'TG', label: 'Togo' },
  { value: 'TK', label: 'Tokelau' },
  { value: 'TO', label: 'Tonga' },
  { value: 'TT', label: 'Trinidad & Tobago' },
  { value: 'TN', label: 'Tunisia' },
  { value: 'TR', label: 'Türkiye' },
  { value: 'TM', label: 'Turkmenistan' },
  { value: 'TC', label: 'Turks & Caicos Islands' },
  { value: 'TV', label: 'Tuvalu' },
  { value: 'UM', label: 'U.S. Outlying Islands' },
  { value: 'VI', label: 'U.S. Virgin Islands' },
  { value: 'UG', label: 'Uganda' },
  { value: 'UA', label: 'Ukraine' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'UY', label: 'Uruguay' },
  { value: 'UZ', label: 'Uzbekistan' },
  { value: 'VU', label: 'Vanuatu' },
  { value: 'VA', label: 'Vatican City' },
  { value: 'VE', label: 'Venezuela' },
  { value: 'VN', label: 'Vietnam' },
  { value: 'WF', label: 'Wallis & Futuna' },
  { value: 'EH', label: 'Western Sahara' },
  { value: 'YE', label: 'Yemen' },
  { value: 'ZM', label: 'Zambia' },
  { value: 'ZW', label: 'Zimbabwe' },
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
