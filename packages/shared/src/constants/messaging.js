/**
 * Direct messaging — PRD §11.2, §16.3; ADR-025.
 *
 * A conversation is between exactly TWO PEOPLE. Not a candidate and a company, not a candidate and
 * "whoever at the company picks it up" — two user accounts, addressed by user id, owned by both of
 * them and by nobody else. Which companies either of them works for does not change whose chat it
 * is, and either side may start it.
 *
 * Shared because the client renders the request states and explains the limits, and the server
 * enforces them. One definition, two consumers (07_PROJECT_STRUCTURE.md §2).
 */

/**
 * The RECIPIENT's answer to a conversation someone else started.
 *
 *   pending    a message request — the recipient has not yet replied, accepted or declined
 *   accepted   an open two-way conversation (replying accepts implicitly)
 *   declined   closed to the person who started it; the recipient can reopen it by accepting or
 *              by writing back
 *
 * The person who STARTED the conversation has no state of their own: they made the choice by
 * sending the first message.
 */
export const CONVERSATION_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
});

export const CONVERSATION_STATUS_VALUES = Object.freeze(Object.values(CONVERSATION_STATUS));

/**
 * Anti-spam limits — PRD §16.3 "messaging rate limits and anti-spam rules, especially for
 * unsolicited recruiter outreach".
 *
 * Enforced in the messaging service against the database, not by the IP-keyed HTTP limiter: a
 * person is the unit of abuse, and one person can have many IPs. Every limit is per PERSON,
 * whichever company they may be acting for.
 */
export const MESSAGING_LIMITS = Object.freeze({
  /** New conversations one person may START in any rolling 24 hours. */
  NEW_CONVERSATIONS_PER_DAY: 20,

  /** Messages one person may send in any rolling 60 seconds, across all conversations. */
  MESSAGES_PER_MINUTE: 30,

  /**
   * Messages the STARTER may send into a conversation the recipient has not yet answered.
   *
   * A message request is one voice until the other person joins it. A follow-up or two is normal
   * — "did you see this?" — but a pending request cannot become a monologue. Once the recipient
   * replies or accepts, the cap no longer applies.
   */
  PENDING_REQUEST_MESSAGE_CAP: 3,

  BODY_MAX_LENGTH: 5000,
  REPORT_REASON_MAX_LENGTH: 500,
  PREVIEW_LENGTH: 200,
});
