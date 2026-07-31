# 11 — Changelog

Every feature added, modified, or removed. Newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is semantic.

Categories: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`

---

## [Unreleased]

### Docs
- **2026-07-31** — Documentation baseline created (`docs/01`–`14`).
  - `01_BRD.md` — vision, personas, journeys, goals, metrics, constraints, roadmap.
  - `02_PRD.md` — engineering-facing user stories, acceptance criteria, edge cases, permissions.
  - `03_TRD.md` — architecture, routing, auth, authorization, API conventions, state management,
    validation, security, performance, deployment constraints.
  - `05_DATABASE_SCHEMA.md` — full specification for M0–M2 collections; structural definition for
    later ones; index and transaction requirements.
  - `07_PROJECT_STRUCTURE.md` — folder-by-folder guide with enforced import boundaries.
  - `10_DECISION_LOG.md` — ADR-001 … ADR-012.
  - `14_PROGRESS_TRACKER.md` — 40-screen inventory, milestones M0–M6, technical debt register.
  - `04`, `06`, `08`, `09`, `12`, `13` — conventions and templates established; entries added as
    features are built.

### Decisions
- **2026-07-31** — ADR-001 accepted: one global account; candidate and recruiter are capabilities,
  not account types. **Corrects the original brief**, which described two permanent user types —
  a model that contradicts PRD §1, §4, §5.2, §7.10, and §21.6.
- **2026-07-31** — ADR-002 accepted (CTO): MERN stack in JavaScript. No TypeScript, no Next.js,
  no alternative framework. Compensating controls recorded in the ADR are mandatory.
- **2026-07-31** — ADR-004 proposed, then revised the same day after the CTO scoped SEO to Google
  only. Now a staged approach: Express-side metadata injection first, full SSR only if defined
  exit criteria are met. **Awaiting approval; needed by PUB-02, not before.**
- **2026-07-31** — ADR-005 accepted: refresh token in an httpOnly cookie with rotation and reuse
  detection; access token in memory. Chosen over `localStorage` given the candidate PII, teaching
  licence numbers, and background-check statuses this platform stores.
- **2026-07-31** — ADR-010 accepted (CTO constraint): MongoDB is the sole datastore and sole
  search engine. No secondary index. Query construction confined to `modules/search`.
- **2026-07-31** — ADRs 003, 006, 007, 008, 009, 011, 012 accepted.

### Added
*No code yet. First entries land with M0 (scaffold).*

---

## Release history

*No releases yet.*
