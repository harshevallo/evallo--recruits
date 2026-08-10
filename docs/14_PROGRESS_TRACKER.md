# 14 — Progress Tracker

**Last updated:** 2026-08-10 (documentation audit against the working tree)
**Current milestone:** M5 — Recruiting workflow 🔄 **recruiter loop functional end to end**
**Overall:** 36 of 45 screens complete, 4 partial, 4 pending, 1 post-MVP

> **This revision was produced by auditing the code, not the previous document.** Endpoint counts
> come from the route files, statuses from services/models/tests, and test totals from a full
> `npm test` run. Three earlier claims were found to be ahead of the code and are corrected below
> and in `12_KNOWN_ISSUES.md`; the most significant is **TD-04**, which described a `facets`
> denormalization that was never built.

---

## PROJECT STATUS

### ✅ Completed
| Item | Date | Notes |
|---|---|---|
| PRD ingested and analysed | 2026-07-31 | 40 pages, §1–21 + Appendices A–D |
| Stack locked by CTO | 2026-07-31 | MERN + JavaScript. ADR-002 |
| SEO scope locked by CTO | 2026-07-31 | Google only. ADR-004 |
| ADRs 001–016 | 2026-07-31 | `10_DECISION_LOG.md` |
| **M0 — Foundation scaffold** | 2026-07-31 | Monorepo, DB connection, error/validation plumbing |
| **M-M — MKT-01 marketing page** | 2026-07-31 | 27 components, `earlyAccessRequests`, prerender deferred |
| **PUB-01 / PUB-02 — public company surface** | 2026-08-01 | Directory with facets, public profile, expression of interest |
| **AUTH-01 → AUTH-05 — sign-up chain** | 2026-08-02 | Email-only signup → verify → set password → name → first-action router |
| **AUTH-10 / AUTH-11 / AUTH-12** | 2026-08-02 | Sign in with remember-me and per-account lockout; forgot/reset password |
| **Session management** | 2026-08-02 | JWT access + rotating refresh cookie, reuse detection, logout |
| **Google sign-in** | 2026-08-02 | ID-token verification only; our own JWT is always issued |
| **Email delivery** | 2026-08-02 | Nodemailer; console transport in dev, SMTP/SendGrid in production |
| **HOME-01 — universal home** | 2026-08-02 | Next-actions panel + context switcher (Personal + every company) |
| **CAN-01 — candidate home** | 2026-08-02 | Completeness by section, visibility, pending actions, opportunities |
| **CAN-02 — profile builder** | 2026-08-03 | Question bank (ADR-007), section nav, save & exit, role-gated questions |
| **CAN-03 — profile preview** | 2026-08-03 | Exact recruiter rendering, private-field indicators, publish controls |
| **CAN-04 — visibility settings** | 2026-08-03 | Four states, contact rules, company blocks |
| **CAN-05 — company discovery** | 2026-08-03 | Reuses the PUB-01 directory in the candidate context |
| **CAN-06 — company page, signed in** | 2026-08-03 | Save/unsave, interest state overlay |
| **CAN-07 — interest submission** | 2026-08-03 | Role select, note, consent disclosure, access grant |
| **CAN-08 — my interests** | 2026-08-03 | Status, withdraw, grant revocation |
| **CAN-09 — messages** | 2026-08-03 | Threads, reply, safety reporting |
| **REC-10 / REC-11 — company home + interest inbox** | 2026-08-09 | Dashboard, inbox, status advance, viewed marking |
| **REC-18 — team management (partial)** | 2026-08-09 | Members, role change, removal, ownership transfer |
| **REC-12 — talent search** | 2026-08-09 | Server-side facets, keyword, sorts, pagination, URL state |
| **REC-01 — join requests** | 2026-08-10 | Company search + owner-approved membership requests |
| **REC-05 / REC-16 — hiring intents** | 2026-08-10 | Guarded status transitions, 3-question cap, derived "hiring" |
| **REC-13 — candidate viewer + audit** | 2026-08-10 | Preview-parity view, one access authority, `auditEvents` |
| **REC-14 — pipeline + shortlist + notes** | 2026-08-10 | 9 stages, stage history, partial unique index, separate notes collection |
| **REC-15 — company messaging** | 2026-08-10 | Company-side threads, per-side unread, individual recruiter identity |
| **CAN-02 evidence entries** | 2026-08-10 | `experiences` · `educationEntries` · `credentials` · `evidenceItems`, per-item visibility |
| **SET-01 / SET-02 — settings** | 2026-08-10 | Account, security, notifications, privacy, data; company settings |
| **Workspace shell** | 2026-08-10 | One collapsible rail, two workspace layouts, navigation de-duplicated |

### 🔄 In Progress
**The candidate journey is complete through CAN-09, and the recruiter loop runs end to end**
(search → view → shortlist → pipeline → message, with notes and audit).

Remaining in M1: AUTH-13 (SSO conflict resolution) and AUTH-14 (return-path preservation).

Remaining in M3: **references only.** Experience, education, credentials and portfolio media are
built as four collections with per-item visibility (see the matrix above); references and issuer
verification stay deferred to Phase 2 by PRD §20.3. `verificationStatus` exists on every entry but
nothing writes any value other than `unverified`, so no credential is verified today.

Remaining in M6: notification generation and delivery, and a real moderation queue.

**CAN-10 (assessments) is deliberately NOT built.** PRD §20.3 places expanded assessments in
Phase 2 and TRD §15 D-01 records the domain as unscheduled, pending a founder scope decision.
Confirmed by the founder on 2026-08-03.

### ⏳ Pending — immediate
| Item | Blocked by / note |
|---|---|
| Integration tests for profile entries and SET-01 | Nothing — both surfaces ship untested (I-13) |
| `await` audit writes on the §16.1 paths | Nothing — currently fire-and-forget (I-08) |
| Taxonomy enums on `candidateProfiles` arrays | Schema change, deliberately out of REC-12 scope (I-06) |
| Compound indexes for the real search match+sort | Needs `explain()` against seeded volume (I-09) |
| AUTH-13 / AUTH-14 | Close out M1 |
| Terms + Privacy content (D-09) | Founder — the live forms already claim consent to both |
| Convert MongoDB to a replica set | See 🚫 below |

### 🚫 Blocked
| Item | Blocker | Owner |
|---|---|---|
| **Transactions** | The MongoDB server is standalone, not a replica set. `/api/health` reports `supportsTransactions: false`. Refresh-token rotation works without them but is not atomic. Conversion steps in `08_SETUP_GUIDE.md` §1 — not done automatically because it modifies a system service | Founder |
| **Google sign-in on localhost** | Google returns `403` from `gsi/status` for `http://localhost:3001` unless the origin is registered in the Google Cloud console. Email auth is unaffected | Founder |
| Terms + Privacy content | The live forms already claim consent to both (D-09) | Founder |
| Deployment configuration | Deliberately deferred | Founder |


---

## MODULE IMPLEMENTATION MATRIX

Verified against the working tree on 2026-08-10. **Backend** = service + controller + route;
**DB** = a model that actually persists; **Tests** = integration coverage for that module's endpoints.

Key: ✅ Complete · 🟡 Partial · 🔴 Not implemented · ⚪ Placeholder

| Feature / module | PRD | Overall | Backend | Frontend | DB | Tests | Remaining gaps |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| **REC-12 Talent search** | §10, §21.4 | ✅ | ✅ | ✅ | ✅ | ✅ 19 | No saved searches; no compound index for the real match+sort shape (I-09) |
| **REC-13 Candidate viewer** | §7.6, §8.8 | ✅ | ✅ | ✅ | ✅ | ✅ 17 | Read-only by design; no evidence-download event (nothing is downloadable) |
| **Candidate access control** | §4.3, §16.1 | ✅ | ✅ | ✅ | ✅ | ✅ | Single authority `resolveCandidateAccess`; per-row invocation is an N+1 (I-10) |
| **Audit logging** | §14.3, §21.4 | 🟡 | ✅ | ✅ | ✅ | ✅ 4 | Writes are **fire-and-forget** (I-08); only company-scoped read UI |
| **CAN-02 Profile builder** | §8.3, App. C | ✅ | ✅ | ✅ | ✅ | ✅ 17 | 8 of §8.3's 12 sections (I-04a) |
| **Experience & Education entries** | §8.3 §4–5 | 🟡 | ✅ | ✅ | ✅ | 🔴 **0** | Fully working, **entirely untested** (I-13) |
| **Credentials & Scores** | §8.3, §14.2 | 🟡 | ✅ | ✅ | ✅ | 🔴 **0** | Persists; `documentUrl` is a link — **no upload** (I-15); nothing ever sets `verified` |
| **Portfolio & Media** | §8.3, §16.3 | 🟡 | ✅ | ✅ | ✅ | 🔴 **0** | YouTube/Vimeo links only — no file storage (I-15) |
| **References** | §8.3, §20.3 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | Phase 2 by PRD §20.3 |
| **CAN-04 Visibility / publish** | §4.3, §8.5 | ✅ | ✅ | ✅ | ✅ | ✅ | Two surfaces (CAN-04 + builder) over one implementation |
| **Hiring intents** | §7.5 | ✅ | ✅ | ✅ | ✅ | ✅ 6 | Hiring-manager assignment to an intent not built (REC-18 gap) |
| **Pipeline** | §7.9, §21.4 | ✅ | ✅ | ✅ | ✅ | ✅ 11 | `ownerId` is basic assignment only; no per-member scoping of who may see whose entries |
| **Saved candidates (shortlist)** | §21.4 | ✅ | ✅ | ✅ | ✅ | ✅ 4 | — |
| **Recruiter notes** | §11.2, §21.4 | ✅ | ✅ | ✅ | ✅ | ✅ 4 | No edit, only create/delete by author |
| **Company messaging** | §11.2, §21.6 | ✅ | ✅ | ✅ | ✅ | ✅ 4 | `attachments` reserved and always empty (I-15) |
| **Join requests / membership approval** | §7.2 | ✅ | ✅ | ✅ | ✅ | ✅ 17 | — |
| **Team management (REC-18)** | §7.6, §4.2 | 🟡 | 🟡 | 🟡 | ✅ | ✅ 23 | No per-member permission overrides, no suspend/reactivate, no hiring-manager intent scoping |
| **Company settings (SET-02)** | App. A | ✅ | ✅ | ✅ | ✅ | 🔴 **0** | Audit read + company controls; no dedicated suite |
| **Account settings (SET-01)** | App. A, §15, §16.1 | 🟡 | ✅ | ✅ | ✅ | 🔴 **0** | **Untested** (I-13); notification prefs stored but never consulted (I-12) |
| **Notifications delivery** | §15 | 🔴 | 🔴 | ⚪ | 🔴 | 🔴 | Preference UI exists; no collection, no generation, no delivery |
| **Moderation / reports** | §16.3 | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 | Report captured on the conversation; no `reports` collection, no queue, no appeal |
| **Workspace layouts / sidebar** | §5.2, §7.6 | ✅ | — | ✅ | — | 🔴 | No committed frontend test (I-14) |
| **Settings pages** | App. A | ✅ | ✅ | ✅ | ✅ | 🔴 | See SET-01 |
| **Marketing / navigation** | MKT-01 | ✅ | — | ✅ | — | 🔴 | Single-colour ground; nav de-duplication verified by uncommitted browser scripts (I-14) |
| **Shared form/input UI** | §19.1 | ✅ | — | ✅ | — | 🔴 | Floating-label deviation still open (TRD §15 D-10) |
| **Back navigation / de-duplication** | §5.2 | ✅ | — | ✅ | — | 🔴 | Enforced by uncommitted browser checks only (I-14) |

### What "partial" means here, precisely

- **Experience/Education, Credentials, Portfolio** — backend, frontend and database are all complete
  and working. They are 🟡 solely because **no integration test touches them**, and under ADR-002 the
  tests are the substitute for a compiler (L-01). The security-relevant rule among them — that
  `verificationStatus` cannot be forged from the client — is implemented in two independent places
  (Zod schema omission + `pickWritable`) and pinned by neither.
- **Audit logging** — the events are correct and asserted; the *durability* is not, because the write
  is not awaited.
- **SET-01** — every endpoint works; two of them (password change, account deletion) have
  security-relevant side effects with no regression guard.
- **REC-17 / REC-19** — `COMPANY_EDIT` and `COMPANY_SETUP` both render `CompanySetupPage`, so the
  company profile editor is reachable and functional but is not a distinct screen; company-level
  settings exist as SET-02 rather than as a separate REC-19.
- **CAN-11** — save/unsave and the `savedCompanies` collection are built (CAN-06), but no screen
  lists saved companies and no API client fetches them.
- **CAN-12** — the concerns are covered across SET-01 (account) and CAN-04 (visibility); there is no
  separate candidate-settings screen, and none is needed unless the PRD requires the split.
---

## VERIFIED STATE

**Environment:** Windows 11 · Node v22.17.0 · npm 10.2.0 · MongoDB standalone ·
web `:3001` · api `:8081` · database `evallo-recruit`

### Test suites — all passing, **all 20 files in a single run**

Measured 2026-08-10 with one `npm test` (no per-file invocation, no `--test-concurrency=1`):

```
# tests 365   # suites 81   # pass 365   # fail 0   # cancelled 0   # skipped 0   # todo 0
```

| Suite | Cases* | Covers |
|---|--:|---|
| `auth.test.js` | 46 | AUTH-01…05, 10…12, sessions, Google |
| `candidateJourney.test.js` | 41 | CAN-03…09 |
| `recruiterWorkflow.test.js` | 29 | Hiring intents, shortlist, pipeline, notes, company messaging |
| `teamManagement.test.js` | 23 | REC-18 members, roles, removal, ownership |
| `teamInvitations.test.js` | 22 | REC-07 |
| `interestInbox.test.js` | 20 | REC-11 |
| `talentSearch.test.js` | 19 | REC-12 |
| `companySetup.test.js` | 19 | REC-02/03/04/06 wizard steps + publish |
| `candidateViewer.test.js` | 17 | REC-13 + audit |
| `joinRequests.test.js` | 17 | REC-01 join requests + recruiter identity in chat |
| `profileBuilder.test.js` | 17 | CAN-02 **question-bank sections only** |
| `companyProfile.test.js` | 16 | PUB-02 |
| `capabilities.test.js` | 14 | ADR-001 capability derivation |
| `companyDirectory.test.js` | 12 | PUB-01 |
| `candidateHome.test.js` | 11 | CAN-01 |
| `companyDashboard.test.js` | 11 | REC-10 |
| `verification.test.js` | 11 | Email verification |
| `earlyAccess.test.js` | 9 | MKT-01 |
| `home.test.js` | 6 | HOME-01 |
| `health.test.js` | 2 | Ops |

\* Per-suite figures are `test()` declarations counted statically and total **362**; the runner
reports **365** tests across 81 suites. The runner's number is authoritative — the three-case
difference is a counting artefact, not a missing or skipped test (`# skipped 0`, `# todo 0`).

**Not covered by any suite** — recorded as I-13 / I-14, not implied by omission:

| Gap | Consequence |
|---|---|
| `/api/me/candidate-profile/entries/*` (4 endpoints) | The `verificationStatus` forgery guard is unpinned |
| `/api/me/settings/*` (9 endpoints) | Password-change session revocation, export scoping and owner-blocked deletion have no regression guard |
| `apps/api/tests/unit/` | Contains only `.gitkeep` — **no unit tests exist**; all 365 cases are integration tests |
| `apps/web` | **No frontend tests of any kind** |

`npm run lint` — clean across all three workspaces.

### Browser-verified flows
| Flow | Result |
|---|---|
| MKT-01 landing, anchors, early-access form | ✅ |
| PUB-01 directory + filters · PUB-02 profile + interest | ✅ |
| AUTH-01 → 02 → 03 → 04 → 05 → HOME-01, end to end | ✅ |
| Sign in, remember-me, sign out, session revoked | ✅ |
| HOME-01 context switcher → `/c/:slug`, browser back | ✅ |
| Next actions change with account state; nothing auto-created | ✅ |
| Mobile 375px, no horizontal overflow, no console errors | ✅ |
| REC-12 search → REC-13 viewer → shortlist → pipeline → message | ✅ |
| Collapsible rail: collapse persists across navigation and reload, both workspaces | ✅ |
| Rail clears the fixed navbar and its toggle is hit-testable on all 13 workspace routes, expanded and collapsed | ✅ 22/22 |
| No page-level `<nav>` repeats a rail destination; no nav row below the content | ✅ 46/46 |
| Back links sit above the heading, resolve to the right parent, and navigate | ✅ 8/8 |
| Landing page renders on one background colour | ✅ |
| Workspace footers minimal; marketing footer keeps its columns | ✅ |

⚠️ **These browser checks are not committed to the repository.** They were run with
Playwright-driven system Chrome from a scratch directory, so they will not run again for the next
engineer and cannot gate a change. Recorded as I-14.

---

## SCREEN INVENTORY

Derived from PRD Appendix A plus screens defined in §6.3, §7.2, §7.6, and §8.2 that Appendix A
omits. **40 screens total.**

Status key: `⏳ Pending` · `🟡 Partial` · `🔄 In Progress` · `✅ Done` · `🚫 Blocked` · `➖ Post-MVP`

### Marketing
| ID | Screen | PRD | Status |
|---|---|---|---|
| MKT-01 | Marketing landing page | **Not in PRD** — founder-supplied | ✅ |

### Public / anonymous
| ID | Screen | PRD | Status |
|---|---|---|---|
| PUB-01 | Public company directory | §9.1, App. A | ✅ |
| PUB-02 | Public company profile | §7.4, §9.3 | ✅ |

### Authentication
| ID | Screen | PRD | Status |
|---|---|---|---|
| AUTH-01 | Create account (email only) | §6.2 | ✅ |
| AUTH-02 | Verification sent | §6.2 | ✅ |
| AUTH-03 | Set password | §6.2 | ✅ |
| AUTH-04 | Account setup — name | §6.2 | ✅ |
| AUTH-05 | First-action router | §6.2 | ✅ |
| AUTH-10 | Sign in | §6.3 | ✅ |
| AUTH-11 | Forgot password | §6.3 | ✅ |
| AUTH-12 | Reset password | §6.3 | ✅ |
| AUTH-13 | SSO conflict resolution | §6.3 | ⏳ |
| AUTH-14 | Session and context return | §6.3 | ⏳ |

### Universal
| ID | Screen | PRD | Status |
|---|---|---|---|
| HOME-01 | Universal home + context switcher | §5.2, App. A | ✅ |

### Candidate / personal
| ID | Screen | PRD | Status |
|---|---|---|---|
| CAN-01 | Candidate home | §8.2 | ✅ |
| CAN-02 | Profile builder (schema-driven) | §8.3, App. C | ✅ |
| CAN-03 | Profile preview | §8.2, §8.8 | ✅ |
| CAN-04 | Profile visibility settings | §4.3, §8.2 | ✅ |
| CAN-05 | Company discovery | §8.2 | ✅ |
| CAN-06 | Company page (signed in) | §8.2 | ✅ |
| CAN-07 | Interest submission | §8.7 | ✅ |
| CAN-08 | My interests | §8.2 | ✅ |
| CAN-09 | Messages | §8.2, §11.2 | ✅ |
| CAN-10 | Assessments | §8.2 | ➖ Phase 2 |
| CAN-11 | Saved companies | §8.2 | 🟡 |
| CAN-12 | Candidate settings | §8.2 | 🟡 |

### Company / recruiter — setup
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-01 | Create or join company | §7.2 | ✅ |
| REC-02 | Company basics | §7.2 | ✅ |
| REC-03 | Brand and overview | §7.2 | ✅ |
| REC-04 | Education footprint | §7.2 | ✅ |
| REC-05 | Hiring intent | §7.2, §7.5 | ✅ |
| REC-06 | Preview and publish | §7.2 | ✅ |
| REC-07 | Invite team | §7.2 | ✅ |

### Company / recruiter — workspace
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-10 | Company home | §7.6 | ✅ |
| REC-11 | Interest inbox | §7.6 | ✅ |
| REC-12 | Talent search | §7.6, §7.7, §10 | ✅ |
| REC-13 | Candidate profile viewer | §7.6, §8.8 | ✅ |
| REC-14 | Pipeline | §7.6, §7.9 | ✅ |
| REC-15 | Messages | §7.6, §11.2 | ✅ |
| REC-16 | Hiring intents | §7.6 | ✅ |
| REC-17 | Company profile editor | §7.6 | 🟡 |
| REC-18 | Team and permissions | §7.6, §4.2 | 🔄 |
| REC-19 | Recruiter settings | §7.6 | 🟡 |

**REC-18 is partial.** The member list, role changes, removal and ownership transfer are built
and behind `member:manage`; per-member permission overrides, hiring-manager intent assignment,
and suspend/reactivate are not. Its screen shipped early, alongside REC-07, because REC-07 creates
members and nothing could then manage them.

### Settings
| ID | Screen | PRD | Status |
|---|---|---|---|
| SET-01 | Account settings | App. A | ✅ |
| SET-02 | Company settings | App. A | ✅ |

---

## MILESTONES

| # | Milestone | Scope | Status |
|---|---|---|---|
| **M0** | Foundation | Docs, monorepo scaffold, DB connection, shared package, error/validation plumbing | ✅ |
| **M-M** | Marketing | MKT-01, shared UI primitives, `earlyAccessRequests` | ✅ (prerender deferred) |
| **M1** | Identity | AUTH-01 → AUTH-14, session management, HOME-01 | 🔄 AUTH-13/14 remain |
| **M2** | Company presence | REC-01 → REC-07, PUB-01, PUB-02, SEO Stage 1 | ✅ all seven REC screens + PUB-01/02; SEO Stage 1 shipped, prerender deferred |
| **M3** | Candidate identity | CAN-01 → CAN-04, question bank, evidence, visibility | 🔄 CAN-01…04, question bank v6, and 4 of 5 evidence collections done; **references** remain (Phase 2) |
| **M4** | Marketplace loop | CAN-05 → CAN-08, REC-11, interest + consent + access grants | ✅ complete |
| **M5** | Recruiting workflow | REC-12 → REC-16, search, pipeline, messaging | ✅ REC-12…16 + CAN-09 all built; audit shipped early with REC-13 |
| **M6** | Administration & trust | REC-17 → REC-19, SET-01, SET-02, audit, moderation, notifications | 🔄 SET-01, SET-02 and audit done; REC-17/19 partial; **notifications and moderation not built** |

Milestone order follows PRD §2.3's strategic wedge — public company presence precedes
candidate acquisition, which precedes search and workflow. It is deliberately **not** ordered
by technical convenience.

---

## BACKLOG

Maintained in full in `13_BACKLOG.md`. Summary:

**Features remaining** — 9 of 45 screens: AUTH-13, AUTH-14, CAN-10 (post-MVP), CAN-11, CAN-12,
REC-17, REC-18, REC-19 (the last four partial), and moderation/notification surfaces.
**Missing APIs** — notification generation and delivery (§15), a `reports` moderation queue (§16.3),
saved searches (§10.1), and references (§20.3, Phase 2). The recruiter surface and the candidate
evidence layer named here previously are **now built**.
**Missing tests** — profile entries (4 endpoints) and SET-01 (9 endpoints); no unit tests; no
frontend tests. See I-13 / I-14.
**Refactoring** — HOME-01 still calls `POST /api/me/candidate-profile` directly (I-04); the N+1
access resolution in pipeline/messaging lists (I-10); the audit write should be awaited (I-08).
**Bug fixes** — none open. See `12_KNOWN_ISSUES.md`.

---

## TECHNICAL DEBT

| # | Item | Origin | Severity |
|---|---|---|---|
| TD-01 | No compile-time type safety; correctness rests on Zod + JSDoc + tests | ADR-002 | Medium — mitigations mandatory, not optional |
| TD-02 | SEO Stage 1 accepts Google render-queue indexing latency | ADR-004 | Low — has defined exit criteria; **needs a named owner at PUB-02** |
| TD-03 | `QuestionBank` has no admin UI; edited via seed scripts in MVP | ADR-007 | Medium — becomes painful once non-engineers need to edit questions |
| TD-04 | ~~`CandidateProfile.facets` is denormalized and can drift~~ **CORRECTED 2026-08-10 — never built.** No `facets` field and no `refreshCandidateFacets` exist; REC-12 queries the profile's flat fields directly. There is no derived copy and therefore no drift risk | ADR-008 | ~~High~~ **Void** — see `12_KNOWN_ISSUES.md` L-04 |
| TD-07 | Audit writes are fire-and-forget, so a compliance event can be lost silently | REC-13 | **High** — §16.1 treats these as obligations (I-08) |
| TD-08 | Profile entries and SET-01 ship with zero integration coverage | CAN-02 / SET-01 | **High** — under ADR-002 tests are the compiler substitute (I-13) |
| TD-09 | Rate limiter is in-memory and IP-keyed, blocking horizontal scaling and penalising shared NAT | M0 | Medium (I-11) |
| TD-10 | Per-row `resolveCandidateAccess` in list endpoints against a 10-connection pool | REC-14/15 | Medium (I-10) |
| TD-11 | Notification preferences are stored but never consulted | SET-01 | Medium — the UI promises control that does not exist (I-12) |
| TD-05 | Search relevance is weaker than a dedicated engine | ADR-010 | Low — PRD §10.3 discourages implying objective ranking anyway |
| TD-06 | `earlyAccessRequests` has no operator UI and no retention policy | ADR-014 | Medium — personal data held before any account exists |

---

## UNSCHEDULED SCOPE

Deltas from MKT-01 that supersede the PRD per ADR-016, recorded in `03_TRD.md` §15. Each adds at
least one module and one collection. **They do not block MKT-01** — the page can describe them —
but they need a milestone before they are built.

| Delta | Adds | Decision needed |
|---|---|---|
| D-01 Native assessments | `modules/assessments`, item bank, attempts, scoring | MVP or post-MVP? |
| D-02 Video prompt responses | Media pipeline, storage/transcode dependency | MVP or post-MVP? |
| D-03 Job postings | `jobPostings` collection alongside `hiringIntents` | MVP or post-MVP? |
| D-05 Candidate role search | New screen; depends on D-03 | Follows D-03 |
| D-09 Terms + Privacy pages | Content only | **Needed before the MKT-01 form collects data** |

---

## NEXT TASK

> **One task only.**

### ▶ Close the test gap on the two untested endpoint families

**Why this and not a feature.** Every screen through M5 is built and the recruiter loop runs end to
end, but two shipped surfaces have **no integration coverage at all** — the four
`/api/me/candidate-profile/entries/*` endpoints and the nine `/api/me/settings/*` endpoints (I-13).
ADR-002 chose JavaScript and made integration tests the explicit substitute for a compiler (L-01);
these are the two places where that substitute is currently missing, and both contain
security-relevant behaviour:

- `verificationStatus` cannot be forged from the client — implemented twice (schema omission +
  `pickWritable`) and pinned by neither.
- Password change revokes every session; export returns only the caller's own data; deletion is
  refused while the caller still owns a company.

Adding these tests changes no application code, so it cannot regress anything, and it is the
prerequisite for trusting any later refactor of either surface.

**Then, in order:**

1. **`await` the audit writes** on the paths §16.1 names (I-08 / TD-07). Decide explicitly whether a
   failed audit write should fail the request. This is the only remaining correctness gap in a
   feature the PRD treats as a compliance obligation.
2. **Taxonomy enums on `candidateProfiles` arrays** (I-06). A value outside the shared taxonomy is
   accepted on write and then permanently unfindable by that facet.
3. **Compound indexes for the real search match+sort shape** (I-09), validated with `explain()`
   against seeded volume rather than guessed.

**Not blocking, but outstanding:**
- AUTH-13 (SSO conflict resolution) and AUTH-14 (return-path preservation) close out M1.
- Terms + Privacy content (D-09) — the live forms already claim consent to both.
- D-01 / D-02 / D-03 milestone decisions; file storage (D-02) also gates credential upload and
  message attachments (I-15).
- ADR-013 build-time prerender — deferred; MKT-01 ships client-rendered.
- MongoDB replica-set conversion, for transaction support (I-03 / L-06).
- Commit the browser checks as a runnable suite (I-14) — they currently live outside the repository.
