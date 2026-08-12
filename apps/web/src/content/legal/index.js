/**
 * Legal documents — content, not code.
 *
 * PRD §6.2 requires acknowledgement of Terms and Privacy at sign-up, and the sign-up form,
 * the early-access form and the settings pages all already claim it. The documents themselves are
 * **founder/legal deliverables that do not exist yet** (TRD §15 D-09, and no approved text exists
 * anywhere in this repository).
 *
 * So the shape lives here and the words do not. A document is:
 *
 *   {
 *     key, title, summary,
 *     status: 'published' | 'pending_approval',
 *     effectiveDate: '2026-09-01' | null,
 *     sections: [{ id, heading, paragraphs: [string] }]
 *   }
 *
 * Publishing a real document is a content change — set `status`, add `effectiveDate`, fill
 * `sections` — with **no change to the page component and no new route**. Nothing here invents
 * policy language, and the page refuses to render a document as though it were in force while its
 * status is `pending_approval`.
 */

/** @typedef {{ id: string, heading: string, paragraphs: string[] }} LegalSection */

export const TERMS_DOCUMENT = Object.freeze({
  key: 'terms',
  title: 'Terms of Service',
  summary: 'The agreement between you and Evallo Recruit when you use the platform.',
  status: 'pending_approval',
  effectiveDate: null,
  sections: [],
});

export const PRIVACY_DOCUMENT = Object.freeze({
  key: 'privacy',
  title: 'Privacy Policy',
  summary:
    'What personal data Evallo Recruit collects, why it is collected, and the choices you have over it.',
  status: 'pending_approval',
  effectiveDate: null,
  sections: [],
});
