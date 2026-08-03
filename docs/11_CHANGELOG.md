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

> **Maintenance note.** Per founder instruction (2026-07-31), this changelog is **not** updated on
> every HTML batch. Per-screen analysis updates go to the TRD, Component Guide, API Documentation,
> Progress Tracker, and — only when architecture changes — the ADR. The changelog records
> releases and shipped features, not analysis passes.

### Added
- **2026-08-03 — CAN-02 profile builder.** Section navigation, per-section progress, save and exit,
  validation, and role-gated dynamic questions, all driven by a **versioned question bank**
  (ADR-007) rather than a hard-coded form. New collections `questionBanks` and `candidateAnswers`;
  seven structured fields added to `candidateProfiles`.
- **2026-08-03 — CAN-03 profile preview.** The exact recruiter rendering via a single shared
  `toRecruiterView` serialiser, private-field indicators explaining *why* each field is withheld,
  and publish controls that name the PRD §8.5 gaps rather than scoring them.
- **2026-08-03 — CAN-04 visibility settings.** Draft/private/discoverable/paused, four contact
  rules, and company blocks. Pausing preserves existing access, per PRD §4.3.
- **2026-08-03 — CAN-05 company discovery.** The PUB-01 directory rendered in the candidate
  context; the only difference is where a card links, which is now a prop.
- **2026-08-03 — CAN-06 company page, signed in.** Save/unsave and an interest-state overlay on
  the same public company payload PUB-02 uses. New collection `savedCompanies`.
- **2026-08-03 — CAN-07 interest submission.** Role selection, optional note, and a consent
  disclosure built from the candidate's own visibility settings. Creates the interest *and* the
  access grant. New collection `accessGrants`.
- **2026-08-03 — CAN-08 my interests.** Status, date, role, and withdraw — withdrawing also
  revokes the company's access grant.
- **2026-08-03 — CAN-09 messages.** Threads, reply, and safety reporting. New collections
  `conversations` and `messages`.
- **2026-08-02 — CAN-01 candidate home.** Completeness by section, visibility, pending actions,
  and an opportunity overview.
- **2026-08-02 — HOME-01 universal home.** Context switcher covering Personal and every company
  (PRD §5.2, §5.3); state-driven next-setup-actions panel; per-company role and permission counts;
  persistent Explore/Settings navigation. Placeholder destinations for `/settings` (SET-01) and
  `/c/:companySlug` (REC-10), the latter behind `RequireCompany`.
- **2026-08-02 — AUTH-05 first-action router.** Three choices (candidate, company, explore) that
  route and nothing else. Adds `POST /api/me/complete-onboarding` and `users.onboardingCompletedAt`
  so the screen is shown exactly once.
- **2026-08-02 — AUTH-01 → AUTH-04 brought to full PRD compliance.** Sign-up is email-only;
  `POST /api/auth/verify-email` returns a single-use setup token; new `POST /api/auth/set-password`
  is where the credential and the session are first created; the name is collected afterwards via
  `PATCH /api/me`.
- **2026-08-02 — AUTH-10 sign in.** Remember-me (session vs persistent cookie, carried across
  rotations) and per-account failed-attempt lockout.
- **2026-08-02 — AUTH-11 / AUTH-12 password reset.** Non-enumerating request, single active token,
  all sessions revoked on completion.
- **2026-08-02 — Email delivery.** Nodemailer with console and SMTP/SendGrid transports.
  `NODE_ENV=test` always forces the console transport.
- **2026-08-02 — Google sign-in.** ID-token verification via `google-auth-library`; our own JWT is
  always issued. Optional — disabled cleanly when `GOOGLE_CLIENT_ID` is unset.
- **2026-08-01 — PUB-01 / PUB-02.** Public company directory with facets and filters, public
  company profile, and expression of interest.
- **2026-07-31 — M0 scaffold and MKT-01 marketing landing page** with `POST /api/public/early-access`.

### Changed
- **2026-08-03** — `GET /api/me/candidate-profile` now returns `{ profile, completeness, nextSteps }`
  instead of the bare profile; the derived parts moved into a service.
- **2026-08-03** — `CompanyCard` and `CompanyDirectoryPage` take a `profilePath` prop so CAN-05 can
  reuse them without duplication.
- **2026-08-02** — Development ports moved to web `3001` / api `8081`.
- **2026-08-02** — The refresh-session collection is `authSessions`, not `sessions`.

### Fixed
- **2026-08-03** — The capability route guards evaluated before capabilities finished loading, so a
  hard reload of `/me` or `/c/:slug` redirected a genuine candidate or company member away.
- **2026-08-03** — `company.initials` was `undefined` on the public directory and company profile
  too — the same `.lean({ virtuals: true })` no-op, so every logo-less company avatar rendered blank
  on PUB-01 and PUB-02.
- **2026-08-02** — `capabilities.companies[].initials` was always `undefined`: the query used
  `.lean({ virtuals: true })`, which is a no-op without the `mongoose-lean-virtuals` plugin, so
  every company avatar without a logo rendered blank.
- **2026-08-02** — Signup issued a session before email verification. Removed; login now enforces
  verification, checked after the password so it is not a verification oracle.
- **2026-08-01** — `googleId` used a sparse unique index, which still indexes `null` and therefore
  collided every password account against every other. Replaced with a partial filter on
  `$type: 'string'`.
- **2026-08-01** — Sign out did nothing: the context exposed `logout` while components called
  `signOut`.
- **2026-08-01** — CORS blocked `POST` after a successful preflight; `x-landing-path` was missing
  from `allowedHeaders`.
- **2026-08-01** — Navbar contrast failure (1.5:1) where a transparent navbar sat on a white page.
  `transparentOnTop` is now opt-in.

### Security
- **2026-08-02** — Refresh-token rotation with family-scoped reuse detection is live.
- **2026-08-02** — Passwords are bcrypt (cost 12) and never returned by any endpoint.
- **2026-08-02** — All `/api/auth` writes are rate limited; account lockout is per account, so
  rotating IPs does not evade it.

### Deferred
- **2026-08-03 — CAN-10 assessments deliberately not built.** PRD §20.3 places expanded assessments
  in Phase 2 and TRD §15 D-01 records the domain as unscheduled pending a founder scope decision.
  Confirmed by the founder rather than reversed silently. CAN-11 (saved companies screen) and
  CAN-12 (candidate settings) are likewise out of this milestone.

### Removed
- **2026-08-01** — **Auth0 removed entirely.** Authentication is in-house (bcrypt + JWT + rotating
  refresh cookie). No external identity provider remains; reintroducing one requires an ADR.
- **2026-08-02** — The previous sign-up flow that collected name and password on the first screen,
  which contradicted PRD §21.1.

---

## Release history

*No releases yet.*
