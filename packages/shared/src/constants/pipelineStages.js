/**
 * Default recruiter pipeline stages — PRD §7.9.
 *
 * Fixed in MVP. Customisation is deferred (PRD Appendix D) because fixed stages keep pilot
 * analytics comparable across companies. Making them configurable requires an ADR.
 */

export const PIPELINE_STAGES = Object.freeze({
  NEW_INTEREST: 'new_interest',
  SOURCED: 'sourced',
  REVIEWING: 'reviewing',
  CONTACTED: 'contacted',
  SCREENING: 'screening',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  HIRED: 'hired',
  REJECTED: 'rejected',
});

/** Display order for board and list views. */
export const PIPELINE_STAGE_ORDER = Object.freeze([
  PIPELINE_STAGES.NEW_INTEREST,
  PIPELINE_STAGES.SOURCED,
  PIPELINE_STAGES.REVIEWING,
  PIPELINE_STAGES.CONTACTED,
  PIPELINE_STAGES.SCREENING,
  PIPELINE_STAGES.INTERVIEW,
  PIPELINE_STAGES.OFFER,
  PIPELINE_STAGES.HIRED,
  PIPELINE_STAGES.REJECTED,
]);

export const PIPELINE_STAGE_LABELS = Object.freeze({
  [PIPELINE_STAGES.NEW_INTEREST]: 'New interest',
  [PIPELINE_STAGES.SOURCED]: 'Sourced',
  [PIPELINE_STAGES.REVIEWING]: 'Reviewing',
  [PIPELINE_STAGES.CONTACTED]: 'Contacted',
  [PIPELINE_STAGES.SCREENING]: 'Screening',
  [PIPELINE_STAGES.INTERVIEW]: 'Interview',
  [PIPELINE_STAGES.OFFER]: 'Offer',
  [PIPELINE_STAGES.HIRED]: 'Hired',
  [PIPELINE_STAGES.REJECTED]: 'Rejected / archived',
});

/** Stages that close the entry. Kept explicit so analytics does not hardcode the list. */
export const TERMINAL_PIPELINE_STAGES = Object.freeze([
  PIPELINE_STAGES.HIRED,
  PIPELINE_STAGES.REJECTED,
]);
