# 14 — Progress Tracker

**Last updated:** 2026-08-03 (compliance pass)
**Current milestone:** M3 — Candidate identity 🔄 **candidate journey complete**
**Overall:** 17 of 41 screens implemented

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

### 🔄 In Progress
**The candidate journey is complete through CAN-09.** Remaining in M1: AUTH-13 (SSO conflict
resolution) and AUTH-14 (return-path preservation). Remaining in M3: the evidence layer
(experience, education, credentials, scores, media, references) — ADR-008 gives each its own
collection, and PRD §20.3 defers reference collection and issuer verification to Phase 2.

**CAN-10 (assessments) is deliberately NOT built.** PRD §20.3 places expanded assessments in
Phase 2 and TRD §15 D-01 records the domain as unscheduled, pending a founder scope decision.
Confirmed by the founder on 2026-08-03.

### ⏳ Pending — immediate
| Item | Blocked by |
|---|---|
| CAN-01 candidate home / CAN-02 profile builder | M3 — the next founder HTML batch |
| REC-01 → REC-07 company setup | M2 |
| SET-01 account settings | Currently a placeholder route reached from HOME-01 |
| Convert MongoDB to a replica set | See 🚫 below |

### 🚫 Blocked
| Item | Blocker | Owner |
|---|---|---|
| **Transactions** | The MongoDB server is standalone, not a replica set. `/api/health` reports `supportsTransactions: false`. Refresh-token rotation works without them but is not atomic. Conversion steps in `08_SETUP_GUIDE.md` §1 — not done automatically because it modifies a system service | Founder |
| **Google sign-in on localhost** | Google returns `403` from `gsi/status` for `http://localhost:3001` unless the origin is registered in the Google Cloud console. Email auth is unaffected | Founder |
| Terms + Privacy content | The live forms already claim consent to both (D-09) | Founder |
| Deployment configuration | Deliberately deferred | Founder |

---

## VERIFIED STATE

**Environment:** Windows 11 · Node v22.17.0 · npm 10.2.0 · MongoDB standalone ·
web `:3001` · api `:8081` · database `evallo-recruit`

### Test suites — all passing, run one file at a time
| Suite | Cases |
|---|---|
| `auth.test.js` | 46 |
| `capabilities.test.js` | 14 |
| `companyProfile.test.js` | 16 |
| `companyDirectory.test.js` | 12 |
| `verification.test.js` | 11 |
| `candidateJourney.test.js` | 41 |
| `companySetup.test.js` | 19 |
| `teamInvitations.test.js` | 22 |
| `teamManagement.test.js` | 23 |
| `companyDashboard.test.js` | 11 |
| `interestInbox.test.js` | 20 |
| `talentSearch.test.js` | 19 |
| `profileBuilder.test.js` | 17 |
| `earlyAccess.test.js` | 9 |
| `home.test.js` | 6 |
| `candidateHome.test.js` | 11 |
| `health.test.js` | 2 |
| **Total** | **299** |

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

---

## SCREEN INVENTORY

Derived from PRD Appendix A plus screens defined in §6.3, §7.2, §7.6, and §8.2 that Appendix A
omits. **40 screens total.**

Status key: `⏳ Pending` · `🔄 In Progress` · `✅ Done` · `🚫 Blocked` · `➖ Post-MVP`

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
| CAN-11 | Saved companies | §8.2 | ⏳ |
| CAN-12 | Candidate settings | §8.2 | ⏳ |

### Company / recruiter — setup
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-01 | Create or join company | §7.2 | ✅ |
| REC-02 | Company basics | §7.2 | ✅ |
| REC-03 | Brand and overview | §7.2 | ⏳ |
| REC-04 | Education footprint | §7.2 | ⏳ |
| REC-05 | Hiring intent | §7.2, §7.5 | ⏳ |
| REC-06 | Preview and publish | §7.2 | ✅ |
| REC-07 | Invite team | §7.2 | ✅ |

### Company / recruiter — workspace
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-10 | Company home | §7.6 | ✅ |
| REC-11 | Interest inbox | §7.6 | ✅ |
| REC-12 | Talent search | §7.6, §7.7, §10 | ✅ |
| REC-13 | Candidate profile viewer | §7.6, §8.8 | ⏳ |
| REC-14 | Pipeline | §7.6, §7.9 | ⏳ |
| REC-15 | Messages | §7.6, §11.2 | ⏳ |
| REC-16 | Hiring intents | §7.6 | ⏳ |
| REC-17 | Company profile editor | §7.6 | ⏳ |
| REC-18 | Team and permissions | §7.6, §4.2 | 🔄 |
| REC-19 | Recruiter settings | §7.6 | ⏳ |

**REC-18 is partial.** The member list, role changes, removal and ownership transfer are built
and behind `member:manage`; per-member permission overrides, hiring-manager intent assignment,
and suspend/reactivate are not. Its screen shipped early, alongside REC-07, because REC-07 creates
members and nothing could then manage them.

### Settings
| ID | Screen | PRD | Status |
|---|---|---|---|
| SET-01 | Account settings | App. A | ⏳ |
| SET-02 | Company settings | App. A | ⏳ |

---

## MILESTONES

| # | Milestone | Scope | Status |
|---|---|---|---|
| **M0** | Foundation | Docs, monorepo scaffold, DB connection, shared package, error/validation plumbing | ✅ |
| **M-M** | Marketing | MKT-01, shared UI primitives, `earlyAccessRequests` | ✅ (prerender deferred) |
| **M1** | Identity | AUTH-01 → AUTH-14, session management, HOME-01 | 🔄 AUTH-13/14 remain |
| **M2** | Company presence | REC-01 → REC-07, PUB-01, PUB-02, SEO Stage 1 | 🔄 REC-01/02/06/07, PUB-01/02 done; REC-03/04/05 remain |
| **M3** | Candidate identity | CAN-01 → CAN-04, question bank, evidence, visibility | 🔄 CAN-01…04 done; evidence layer remains |
| **M4** | Marketplace loop | CAN-05 → CAN-08, REC-11, interest + consent + access grants | 🔄 candidate side + REC-11 done |
| **M5** | Recruiting workflow | REC-12 → REC-16, search, pipeline, messaging | 🔄 REC-12 + CAN-09 done |
| **M6** | Administration & trust | REC-17 → REC-19, SET-01, SET-02, audit, moderation, notifications | ⏳ |

Milestone order follows PRD §2.3's strategic wedge — public company presence precedes
candidate acquisition, which precedes search and workflow. It is deliberately **not** ordered
by technical convenience.

---

## BACKLOG

Maintained in full in `13_BACKLOG.md`. Summary:

**Features remaining** — 24 of 41 screens, all recruiter-side or settings.
**Missing APIs** — the recruiter surface (interest inbox, search, pipeline, company-side
messaging), the candidate evidence layer, and notifications.
**Refactoring** — HOME-01 still creates the candidate profile directly; that action should route
into CAN-02 once it exists.
**Bug fixes** — none open. See `12_KNOWN_ISSUES.md` for accepted limitations.

---

## TECHNICAL DEBT

| # | Item | Origin | Severity |
|---|---|---|---|
| TD-01 | No compile-time type safety; correctness rests on Zod + JSDoc + tests | ADR-002 | Medium — mitigations mandatory, not optional |
| TD-02 | SEO Stage 1 accepts Google render-queue indexing latency | ADR-004 | Low — has defined exit criteria; **needs a named owner at PUB-02** |
| TD-03 | `QuestionBank` has no admin UI; edited via seed scripts in MVP | ADR-007 | Medium — becomes painful once non-engineers need to edit questions |
| TD-04 | `CandidateProfile.facets` is denormalized and can drift from source collections | ADR-008 | **High** — single `refreshCandidateFacets()` path plus tests required |
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

### ▶ Send the next HTML batch

**HOME-01 is complete and PRD-compliant.** Per the agreed workflow the next step is
founder-supplied HTML: HTML → analysis → approval → implementation → integration → testing →
docs → commit.

Two candidates, in PRD milestone order:

1. **REC-01 → REC-07 (company setup, M2)** — follows the strategic wedge in PRD §2.3: company
   presence before candidate acquisition. HOME-01 and AUTH-05 both already route to a company
   creation flow that is currently a modal plus a placeholder `/c/:companySlug`.
2. **CAN-01 / CAN-02 (candidate identity, M3)** — HOME-01's "Start your candidate profile" action
   currently creates the profile inline; CAN-02 is what it should route to.

**Not blocking, but outstanding:**
- AUTH-13 (SSO conflict resolution) and AUTH-14 (return-path preservation) close out M1.
- Terms + Privacy content (D-09) — the live forms already claim consent to both.
- D-01 / D-02 / D-03 milestone decisions.
- ADR-013 build-time prerender — deferred; MKT-01 ships client-rendered.
- MongoDB replica-set conversion, for transaction support.
