# 13 — Backlog

**Last updated:** 2026-07-31

Screen-level work is tracked in `14_PROGRESS_TRACKER.md`. This document holds everything **not**
in the current milestone plan: deferred features, technical improvements, and ideas.

Priority: `P0` blocks a milestone · `P1` needed for pilot · `P2` valuable, not urgent · `P3` idea

---

## 1. Pending features — in MVP scope

All 40 screens remain unbuilt. See `14_PROGRESS_TRACKER.md`. Items below are MVP scope that has
no screen of its own and could otherwise be forgotten.

| # | Item | PRD | Milestone | Priority |
|---|---|---|---|---|
| B-01 | Transactional email templates — verification, reset, invitation, interest, message | §15 | M1 | **P0** |
| B-02 | Audit event emission across all candidate-access paths | §14.3, §16.1 | M3+ | **P0** |
| B-03 | Company domain verification (DNS or email proof) | §16.2 | M2 | P1 |
| B-04 | Evidence verification labels — self-declared / document / platform / issuer / expired | §8.6 | M3 | P1 |
| B-05 | Report and block flows for candidates and companies | §16.3 | M6 | P1 |
| B-06 | Notification preferences with digest frequencies | §15.1 | M6 | P1 |
| B-07 | Core funnel analytics event taxonomy | §18.1 | M6 | P1 |
| B-08 | Candidate and company data export | §19 | M6 | P1 |
| B-09 | Account deletion and anonymisation workflow — **blocked on a policy decision, not on engineering.** The job infrastructure and the eligibility query exist and report the queue (`src/jobs/accountDeletion.job.js`); the purge/anonymise pass is deliberately unimplemented until the retention period, the anonymise-vs-remove field policy, and the treatment of records another party owns are decided. See `12_KNOWN_ISSUES.md` I-17 | §16.1 | M6 | **P0 — accepted requests are not fulfilled** |
| B-10 | Company duplicate detection and claim process | §21.6 | M2 | P1 |
| B-11 | Slug-change redirect handling | §17 | M2 | P2 |
| B-12 | Saved companies with hiring-change notifications | §8.2 | M4 | P2 |
| B-13 | Profile completeness by section and evidence type | §18.3 | M3 | P2 |
| B-14 | Match explanation on search result cards | §7.8, §10.1 | M5 | P1 |
| B-15 | **Company media gallery** on the public profile. Designed and specified in the approved PUB-02 reference; the only missing piece is where the bytes live. **Blocked on D-02 (file storage)** — ADR-020's interim MongoDB exception for profile photos explicitly does not extend to this. When D-02 lands: a `media` array on `companies`, a `culture`-step uploader, and a gallery block above the pull quote | §7.4 | M6 | P2 |
| B-16 | **Educator testimonials** ("Educator voices") on the public profile. In the approved PUB-02 reference and deliberately not built: these are public statements attributed to a named person about a named employer, so they need employment verification, an authorship path, and moderation (§16.3) before a single one can be published. Not a rendering task | §7.4, §16.3 | M6 | P2 |
| B-17 | **Multi-role expressions of interest.** The PUB-02 reference lets a candidate tick several roles at once; `publicInterestSchema` carries a single optional `hiringIntentId` and one interest record means one intent all the way to REC-11's inbox, the dedupe rule, and CAN-07. The modal ships radio cards — what the contract can express. Changing it is a change to what an interest *is*, across five surfaces | §8.7, §9.2 | M6 | P2 |

---

## 2. Technical improvements

| # | Item | Source | Priority |
|---|---|---|---|
| T-01 | Facet reconciliation script to rebuild `CandidateProfile.facets` from source | L-04 | **P0 by M5** |
| T-02 | Integration test suite covering every API route | ADR-002 mitigation | **P0** |
| T-03 | Dedicated test suite for search authorization predicates | ADR-006 §6.2 | **P0 by M5** |
| T-04 | Internal admin UI for the question bank | L-03 | P2 |
| T-05 | ADR-004 Stage 2 — full SSR of public routes | ADR-004 exit criteria | P2, conditional |
| T-06 | Publish-time prerender cache for company pages | ADR-004 alt. 3 | P3 |
| T-07 | Server-state library (TanStack Query) if fetch waterfalls become measurable | TRD §8 | P3, needs ADR |
| T-08 | Atlas Search strategy in `modules/search` once hosting is decided | ADR-010 | P1 by M5 |
| T-09 | CI pipeline — lint, test, `npm audit` | §16.4 | P1 |
| T-10 | Error tracking and log aggregation | §19 Observability | P1 before pilot |
| T-11 | Search result virtualisation if pagination proves insufficient | §19 | P3 |
| T-12 | MFA for company owners and admins | §16.4 | P2, later phase per PRD |

---

## 3. Phase 2 *(PRD §20.3)*

Saved-search alerts and candidate recommendations · expanded platform assessments and
company-requested tasks · reference collection and credential issuer verification · **formal job
postings with a richer requisition workflow, only if pilots demonstrate need** · interview
scheduling, scorecards, templates, tasks, calendar integration · native profile comparison,
talent pools, bulk pipeline operations, exports · public company following with candidate alerts
for new hiring intents · company analytics dashboards and recruiter response benchmarks.

---

## 4. Later / optional *(PRD §20.4)*

Native video recording, hosting, and async video interviews · HRIS/ATS, calendar, email,
background-check, and identity-verification integrations · offer and contract workflows,
onboarding handoff, payroll/timesheet connections · advanced semantic matching with explainable
recommendations · public API and white-label enterprise talent portals · candidate endorsements,
verified placements, and a long-term professional reputation graph.

---

## 5. Deferred product decisions *(PRD Appendix D)*

Each has an implemented MVP default; changing one requires an ADR. Full table in `02_PRD.md` §11.

Highest-impact if reversed:
- **One vs. multiple candidate profiles** — MVP allows one. Multiple personas would change the
  `candidateProfiles` unique index on `userId` and every profile-resolution path.
- **Pipeline customisation** — MVP stages are fixed. Custom stages would change `pipelineEntries`
  and all stage analytics.
- **Formal job postings** — adding them introduces a genuine requisition object alongside
  `hiringIntents`, plus `JobPosting` structured data currently excluded by PRD §17.

---

## 6. Ideas / nice-to-have

| # | Idea | Note |
|---|---|---|
| I-01 | Candidate profile "strength" guidance based on missing structured data | PRD §18.3 requires guidance be concrete, **not opaque scoring** |
| I-02 | Company page preview link with expiring token for pre-publication review | Implied by draft preview, §9.3 |
| I-03 | Bulk company invitation for pilot onboarding | Operational convenience |
| I-04 | Recruiter saved-search sharing within a company | Extends §10.1 saved searches |
| I-05 | Candidate "open to work" reminder when a profile goes stale | Supports §10.1 freshness signals |
| I-06 | Public directory filtering by active hiring role | Extends PUB-01 |
