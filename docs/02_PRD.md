# 02 — Product Requirements Document (engineering view)

**Version:** 1.0 · 2026-07-31
**Source of truth:** `Evallo_Recruit_PRD_v1.pdf` (v1.0, 40 pp.)

> **Implementation status is NOT tracked here.** This document states requirements, and requirements
> do not change because code was written. For what actually exists, see `14_PROGRESS_TRACKER.md`
> (screen-by-screen), `11_CHANGELOG.md` (what shipped when), `12_KNOWN_ISSUES.md` (what is broken or
> missing) and `13_BACKLOG.md` (specified but unbuilt). Where a requirement here is deliberately
> unmet, the reason is recorded in one of those four — never by editing this file.
>
> *Audited 2026-08-27: no requirement in this document was changed; the pointer above was added.*

> This is the engineering-facing restatement of the source PRD: features expressed as user
> stories with testable acceptance criteria, mapped to screens and permissions. It **does not
> replace** the source PDF, which remains authoritative on product intent and contains the full
> question banks (§12), filter taxonomy (Appendix B), and role vocabularies (§8.4) that are too
> large to duplicate here.
>
> Acceptance criteria below are the QA contract. A feature is not done until they pass.

---

## 1. Screen map

Full inventory with build status: `14_PROGRESS_TRACKER.md`.
Route bindings: `03_TRD.md` §4.

| Group | Screens | Context |
|---|---|---|
| Marketing | MKT-01 | Anonymous |
| Public | PUB-01, PUB-02 | Anonymous |
| Auth | AUTH-01…05, AUTH-10…14 | Account |
| Universal | HOME-01 | Signed-in user |
| Candidate | CAN-01…12 | Personal |
| Company setup | REC-01…07 | Company |
| Company workspace | REC-10…19 | Company |
| Settings | SET-01, SET-02 | Account / Company |

---

## 2. Permissions model

Roles are **per company**, never global (ADR-001). The full matrix is in `03_TRD.md` §6.1 and
implemented once in `packages/shared/permissions/matrix.js`.

| Role | Summary *(PRD §4.2)* |
|---|---|
| **Owner** | Full control; transfer ownership; delete/archive; manage all members. ≥ 1 required at all times |
| **Admin** | Edit page, intents, team, search, pipeline, messages, settings. Cannot delete or transfer unless granted |
| **Recruiter** | Search, review interests, message, note, update pipeline. No ownership or member management |
| **Hiring manager** | Review **assigned** candidates, comment, message, recommend stage changes |
| **Viewer** | Read-only. Cannot message, export, or alter records |

Candidate visibility states *(PRD §4.3)* — these constrain recruiters **independently of role**:

| State | In search? | Recruiter access |
|---|---|---|
| `draft` | No | User only |
| `private` | No | Only companies explicitly granted access via interest |
| `discoverable` | Yes | Authorized company members with `candidate:view` |
| `paused` | No (new searches) | Previously authorized companies only |
| `archived` | No | User and authorized internal support |

---

## 3. Feature — Authentication

**PRD:** §6 · **Screens:** AUTH-01…05, AUTH-10…14 · **Milestone:** M1

### User stories
- As a visitor, I create an account with **only my email**, so I am not asked for irrelevant details.
- As a new user, I verify my email **before** setting a password, so the account is provably mine.
- As a returning user, I sign in once and reach every personal and company context.
- As a user who forgot my password, I reset it without exposing whether the account exists.
- As a user with an existing account, SSO **links** to it rather than creating a duplicate.

### Flow *(PRD §6.1)*
```
AUTH-01 email        → AUTH-02 verification sent → [email link]
AUTH-03 set password → AUTH-04 full name         → AUTH-05 first-action router → HOME-01
```

### Acceptance criteria *(PRD §21.1)*
- [ ] A new user submits an email, receives a verification link, sets a password **only after
      valid verification**, provides a name, and reaches the workspace.
- [ ] The sign-up page asks for **no** role, **no** company, **no** profile detail, and **no**
      password.
- [ ] An SSO user cannot create a duplicate account for an existing verified email.
- [ ] An expired verification link offers a working resend **and preserves the original intended
      destination**.
- [ ] The global sign-in page routes one account into all personal and company contexts.
- [ ] AUTH-05 writes no role to any record — it is navigation only.
- [ ] Password reset gives an identical response whether or not the account exists.
- [ ] Issuing a new reset token invalidates all prior unconsumed reset tokens.

### Edge cases *(PRD §6.4)*
| Case | Required behaviour |
|---|---|
| Email already registered | Direct to sign-in or recovery; hint at SSO method without exposing account data |
| Unverified email attempts sign-in | Resend verification, preserve intended destination |
| Expired verification token | One-click resend, never a dead end |
| Interest started before sign-up | After verification + minimum profile, return to the original company and complete submission |
| Invited member signs up | Preserve the invitation; join **only after** email verification |
| Account deleted then recreated | Apply retention/abuse/identity rules; do not immediately recreate duplicate candidate profiles |

### Dependencies
Transactional email provider (`03_TRD.md` Q3 — **blocks M1**) · Google/Microsoft OAuth
registration (Q4, can follow password auth).

---

## 4. Feature — Company creation & public page

**PRD:** §7.2–7.4, §9.3, §13, §17 · **Screens:** REC-01…07, PUB-01, PUB-02 · **Milestone:** M2

### User stories
- As a recruiter, I create a company and publish a credible public page quickly.
- As a company owner, I invite teammates with appropriate roles.
- As an anonymous visitor, I find a company via Google and understand it without signing in.

### Acceptance criteria *(PRD §21.2)*
- [ ] A user can create a company, publish a valid public page, and later invite recruiters.
- [ ] A published page is accessible **without login**; a draft page is **not** publicly accessible.
- [ ] A company can mark itself hiring and select role categories **without a job description**.
- [ ] Active roles show interest actions; paused/closed roles accept no new role-specific interest.
- [ ] Page metadata, canonical URL, and public content render correctly for search and sharing.
- [ ] **Candidate data never appears in public company HTML, public APIs, sitemaps, or
      unauthenticated responses.**
- [ ] Changing a slug preserves the old URL as a redirect.
- [ ] Only one active owner-less state is impossible: removing the last owner fails.

### Publication requirements *(PRD §7.3)*
Required: name · slug · organization type · primary country · logo or generated initials ·
tagline · short description · ≥ 1 education service. `isCurrentlyHiring` additionally requires
≥ 1 active hiring intent.

### Page states *(PRD §9.3)*
| State | Public behaviour | CTA |
|---|---|---|
| Draft | Not accessible except by preview token | None |
| Published, not hiring | Visible and indexable | Follow/save; optional "share for future opportunities" |
| Published, hiring | Visible with active intents | "I'm interested" + role-specific actions |
| Hiring paused | Visible; hiring section shows paused | Follow; no new interest unless general interest permitted |
| Archived | No new activity; redirect or preservation policy | None |
| Moderation restricted | Public access removed or limited | Support/report guidance |

### SEO *(PRD §17, ADR-004)*
- [ ] Published pages return server-side `<title>`, meta description, canonical, OG/Twitter tags,
      and `Organization` JSON-LD.
- [ ] `JobPosting` structured data is **not** emitted for lightweight hiring intent.
- [ ] `/sitemap.xml` lists published companies only and drops archived/restricted pages promptly.
- [ ] `/robots.txt` blocks candidate, search, message, pipeline, and account routes.
- [ ] Draft, paused, archived, and restricted pages emit `noindex`.

---

## 5. Feature — Candidate profile

**PRD:** §8, §12, Appendix C · **Screens:** CAN-01…04 · **Milestone:** M3

### User stories
- As an educator, I build a profile across sessions without losing work.
- As an educator, I answer questions relevant to **my** roles, not every role.
- As an educator, I control exactly who can discover me and see my contact details.
- As an educator, I preview precisely what a recruiter will see.

### Acceptance criteria *(PRD §21.3)*
- [ ] A user can create, save, exit, resume, preview, and publish a candidate profile.
- [ ] The builder dynamically shows role-relevant questions while retaining a common core.
- [ ] Multiple experience, education, credential, score, document, reference, and video entries
      are supported.
- [ ] The recruiter-facing profile contains **only** fields permitted by visibility settings.
- [ ] A `private` candidate can share with a specific company via interest **without becoming
      globally discoverable**.
- [ ] A `paused` profile disappears from new searches but remains available to previously
      authorized companies.
- [ ] Every answer persists immediately or via reliable draft save (Appendix C).
- [ ] The preview shows the **exact same rendering and privacy state** as the recruiter view.
- [ ] Question wording is never shown verbatim in the recruiter view — answers render as
      professional sections (Appendix C).

### Publication requirements *(PRD §8.5)*
Required: full name · headline · country/region · ≥ 1 target role · ≥ 1 subject domain ·
≥ 1 learner segment · ≥ 1 experience entry *or* an explicit "new educator" declaration with
supporting education · highest qualification · work preferences · short summary · visibility
state. **No evidence item is required to publish**, though completion warnings apply.

### Dynamic question rules *(Appendix C)*
Core-first · role modules merge duplicate questions · claims trigger optional evidence prompts ·
new educators get practicum/volunteer prompts instead of mandatory employment history ·
remote-only candidates skip commuting questions · counseling questions stay within professional
scope · classroom media requires a permissions attestation · contact details are collected but
visibility is configured separately.

Implemented as versioned database configuration, **not** hardcoded forms — see **ADR-007**.

---

## 6. Feature — Expression of interest

**PRD:** §8.7, §9.2, §11.1 · **Screens:** CAN-06, CAN-07, CAN-08, REC-11 · **Milestone:** M4

This is the **primary marketplace loop** (BRD J1) and the highest-criticality flow in the product.

### Flow *(PRD §8.7)*
```
1 Initiate   "I'm interested" on company page or a specific intent
2 Auth       Anonymous → sign in / sign up, return path preserved
3 Profile    No profile → minimum publish flow; incomplete → show required gaps
4 Select     One or more active intents, or general interest
5 Context    Optional short message + up to 3 company questions
6 Consent    Show exactly which sections and contact details the company will access
7 Submit     Create interest, grant access, notify company, confirm
8 Track      Status, messages, and withdrawal in My Interests
```

### Acceptance criteria *(PRD §21.5)*
- [ ] An anonymous visitor can click interest, authenticate, complete the minimum profile, and
      return to submit **without losing company/role context**.
- [ ] The candidate reviews profile-access and contact-sharing consent **before** submission.
- [ ] **The company receives the interest exactly once even if the user retries or refreshes.**
- [ ] The candidate can view status and withdraw; the recruiter sees withdrawal and cannot
      continue new outreach.
- [ ] Interest in a closed intent is prevented **with an informative alternative**, not an error.
- [ ] Submitting stores a candidate snapshot of profile version and visibility state at that moment.

Idempotency is enforced by a unique partial index, not application checks alone — see
`05_DATABASE_SCHEMA.md` §9.

---

## 7. Feature — Talent search

**PRD:** §7.7, §7.8, §10, Appendix B · **Screens:** REC-12, REC-13 · **Milestone:** M5

### Acceptance criteria *(PRD §21.4)*
- [ ] Only **active** company members with `candidate:search` / `candidate:view` can use search
      and open profiles.
- [ ] Filters produce reproducible results and **show why each candidate matches**.
- [ ] Company blocks, candidate visibility, and geography/access rules are enforced **before
      results are displayed**, not after ranking.
- [ ] Search never reveals candidates outside their visibility settings.
- [ ] Keyword search covers headline, summary, experience, institutions, subjects, credentials,
      and portfolio metadata — and **never** hidden or private fields.
- [ ] Within a facet: OR by default. Between facets: AND.
- [ ] Results never imply objective quality ranking (PRD §10.3).
- [ ] Candidate profile access is logged with company, user, timestamp, and source.

### Recommendation safeguards *(PRD §10.3)* — non-negotiable
No protected attributes used or inferred for ranking · no ranking on photo presence or
demographic proxies · "matches stated criteria" kept separate from "recommended" · candidates
may opt out of recommendations while remaining shareable · recruiter hide/feedback must not
create hidden discriminatory rules · ranking changes audited for systematic exclusion.

---

## 8. Feature — Messaging, shortlist, pipeline

**PRD:** §7.9, §11.2–11.4 · **Screens:** REC-14, REC-15, CAN-09 · **Milestone:** M5

### Acceptance criteria *(PRD §21.4)*
- [ ] Recruiters can save, message, add to pipeline, assign, note, and change stage **with audit
      history**.
- [ ] **Internal notes never appear to candidates.** *(Structural: separate collection —
      `05_DATABASE_SCHEMA.md` §9.)*
- [ ] A candidate can block/report a company and prevent further messages.
- [ ] A first message to a merely-discoverable candidate clearly identifies the company and role
      context.
- [ ] Candidates are **not** notified when simply saved to a shortlist.
- [ ] Rejection requires a reason code; the candidate-facing message never discloses internal notes.
- [ ] A candidate rejected for one intent may be retained for another.
- [ ] Withdrawal immediately blocks new recruiter action except required retention/audit access.

### Default pipeline stages *(PRD §7.9)*
`New interest → Sourced → Reviewing → Contacted → Screening → Interview → Offer → Hired`,
plus `Rejected / archived`. **Fixed in MVP**; customisation is deferred (Appendix D).

---

## 9. Cross-cutting requirements

### Privacy *(PRD §16.1)* — never relax without an ADR
Candidate data private by default until published or explicitly shared · public and private
data served through **distinct authorization paths** · candidates control discoverability,
contact visibility, and blocks · recruiters access candidate data only via active company
membership · profile views, evidence access, exports, and contact reveals **auditable** ·
deletion, export, correction, consent withdrawal, and retention designed in from the start.

### Notifications *(PRD §15)*
Every notification deep-links to the exact object after authentication · company-scoped
notifications identify the company for multi-company recruiters · digest frequencies immediate /
daily / weekly / off · **saved-search alerts must never expose candidate private data in subject
lines or unauthenticated email content** · security notices cannot be fully disabled ·
rejection notifications are respectful and never disclose internal notes.

### Moderation *(PRD §16.3)*
Reporting for companies, profiles, messages, evidence, impersonation, discrimination, spam, and
unsafe conduct · file scanning and URL safety checks · embed provider allow-list · messaging
rate limits and anti-spam, especially for unsolicited outreach · blocks · safeguarding and
fraud escalation · appeals with an audit trail.

---

## 10. Representative edge cases *(PRD §21.6)*

| Scenario | Expected behaviour |
|---|---|
| User belongs to three companies | Context switcher preserves company-specific search, pipeline, and notifications |
| Two users create the same company | Duplicate detection and claim/request process; no silent duplicate publication |
| Candidate changes contact visibility after interest | New setting applies **prospectively**; existing grants follow the consent text |
| Recruiter removed from company | **Immediate** loss of candidate/search/message access; audit retained |
| Hiring intent closes during candidate sign-up | Return page explains closure and offers general interest or other active roles |
| Candidate deletes a video provider link | Embed disappears without breaking the profile; recruiter sees an unavailable-evidence state where historically referenced |
| Credential expires | Badge changes; candidate notified; search criteria requiring a valid credential update |
| Company page suspended | Public page removed or notice shown; interest disabled |
| Candidate hired by one company | Profile stays under candidate control; open-to-work is **never** auto-disabled without consent |

---

## 11. Product decisions still open *(PRD Appendix D)*

Defaults are implemented; changes require an ADR.

| Decision | MVP default |
|---|---|
| Candidate direct contact visibility | Hidden; in-platform messaging; reveal on interest or approval |
| One vs. multiple candidate profiles | **One** active profile per user |
| Company claiming | Manual, support-assisted |
| Formal job postings | Deferred; lightweight intents only |
| Video providers | YouTube first, plus allow-list |
| Assessment sharing | Candidate-controlled, with company-request override consent |
| Candidate profile-view analytics | Aggregate only, pending policy |
| Compensation fields | Optional, both sides control visibility |
| Pipeline customisation | Fixed default stages |
| Exports | Restricted CSV/PDF for authorized admins only |

---

## 12. MVP scope *(PRD §20.1)*

**In:** email verification + password + SSO + reset + basic setup · core candidate profile with
dynamic role questions for priority roles, documents/links, YouTube embeds, visibility,
preview/publish · company creation, public profile, membership roles, hiring toggle, lightweight
intents · public directory + authenticated candidate search with core filters and pagination ·
interest CTA with auth return, access grant, inbox, tracking · candidate view, shortlist,
messaging, internal notes, default pipeline, basic assignment · email and company-domain
verification, evidence labels, report/block, audit events · essential notifications · core funnel
analytics.

**Pilot priority roles** *(§20.2)* — full role-specific depth for: private/test-prep tutor ·
school teacher and teaching assistant · college admissions / academic counselor · professor /
lecturer / adjunct · curriculum or education-content specialist. All other roles receive generic
modules.
