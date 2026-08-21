/**
 * The portfolio projection — the evidence and practice layers, as an audience may see them.
 *
 * Until now `toRecruiterView()` reported `evidence` as four permanently empty arrays and dropped
 * the question-bank answers entirely, so the builder wrote experience, education, credentials and
 * media into four real collections that no screen has ever rendered. This module is what turns
 * that stored data into the portfolio, and it is the ONLY place per-item visibility is applied.
 *
 * Two rules govern everything here, and both come from PRD §8.8 / §21.3:
 *
 *   1. **One projection, every audience.** CAN-03's preview, REC-13's recruiter viewer and the
 *      share link all read the same function. PRD §8.8 requires the candidate's preview to show
 *      "the exact same rendering and privacy state" a recruiter gets; two projections would
 *      eventually disagree, and a disagreement in this direction is a privacy defect.
 *   2. **Withheld means absent, not masked.** An entry marked `private` (ADR-008 per-item
 *      visibility) never enters the payload. It is counted, so the preview can tell its owner
 *      "3 entries are hidden", but the content itself never crosses the boundary.
 *
 * Question-bank answers are projected through an explicit ALLOW-LIST, not by dumping
 * `candidateAnswers`. A bank revision that adds a question must not silently publish it — and
 * two answers the bank already collects (`compensation`, `workAuthorization`) are negotiation
 * material the candidate gave us for matching, not portfolio copy. They are excluded here and
 * appear on no audience's screen.
 */

import { CANDIDATE_VISIBILITY } from '@evallo/shared';
import {
  Experience,
  EducationEntry,
  Credential,
  EvidenceItem,
} from './profileEntry.model.js';
import { CandidateAnswer } from './candidateAnswer.model.js';

/**
 * Answers that render as the "Teaching practice" section (PRD §8.3 section 8).
 *
 * The label is the SECTION heading, never the question wording — PRD §21.3 requires that
 * "question wording is never shown verbatim in the recruiter view". `diagnosticProcess` is asked
 * as "Describe your diagnostic process…" and renders here as "Planning and diagnosis".
 */
const PRACTICE_ANSWERS = Object.freeze([
  { key: 'philosophy', label: 'Teaching philosophy' },
  { key: 'diagnosticProcess', label: 'Planning and diagnosis' },
  { key: 'differentiation', label: 'Differentiation and learner support' },
]);

/** Answers that render as measurable impact rather than prose. */
const OUTCOME_ANSWERS = Object.freeze([
  { key: 'scoreGains', label: 'Representative score gains' },
]);

/**
 * Answers the portfolio must never carry, listed explicitly rather than by omission.
 *
 * `compensation` and `workAuthorization` are collected by question bank v6 for matching. Neither
 * is portfolio content, and a share link that leaked either would disclose the candidate's
 * negotiating position and immigration status to anyone holding the URL.
 */
export const NEVER_IN_PORTFOLIO = Object.freeze(['compensation', 'workAuthorization']);

/** ADR-008 per-item visibility. Only `discoverable` entries leave this module. */
function isVisible(entry) {
  return entry.visibility === CANDIDATE_VISIBILITY.DISCOVERABLE;
}

/** Newest first, with the candidate's explicit ordering winning where they set it. */
function ordered(entries) {
  return [...entries].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')),
  );
}

/** Strips Mongo internals. No entry ever carries `candidateId` off the server. */
function shape(entry, fields) {
  const out = { id: String(entry._id) };
  for (const field of fields) {
    const value = entry[field];
    if (value !== undefined && value !== null && value !== '') out[field] = value;
  }
  return out;
}

function textAnswer(byKey, key) {
  const value = byKey.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Loads and projects everything below the profile document.
 *
 * @param {object} profile  CandidateProfile document or lean object
 * @returns {Promise<{ evidence, practice, outcomes, expertise, withheld }>}
 */
export async function loadPortfolio(profile) {
  const candidateId = profile._id;

  const [experiences, education, credentials, media, answers] = await Promise.all([
    Experience.find({ candidateId }).lean(),
    EducationEntry.find({ candidateId }).lean(),
    Credential.find({ candidateId }).lean(),
    EvidenceItem.find({ candidateId }).lean(),
    CandidateAnswer.find({ candidateId }).lean(),
  ]);

  const byKey = new Map(
    answers
      .filter((answer) => !NEVER_IN_PORTFOLIO.includes(answer.questionKey))
      .map((answer) => [answer.questionKey, answer.value]),
  );

  const visibleExperience = ordered(experiences.filter(isVisible));
  const visibleEducation = ordered(education.filter(isVisible));
  const visibleCredentials = ordered(credentials.filter(isVisible));
  const visibleMedia = ordered(media.filter(isVisible));

  /*
   * Credentials carry both licences and standardised scores in one collection (PRD §8.3 §5–§7
   * are one shape). The portfolio splits them for display: a score belongs beside other scores,
   * not in a list of teaching licences. `result` present with a score-ish type is the signal.
   */
  const isScore = (entry) =>
    /score|test|exam|assessment/i.test(String(entry.credentialType ?? '')) && Boolean(entry.result);

  const credentialFields = [
    'name',
    'credentialType',
    'issuer',
    'result',
    'documentUrl',
    'startDate',
    'endDate',
    'description',
    'verificationStatus',
  ];

  return {
    evidence: {
      experience: visibleExperience.map((entry) =>
        shape(entry, [
          'role',
          'organization',
          'location',
          'deliveryMode',
          'startDate',
          'endDate',
          'current',
          'description',
          'outcome',
          'verificationStatus',
        ]),
      ),
      education: visibleEducation.map((entry) =>
        shape(entry, [
          'institution',
          'qualification',
          'fieldOfStudy',
          'startDate',
          'endDate',
          'current',
          'description',
          'verificationStatus',
        ]),
      ),
      credentials: visibleCredentials
        .filter((entry) => !isScore(entry))
        .map((entry) => shape(entry, credentialFields)),
      /** PRD §8.3 section 7 — assessments and scores, shown only where visibility allows. */
      scores: visibleCredentials.filter(isScore).map((entry) => shape(entry, credentialFields)),
      media: visibleMedia.map((entry) =>
        shape(entry, ['title', 'url', 'provider', 'prompt', 'description']),
      ),
      /*
       * PRD §20.3 defers reference COLLECTION to Phase 2 and there is no `references` collection
       * to read. Reported as an empty array rather than omitted, so every audience renders the
       * same "nothing supplied" state instead of the section vanishing for some viewers.
       */
      references: [],
    },

    /** PRD §8.3 section 8 — prose, rendered under professional headings. */
    practice: PRACTICE_ANSWERS.map(({ key, label }) => ({
      key,
      label,
      body: textAnswer(byKey, key),
    })).filter((item) => item.body),

    /**
     * PRD §8.3 section 9 — measurable impact.
     *
     * Two sources, deliberately merged: the quantified claim a candidate attached to a specific
     * role (`experiences.outcome`) and the standalone score-gain answer. A recruiter reads
     * "what changed because of this person" as one question, not two.
     */
    outcomes: {
      statements: OUTCOME_ANSWERS.map(({ key, label }) => ({
        key,
        label,
        body: textAnswer(byKey, key),
      })).filter((item) => item.body),
      fromExperience: visibleExperience
        .filter((entry) => entry.outcome)
        .map((entry) => ({
          id: String(entry._id),
          organization: entry.organization,
          role: entry.role,
          outcome: entry.outcome,
        })),
    },

    /** Free-text expertise the bank collects beside the indexed facets. */
    expertise: {
      tests: textAnswer(byKey, 'testsPrepared'),
      curricula: textAnswer(byKey, 'curriculaTaught'),
    },

    /** Identity extras. Rendered exactly as written — pronouns are never inferred or normalised. */
    identity: {
      pronouns: textAnswer(byKey, 'pronouns'),
    },

    /**
     * What per-item visibility removed, as counts only.
     *
     * The candidate's own preview needs to explain the gap between what they entered and what
     * this projection contains (PRD §8.2 "private-field indicators"). A count answers that
     * without the content itself ever being assembled for an audience that may not see it.
     */
    withheld: {
      experience: experiences.length - visibleExperience.length,
      education: education.length - visibleEducation.length,
      credentials: credentials.length - visibleCredentials.length,
      media: media.length - visibleMedia.length,
    },
  };
}
