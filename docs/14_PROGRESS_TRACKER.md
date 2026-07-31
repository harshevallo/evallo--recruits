# 14 — Progress Tracker

**Last updated:** 2026-07-31
**Current milestone:** M0 — Foundation
**Overall:** 0 of 40 screens implemented

---

## PROJECT STATUS

### ✅ Completed
| Item | Date | Notes |
|---|---|---|
| PRD ingested and analysed | 2026-07-31 | 40 pages, §1–21 + Appendices A–D |
| Stack locked by CTO | 2026-07-31 | MERN + JavaScript. ADR-002 |
| SEO scope locked by CTO | 2026-07-31 | Google only. ADR-004 |
| ADRs 001–012 drafted | 2026-07-31 | `10_DECISION_LOG.md` |
| Project structure defined | 2026-07-31 | `07_PROJECT_STRUCTURE.md` |

### 🔄 In Progress
| Item | Notes |
|---|---|
| Documentation baseline (docs 01–14) | Foundational docs written; API/component guides await first implementation |

### ⏳ Pending — immediate
| Item | Blocked by |
|---|---|
| Monorepo scaffold (`apps/web`, `apps/api`, `packages/shared`) | **CTO approval of architecture** |
| MongoDB connection + health check | Scaffold |
| Auth module (AUTH-01 → AUTH-05) | Scaffold + founder HTML |

### 🚫 Blocked
| Item | Blocker | Owner |
|---|---|---|
| All screen implementation | No HTML prototypes supplied yet | Founder |
| ADR-004 (SEO) sign-off | Awaiting CTO approval — not urgent, needed by PUB-02 | CTO |
| Deployment configuration | Infrastructure deliberately deferred by CTO | CTO |

---

## CURRENT SCREEN

| Field | Value |
|---|---|
| **Name** | — none in progress — |
| **Status** | Awaiting architecture approval and first HTML batch |
| **APIs** | — |
| **Database** | — |
| **Frontend** | — |
| **Backend** | — |
| **Testing** | — |

---

## SCREEN INVENTORY

Derived from PRD Appendix A plus screens defined in §6.3, §7.2, §7.6, and §8.2 that Appendix A
omits. **40 screens total.**

Status key: `⏳ Pending` · `🔄 In Progress` · `✅ Done` · `🚫 Blocked` · `➖ Post-MVP`

### Public / anonymous
| ID | Screen | PRD | Status |
|---|---|---|---|
| PUB-01 | Public company directory | §9.1, App. A | ⏳ |
| PUB-02 | Public company profile | §7.4, §9.3 | ⏳ |

### Authentication
| ID | Screen | PRD | Status |
|---|---|---|---|
| AUTH-01 | Create account (email only) | §6.2 | ⏳ |
| AUTH-02 | Verification sent | §6.2 | ⏳ |
| AUTH-03 | Set password | §6.2 | ⏳ |
| AUTH-04 | Account setup — name | §6.2 | ⏳ |
| AUTH-05 | First-action router | §6.2 | ⏳ |
| AUTH-10 | Sign in | §6.3 | ⏳ |
| AUTH-11 | Forgot password | §6.3 | ⏳ |
| AUTH-12 | Reset password | §6.3 | ⏳ |
| AUTH-13 | SSO conflict resolution | §6.3 | ⏳ |
| AUTH-14 | Session and context return | §6.3 | ⏳ |

### Universal
| ID | Screen | PRD | Status |
|---|---|---|---|
| HOME-01 | Universal home + context switcher | §5.2, App. A | ⏳ |

### Candidate / personal
| ID | Screen | PRD | Status |
|---|---|---|---|
| CAN-01 | Candidate home | §8.2 | ⏳ |
| CAN-02 | Profile builder (schema-driven) | §8.3, App. C | ⏳ |
| CAN-03 | Profile preview | §8.2, §8.8 | ⏳ |
| CAN-04 | Profile visibility settings | §4.3, §8.2 | ⏳ |
| CAN-05 | Company discovery | §8.2 | ⏳ |
| CAN-06 | Company page (signed in) | §8.2 | ⏳ |
| CAN-07 | Interest submission | §8.7 | ⏳ |
| CAN-08 | My interests | §8.2 | ⏳ |
| CAN-09 | Messages | §8.2, §11.2 | ⏳ |
| CAN-10 | Assessments | §8.2 | ➖ Phase 2 |
| CAN-11 | Saved companies | §8.2 | ⏳ |
| CAN-12 | Candidate settings | §8.2 | ⏳ |

### Company / recruiter — setup
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-01 | Create or join company | §7.2 | ⏳ |
| REC-02 | Company basics | §7.2 | ⏳ |
| REC-03 | Brand and overview | §7.2 | ⏳ |
| REC-04 | Education footprint | §7.2 | ⏳ |
| REC-05 | Hiring intent | §7.2, §7.5 | ⏳ |
| REC-06 | Preview and publish | §7.2 | ⏳ |
| REC-07 | Invite team | §7.2 | ⏳ |

### Company / recruiter — workspace
| ID | Screen | PRD | Status |
|---|---|---|---|
| REC-10 | Company home | §7.6 | ⏳ |
| REC-11 | Interest inbox | §7.6 | ⏳ |
| REC-12 | Talent search | §7.6, §7.7, §10 | ⏳ |
| REC-13 | Candidate profile viewer | §7.6, §8.8 | ⏳ |
| REC-14 | Pipeline | §7.6, §7.9 | ⏳ |
| REC-15 | Messages | §7.6, §11.2 | ⏳ |
| REC-16 | Hiring intents | §7.6 | ⏳ |
| REC-17 | Company profile editor | §7.6 | ⏳ |
| REC-18 | Team and permissions | §7.6, §4.2 | ⏳ |
| REC-19 | Recruiter settings | §7.6 | ⏳ |

### Settings
| ID | Screen | PRD | Status |
|---|---|---|---|
| SET-01 | Account settings | App. A | ⏳ |
| SET-02 | Company settings | App. A | ⏳ |

---

## MILESTONES

| # | Milestone | Scope | Status |
|---|---|---|---|
| **M0** | Foundation | Docs, monorepo scaffold, DB connection, shared package, error/validation plumbing | 🔄 |
| **M1** | Identity | AUTH-01 → AUTH-14, session management, HOME-01 | ⏳ |
| **M2** | Company presence | REC-01 → REC-07, PUB-01, PUB-02, SEO Stage 1 | ⏳ |
| **M3** | Candidate identity | CAN-01 → CAN-04, question bank, evidence, visibility | ⏳ |
| **M4** | Marketplace loop | CAN-05 → CAN-08, REC-11, interest + consent + access grants | ⏳ |
| **M5** | Recruiting workflow | REC-12 → REC-16, search, pipeline, messaging | ⏳ |
| **M6** | Administration & trust | REC-17 → REC-19, SET-01, SET-02, audit, moderation, notifications | ⏳ |

Milestone order follows PRD §2.3's strategic wedge — public company presence precedes
candidate acquisition, which precedes search and workflow. It is deliberately **not** ordered
by technical convenience.

---

## BACKLOG

Maintained in full in `13_BACKLOG.md`. Summary:

**Features remaining** — all 40 screens.
**Missing APIs** — all; none built yet.
**Refactoring** — none yet; no code exists.
**UI improvements** — none yet.
**Bug fixes** — none yet.

---

## TECHNICAL DEBT

| # | Item | Origin | Severity |
|---|---|---|---|
| TD-01 | No compile-time type safety; correctness rests on Zod + JSDoc + tests | ADR-002 | Medium — mitigations mandatory, not optional |
| TD-02 | SEO Stage 1 accepts Google render-queue indexing latency | ADR-004 | Low — has defined exit criteria; **needs a named owner at PUB-02** |
| TD-03 | `QuestionBank` has no admin UI; edited via seed scripts in MVP | ADR-007 | Medium — becomes painful once non-engineers need to edit questions |
| TD-04 | `CandidateProfile.facets` is denormalized and can drift from source collections | ADR-008 | **High** — single `refreshCandidateFacets()` path plus tests required |
| TD-05 | Search relevance is weaker than a dedicated engine | ADR-010 | Low — PRD §10.3 discourages implying objective ranking anyway |

---

## NEXT TASK

> **One task only.**

### ▶ Scaffold the monorepo foundation (M0)

**Blocked on:** CTO approval of the architecture in `03_TRD.md`, `07_PROJECT_STRUCTURE.md`,
and ADRs 001–012.

**Scope when unblocked:**
1. npm workspaces root + `apps/web`, `apps/api`, `packages/shared`
2. Vite + React + React Router + Tailwind, configured with the PRD §19.1 design tokens
   (`#0671E0` primary, `#0A0A0B` text)
3. Express app skeleton: config validation, Mongoose connection, `/health`, centralised error
   handler, request validation middleware
4. `packages/shared` seeded with the permission matrix (§4.2), visibility states (§4.3), and
   state-machine constants (§14.2)
5. One end-to-end proof: React → Axios → Express → MongoDB → response rendered

**Explicitly not in scope:** authentication, any screen, any business logic.

**Definition of done:** `npm install && npm run dev` at the repo root starts both apps; the
health check returns a live database status in the browser; `08_SETUP_GUIDE.md` is accurate
enough for a new engineer to reproduce it unaided.
