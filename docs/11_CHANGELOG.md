# 11 — Changelog

Every feature added, modified, or removed. Newest first.
Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is semantic.

Categories: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`

---

## [Unreleased]

### Added
- **2026-08-12 — Account deletion is now actually processed (B-09).** `accountDeletion.job.js`
  gained the purge pass, implementing `16_RETENTION_POLICY.md` §3: the person's own content is
  deleted; `users` and `candidateProfiles` are **emptied and retained as tombstones** so the
  §16.1 audit trail and every company record stay referentially valid; the profile becomes
  `archived`, which `candidateAccess.service` already refuses — so the privacy outcome comes from
  the existing authority rather than new logic. **Held behind two switches that are both off by
  default** (`ACCOUNT_DELETION_RETENTION_DAYS` + `ACCOUNT_DELETION_PURGE_ENABLED`), because the
  policy is a founder/legal decision still awaiting sign-off. Retention windows for marketing leads
  (TD-06) and for audit IP/user-agent fields land in the same job, each independently gated.
- **2026-08-12 — Restore-by-email cancels a pending deletion.** A deletion request now issues a
  single-use `account_restore` token and emails it, and `POST /api/auth/restore-account` reverses
  the request. This closes a trap: both sign-in paths refuse a `deletion_pending` account, so
  without it the grace period could not be used, and someone who did *not* request the deletion had
  no way to discover or undo it. **Restoring issues no session and sets no cookie** — proving
  control of the mailbox undoes the request; signing in stays a separate, password-checked act. New
  `RestoreAccountPage` at `/restore-account`.
- **2026-08-12 — `docs/15_DATA_INVENTORY.md` and `docs/16_RETENTION_POLICY.md`.** The first is the
  engineering record of every personal-data field, purpose, recipient and retention state — the
  brief a legal drafter needs. The second is the per-collection retention proposal awaiting
  sign-off. §11 of the inventory records the hosting determination: DigitalOcean, India (APNIC
  `DIGITALOCEAN-AP`, `139.59.80.0/20`, country `IN`), reached over a Tailscale tailnet whose
  `100.84.170.103` address carries no geographic meaning at all.

- **2026-08-12 — CAN-04 blocking is reachable from the product (production-readiness pass).** The
  backend endpoints existed and were correct, but nothing in the UI could call `POST
  /api/me/candidate-profile/blocked-companies`, so the blocked list could not be populated and the
  two screens that display it were permanently empty. The candidate company page
  (`/me/companies/:slug`) now offers **Block**, confirmed by a new `BlockCompanyModal` that states
  only consequences the server actually enforces, and flips to **Unblock** on success with no
  reload. `GET /api/me/companies/:slug/relationship` gained a `blocked` field so that state comes
  from the server rather than being inferred. **No second blocking mechanism was introduced:**
  `candidateAccess.service` remains the single authority, and the new integration suite
  (`candidateBlocking.test.js`, 20 cases) proves a block removes the company from talent search, the
  candidate viewer, pipeline addition and company messaging.
- **2026-08-12 — `src/jobs/` background job infrastructure.** A small in-process runner
  (`jobRunner.js`) — single-flight per job, error-isolated, unref'd timers, disabled under
  `NODE_ENV=test` — plus `accountDeletion.job.js`, which reports the `deletion_pending` queue every
  six hours. Started from `server.js` after the database connects, never from `createApp()`, so no
  integration test acquires background timers. **The job purges nothing** — see `Security` below and
  `12_KNOWN_ISSUES.md` I-17.
- **2026-08-12 — Real `/terms` and `/privacy` pages.** `pages/legal/LegalDocumentPage.jsx` renders a
  document from `content/legal/`: contents list, `<h2>` per section, effective date, responsive and
  keyboard-accessible. Both documents are `status: 'pending_approval'`, and the page says so instead
  of paraphrasing a policy that does not exist. Publishing approved text is a content change with no
  code change and no new route (D-09).
- **2026-08-12 — `apps/api/scripts/cleanup-e2e-fixtures.mjs`.** Promoted from an ad-hoc script to a
  maintained one. Dry-run by default; selects only `@evallo-test.local` users and `E2E Academy *`
  companies, then derives every dependent document from those two id sets, so a real record cannot
  be selected.

### Fixed
- **2026-08-12 — The data export was a summary, not a copy.** `GET /api/me/settings/export`
  returned account fields, notification preferences, a *summary* of the candidate profile and
  memberships — and none of the person's professional content, so a portability request would have
  been answered wrongly with nothing failing. It now includes question-bank answers, experience,
  education, credentials, portfolio media, saved companies, expressions of interest, and
  conversations with their messages. Recruiter notes and pipeline records stay excluded by design
  (PRD §11.2), asserted by a test.
- **2026-08-12 — SET-01 → Privacy: unblock never worked.** The handler passed `company.id`, but the
  API returns `companyId`, so every unblock sent `.../blocked-companies/undefined` and came back
  `400`; the same handler then spread the returned *array* over the state object, so the list would
  not have refreshed even on success. Both were unobservable while nothing could create a block.
  `key={company.id}` was also undefined for every row. Pinned by a test asserting the payload uses
  `companyId` and not `id`.
- **2026-08-12 — Route-level code splitting.** Every workspace, settings, auth-secondary and public
  route is now `React.lazy`; layouts, guards, the landing page, sign-in/sign-up and the 404 stay
  eager. Each layout wraps its own `<Outlet/>` in `Suspense` with a new announced `RouteFallback`,
  so navigation chrome survives a chunk fetch and no route goes blank. Initial JS **751.46 kB →
  441.36 kB** (gzip **206.70 → 139.39 kB**), a 41% reduction, measured from `vite build` on both
  trees. The remainder is React, the router, axios, zod and `react-icons` — shared by every route,
  so splitting them would move bytes rather than remove them. `MarketingPage` stays eager: it is
  the first paint for an anonymous visitor and the SEO surface (ADR-004).

### Security
- **2026-08-12 — Google sign-in ignored account status.** `googleAuth()` linked and issued a session
  without checking `user.status`, so an account in `deletion_pending` (or `suspended`) could sign
  straight back in with "Continue with Google" — silently undoing the deletion request it had just
  made, which password sign-in correctly refused. Now gated identically. Token verification was
  factored into `verifyGoogleIdToken` with an injectable seam (`deps.verifyToken`, never passed by
  the controller) so the gate can be tested without a live call to Google; the suite asserts both
  the refusal for a `deletion_pending` account and, as a control, that an ACTIVE account still
  signs in.
- **2026-08-12 — The refresh cookie is configured from the deployment topology, not hard-coded.**
  `SameSite` was fixed at `Lax`, which is correct for `app.evallo.in → api.evallo.in` and silently
  fatal for a genuinely cross-site deployment: the browser never sends the cookie, and every user is
  signed out fifteen minutes after signing in. `lib/cookies.js` now resolves `SameSite`/`Secure`
  from `CLIENT_ORIGIN` vs `API_PUBLIC_URL` (`COOKIE_SAMESITE` overrides), escalating to
  `None; Secure` **only** when the origins prove the deployment is cross-site. Production refuses to
  boot if that resolves to `None` without an https API origin. `httpOnly` is unconditional in every
  mode. `CLIENT_ORIGIN` now accepts a comma-separated list of **exact** origins; the wildcard
  rejection is unchanged. `GET /api/health` reports the resolved policy so a misconfiguration is
  visible at deploy time rather than as a mystery sign-out.
- **2026-08-12 — Account deletion is not fulfilled, and the job says so.** The deletion job reports
  the queue and deliberately implements **no purge**: the retention period, the anonymise-vs-remove
  policy, and the treatment of records another party owns are undecided (PRD §16.1, ADR-014, B-09).
  `ACCOUNT_DELETION_RETENTION_DAYS` is intentionally unset, and tests assert `purged === 0` so a
  future purge cannot land unnoticed. Founder/legal decision — `12_KNOWN_ISSUES.md` I-17.

### Added
- **2026-08-10 — REC-13 candidate viewer + audit logging (M5).** New
  `candidates/candidateViewer.{service,controller,validation}.js` behind
  `GET /api/companies/:companyId/candidates/:candidateId` (`candidate:view`, held by every role
  including viewer). The rendered profile is `toRecruiterView()` — **byte-identical to the
  candidate's own CAN-03 preview**, pinned by a test so "this is exactly what a recruiter sees"
  cannot drift. Access is decided solely by `resolveCandidateAccess`; a block overrides even a live
  grant, and every refusal is a **404 rather than 403** so absent and forbidden stay
  indistinguishable (§16.1). `contactRevealed` follows the *candidate's* rule, not the viewer's role.
  Interest history is scoped to the asking company. `source` is a constrained enum
  (`search|interest|direct`) because it is written to the audit record.
- **2026-08-10 — `modules/audit` (M5).** `auditEvents` collection, `recordAuditEvent()`,
  `auditContext(req)` and `listCompanyAuditEvents()`, plus
  `GET /api/companies/:companyId/audit` (`company:settings`) and `companyAudit.controller.js`.
  Satisfies PRD §21.4's requirement that profile access be logged with company, user, timestamp and
  source: a view writes `candidate_profile.viewed`, a contact reveal writes
  `candidate_contact.revealed` as its own event, and a refused view writes nothing. The log is
  append-only, so repeat views accumulate. **Closes I-07.** Writes are currently fire-and-forget —
  see `12_KNOWN_ISSUES.md` I-08.
- **2026-08-10 — CAN-02 evidence entries: experience, education, credentials, media (M3).** New
  `candidates/profileEntry.{model,service,controller,validation}.js`. Four real collections —
  `experiences`, `educationEntries`, `credentials`, `evidenceItems` — served by one route family,
  `/api/me/candidate-profile/entries/:kind`, with full CRUD. Each row carries its **own**
  `visibility` and `verificationStatus`, which is exactly why ADR-008 gives them separate
  collections rather than embedded arrays. `verificationStatus` is **not client-writable**: it is
  absent from every Zod schema and from `ENTRY_KINDS[kind].writable`, and `pickWritable()` strips
  unknown keys before create and update, so a crafted body cannot forge verification. `media.url` is
  restricted to an allow-list of embed providers (YouTube, Vimeo) because accepting any URL would let
  a profile embed third-party content into a recruiter's browser (§16.3). No file upload exists;
  `credentials.documentUrl` takes a link the candidate already hosts, and the UI says so rather than
  implying an upload happened. **Takes CAN-02 from 4 of PRD §8.3's sections to 8 display steps.**
- **2026-08-10 — REC-01 company join requests.** New `modules/memberships/joinRequest.{model,service,controller}.js`
  and `companyJoinRequests`. `GET /api/companies/search` finds **published** companies only, with an
  anchored escaped regex and a two-character minimum so a short query cannot scan the collection, and
  reports the caller's own relationship. `POST .../join-requests` is authenticated but deliberately
  **not** company-scoped — the requester is not a member, so `resolveCompanyContext` could never
  authorise them. **A request grants nothing:** membership is created only on approval, with the role
  the *approver* chose from `GRANTABLE_ROLES`, which excludes `owner`, so ownership cannot be
  obtained by asking. Asking twice is idempotent via a partial unique index on pending rows.
- **2026-08-10 — SET-01 / SET-02 account settings.** New `modules/settings/{service,controller}.js`
  and nine `/api/me/settings/*` endpoints: notification matrix, password change (requires the current
  password, then revokes every session), active sessions, sign-out-others, connected sign-in methods,
  data export, and deletion request. Deletion sets `deletion_pending` and is **blocked while the
  caller still owns a company**. Export returns the caller's own data only — never other people's
  profiles, never colleagues' internal notes. Frontend is a **card dashboard with sub-pages**, not
  one giant form, with a separated Danger Zone. Candidate profile visibility is **not** duplicated
  here: settings owns the preference and `candidateAccess.service.js` stays the authority.
  `users` gains `phone`, `notificationPreferences` and `deletionRequestedAt`.
- **2026-08-10 — Workspace shell.** `WorkspaceSidebar` + `CandidateWorkspaceLayout` +
  `CompanyWorkspaceLayout`: one collapsible rail implementation, sticky beside scrolling content,
  with a mobile off-canvas drawer. The company rail filters its items by permission through
  `can()`, so it never offers a destination the route guard would refuse. Collapse state persists
  across navigation and reload. Replaces `WorkspaceNav`.
- **2026-08-10 — `BackLink` primitive.** The single back-to-parent affordance, extracted from
  `SettingsLayout`'s inline version. A real `Link` to a known parent rather than `history.back()`,
  so it still works on a page opened from a link or a new tab.
- **2026-08-10 — Question bank v6.** `QUESTION_BANK_VERSION = 6`; the definition gains the
  role-conditional and grouped-layout metadata the four question sections render from.
- **2026-08-10 — Tests: `candidateViewer.test.js` (17 cases)** covering preview parity, section
  completeness, per-company interest scoping, blocks overriding grants, private/paused reachability,
  grant withdrawal, contact rules, viewer-role access, 404-not-403, malformed ids, and all four
  audit behaviours. **`joinRequests.test.js` (17 cases)** covering search relationships, idempotency,
  unpublished/member/suspended refusals, approval role authority, ownership refusal, withdrawal
  scoping, and that the candidate sees the individual recruiter's name but never their email.
- **2026-08-10 — REC-05 / REC-16 hiring intents (M5).** PRD §7.5's lightweight hiring declaration.
  `modules/hiring-intents` gains a service, controller, validation and routes over the model that
  already existed. **No job description is required** and none is enforced: activation checks only
  role categories, employment types and delivery modes. Status transitions are guarded
  (`archived` is terminal) and audited; only `active` intents accept interest (§21.5); closing
  preserves pipeline entries (§11.4). "Currently hiring" is *derived* from active intents rather
  than stored as a second flag, so the public page and the candidate CTA cannot disagree with it.
  Interest questions are capped at three at both the edge and the model (§7.5, §8.7).
- **2026-08-10 — REC-14 pipeline and shortlist (M5).** New `modules/pipeline`:
  `pipelineEntries` with the fixed PRD §7.9 stages, `stageHistory`, `ownerId` (basic assignment),
  `source`, `roleIntentIds`, interview facts and outcome. One ACTIVE entry per candidate per
  company is enforced by a **partial unique index**, not a check-then-write, so two recruiters
  adding the same person race safely; the partial filter is what lets a rejected candidate be
  re-added (§21.4). Rejection requires a reason code and a hire requires the role — enforced in the
  service, so no caller can skip them. `savedCandidates` is a separate collection from the pipeline
  because saving is silent to the candidate (§21.4) while entering a workflow is not.
- **2026-08-10 — Internal notes.** New `modules/notes`. A separate collection from `messages`, so
  "notes never reach candidates" (§11.2, §21.4) is structural rather than a filter every future
  query must remember. Only the author may delete; deletions are audited.
- **2026-08-10 — REC-15 company-side messaging (M5).** `companyMessaging.service.js` mirrors the
  candidate-side service over the same `conversations`/`messages` rows. Unread counts and read
  receipts stay per side. Threads belong to the COMPANY, so a departing recruiter's replacement
  inherits them (§21.6). Opening a thread is upsert-shaped, so a second "message" continues the
  conversation rather than forking it.
- **2026-08-10 — Recruiter action surface wired.** Talent-search cards and the candidate viewer gain
  Save, Add to pipeline and Message, all persisting through real endpoints; the viewer gains the
  internal-notes panel. Shortlist and pipeline state are loaded from the server and survive reload.
  Every one of these paths first passes `resolveCandidateAccess`, so a recruiter cannot shortlist,
  file, note or message a candidate they may not see — absent and forbidden stay indistinguishable
  (§16.1).
- **2026-08-10 — `recruiterWorkflow.test.js`** — 29 integration cases pinning the §21.4/§11.4 rules
  above, including that an internal note never appears on any candidate-facing surface.

### Fixed
- **2026-08-10 — The collapsed sidebar's expand button was unclickable on the Messages page.** The
  rail clears the fixed navbar via `sticky top-20`, and a sticky box can only take its offset while
  its containing block has room. Messages sizes itself to the viewport, so the flex row was not tall
  enough to absorb the 80 px push-down; CSS clamped the rail to `y: 0` and the `z-50` navbar covered
  its toggle. A user who collapsed the rail and navigated to Messages could not expand it again.
  Fixed with `min-h-screen` on the workspace flex row in both layouts.
- **2026-08-10 — Sidebar overlapped the footer.** The rail was `fixed bottom-0`; it is now a sticky
  column inside a flex row that the footer renders after, so overlap is structurally impossible.
- **2026-08-10 — Candidate profile creation left the user stranded.** HOME-01's "Start your candidate
  profile" set a success message but never navigated, and `RequireCandidate` then bounced them. It now
  refreshes capabilities and routes to the builder. (The action still calls
  `POST /api/me/candidate-profile` directly — see `12_KNOWN_ISSUES.md` I-04.)
- **2026-08-10 — `FeatureCard` stayed dark on the now-white landing page.** The light-mode pass
  matched `bg-brand-dark` and missed this card's `bg-gray-900`, leaving darkened text on a dark
  ground.
- **2026-08-10 — Removed a dead route constant.** `PATHS.CANDIDATE_SAVED` (`/me/saved`) was defined
  but never routed and never linked, so the path fell through to the 404 page.
- **2026-08-10** — Pipeline assignment dropdown read `member.userId` / `member.name`, which the
  member wire shape does not have (it is `{ id, role, user: { id, name, email } }`). Every option
  therefore had an `undefined` value and key — a React duplicate-key warning, and an assignment
  control that could never have assigned anyone. Now reads `member.user.id` and drops retained rows
  with no user attached.

### Changed
- **2026-08-10 — Builder unified into the candidate shell.** `BuilderLayout` **deleted** and the
  builder moved into `CandidateWorkspaceLayout`. It previously owned the whole viewport — its own top
  bar, its own fixed rail, its own scrolling pane — which read as two sidebars fighting each other
  beside the candidate rail, and swapped the entire chrome when moving to any other candidate screen.
  The eight sections became a horizontal tab strip instead of a second column.
- **2026-08-10 — Page-level navigation no longer duplicates the rail.** The pill rows at the foot of
  the candidate overview (Companies / My interests / Messages) and the company overview (Interest
  inbox / Find candidates / Edit company page / Team) were verbatim copies of rail destinations and
  were removed; "Edit company page" pointed at `COMPANY_SETUP`, which renders the same screen the
  rail's "Company page" already opens, so nothing became unreachable. Each overview gained a **top**
  `BackLink` pointing *out* of its context instead. `/home`, which has no rail, keeps its two
  buttons but moved them above the content.
- **2026-08-10 — `MarketingFooter` gained a `minimal` variant** (identity, legal, copyright only),
  wired to every signed-in surface via `MarketingLayout minimalFooter`. The full link columns under a
  page that already has a rail were a third copy of the same destinations.
- **2026-08-10 — Landing page unified to a single ground colour.** `.hero-pattern` now resolves to
  white with low-alpha blue radials; `BusinessValueSection`, `EducatorSection`,
  `PlatformFeaturesSection`, `EarlyAccessSection`, `FeatureCard`, `EmployerBrandPanel`,
  `HeroAppMockup`, `MockCandidateCard` and `MockCompanyCard` all moved to light tokens; HOME uses the
  solid navbar. All tokens are light-theme values so the planned dark theme is a `dark:` pass rather
  than a second component set.
- **2026-08-10 — Candidate-first CTA.** The navbar's single prominent action is "Apply for roles";
  hiring is reached from the hero's secondary action and from HOME-01 after sign-in. `UserMenu` items
  are filtered by capability, so no item can point somewhere a route guard would bounce.
- **2026-08-10 — Shared form primitives.** `FormField` derives `aria-describedby` from whichever of
  `error`/`hint` is actually rendered, so the attribute never points at an absent element.
  `TextInput`, `Textarea` and `SelectInput` moved to the builder's input treatment (`rounded-xl`,
  `bg-white`, `shadow-sm`, `border-slate-200`, `focus:ring-4`).
- **2026-08-10** — Three `PlaceholderPage` routes replaced with real screens: `COMPANY_HIRING`,
  `COMPANY_PIPELINE`, `COMPANY_MESSAGES`.
- **2026-08-10** — `AUDIT_ACTIONS` / `AUDIT_TARGET_TYPES` extended for hiring-intent, pipeline,
  shortlist and note events, as the model's own header anticipated.

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
- **2026-08-05 — REC-07 team invitations.** Invite by email with a role, list, resend, cancel.
  An invitation is a `CompanyMember` row with status `invited` — the same record that becomes the
  membership — so there is no second table. The invitee need not have an account; the invitation
  binds to the address and is claimed only once that address is **verified** (PRD §6.4). An admin
  cannot invite an owner: that needs `company:transfer`.
- **2026-08-05 — REC-18 team management and ownership transfer (partial).** Member list, role
  changes, removal, and ownership transfer. Delivered ahead of its M6 milestone because REC-07
  creates members and nothing could then manage them. A company can never be left without an owner, and nobody may
  alter their own membership. Transfer promotes then demotes — never the reverse — so a failure
  between the two writes leaves two owners rather than none, and asserts exactly one owner before
  returning. The outgoing owner stays on as an admin.
- **2026-08-05 — REC-10 company home.** Recruiting overview, pending actions, inbound-interest and
  hiring summaries, quick actions. Owns no data: the publish checklist is REC-06's own
  `buildPublishChecklist`, so the dashboard can never invite someone to publish a page the publish
  endpoint would reject. Open to every member — sections are withheld individually rather than the
  page being gated.
- **2026-08-05 — REC-11 interest inbox.** Filters, sorting, paging, status changes, and a route
  into the candidate profile. Reads the same `expressionsOfInterest` rows CAN-07 writes and CAN-08
  tracks. A recruiter cannot write `withdrawn` and cannot reopen a withdrawn interest (§21.5), and
  contact details follow the candidate's rule rather than the recruiter's role.
- **2026-08-05 — REC-12 talent search.** Keyword plus eight facets, OR within a facet and AND
  between them, server-side paging, and a per-result explanation of which criteria matched (§21.4).
  Query construction is confined to `modules/search/search.service.js` per ADR-010. Blocks and
  visibility are the first pipeline stage, before the join, the count and the paging. There is
  deliberately **no relevance sort** — §10.3 forbids implying objective quality ranking, and no
  relevance signal exists in the data to build one from honestly.
- **2026-08-05 — `candidateAccess.service`.** One answer to "may this company see this candidate,
  and how much of them". REC-11, REC-12 and the contact-visibility rules all resolve through it;
  three copies of PRD §4.3 would eventually disagree, and a disagreement in that direction is a
  privacy breach rather than a bug report.
- **2026-08-04 — REC-01 create or join a company.** One screen for both routes into the recruiter
  capability. Creation reuses the existing `CreateCompanyForm` and `POST /api/companies`; joining
  accepts or declines a `CompanyMember` row with status `invited`. Creating invitations is REC-07
  and is not implemented.
- **2026-08-04 — REC-02 company setup wizard.** Three steps (basics, brand, education footprint)
  covering exactly the fields PRD §7.3 requires for publication. Draft-first, per-step progress,
  save-and-continue, deep-linkable via `?step=`, and pending edits are persisted before switching
  steps. **No field was added to the company model** — every one already existed.
- **2026-08-04 — REC-06 preview and publish.** The preview renders through
  `serialisePublicCompany`, the same serialiser PUB-02 uses, and the same `CompanyOverview` /
  `OpenRoleCard` components — neither data nor rendering is duplicated. Publish enforces the §7.3
  requirements server-side; unpublish returns the page to draft.
- **2026-08-03 — PRD compliance pass on CAN-02, CAN-03, CAN-09.**
  - **CAN-02:** country/region, languages, time zone, and an on-site location question. PRD §8.5
    marks country and time zone **required for publication**; they were previously absent, so a
    profile could publish with no location at all. Adds a third answer target, **`user`**, writing
    the personal layer to `users` per `05_DATABASE_SCHEMA.md` §2 rather than duplicating it onto
    the candidate profile. `field` now accepts dot paths (`location.country`). Implements
    Appendix C **location conditionality** via `onlyForDeliveryModes` — remote-only candidates are
    never asked commuting questions. Published as **question bank v2**; v1 retained and
    deactivated, per ADR-007.
  - **CAN-03:** the recruiter header now carries photo, location/time zone and languages, completing
    PRD §8.8. Same `toRecruiterView` serialiser, so preview and recruiter view stay identical.
  - **CAN-09:** accept, decline and mute — the PRD §11.2 candidate actions that were missing.
    Declining closes the thread to replies and mutes it **without deleting messages** (§16.3);
    accepting reopens it; replying accepts a pending thread implicitly. Mute is idempotent and
    never hides the thread. New fields on `conversations`: `candidateState`,
    `candidateRespondedAt`, `mutedAt`.
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
- **2026-08-05 — seven company routes 404'd, three of them reachable by clicking.** `search`,
  `candidates/:id`, `hiring`, `pipeline`, `messages`, `profile/edit` and `settings` were declared
  in `paths.js` and linked from shipped pages but never registered, so React Router fell through
  to `*`. They now resolve to labelled placeholders naming the PRD section that will replace them.
- **2026-08-05 — three navbar links did nothing off the marketing page.** "For Businesses",
  "For Educators" and "Features" used bare fragments (`#businesses`), which resolve against the
  current URL and matched nothing anywhere else. Path-qualified to `/#…`, as the footer already did.
- **2026-08-05 — anchor navigation never scrolled.** `ScrollToHash` looked the target up once, a
  single `requestAnimationFrame` after the hash changed, and returned silently if it was absent —
  which it always is when the app is still booting. It now retries on a timer for a bounded
  window; a timer rather than rAF, because rAF does not fire in a backgrounded tab and "the anchor
  works unless you switched away" is not worth shipping.
- **2026-08-04 — Google button vanished after six seconds.** `useGoogleButtonRendered` polled for
  a non-zero-width `iframe`, but GSI renders its button as a `div[role="button"]`; its only iframe
  is an auxiliary FedCM frame that is always 0×0. The predicate could never be satisfied, so a
  working button was replaced by the disabled fallback on every load.
- **2026-08-04 — the public serialiser did not control its own field list.**
  `serialisePublicCompany` spread whatever document it was handed, so the public shape was really
  decided by each caller's `.select()`. PUB-02 projected the right fields; REC-06's preview passed
  a full document and leaked `__v` and `slugHistory`. The serialiser now picks
  `PUBLIC_PROFILE_FIELDS` itself, and the REC-06 test compares the entire payload instead of
  sampling six keys — the sampling is what hid it.
- **2026-08-04 — `hasError` was spread onto `<fieldset>`** in the CAN-02 builder and the REC-02
  wizard, producing a React DOM warning on every render.
- **2026-08-03 — test suites destroyed real data.** Six unscoped `deleteMany({})` calls wiped every
  candidate profile and company membership and signed out every user on each run; `auth.test.js`
  additionally matched every other suite's `@example.com` fixtures and deleted their users
  mid-run. All cleanup is now scoped to each suite's own fixtures.
- **2026-08-03 — an anonymous interest permanently blocked the signed-in candidate.** The unique
  index keys on `contact.email` while the service matched on `candidateId`, so a public-page
  submission from the same address made the authenticated one fail forever with a contradictory
  "already submitted". An authenticated submission now **adopts** the anonymous record (PRD §8.7
  steps 2–3) — one record, now owned, with the access grant created.
- **2026-08-03** — Profile builder discarded unsaved edits when switching sections. Pending edits
  are saved first; invalid input keeps the user on the section with the errors.
- **2026-08-03** — Messages: unread badge and thread preview went stale after reading or replying.
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
