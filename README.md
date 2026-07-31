# Evallo Recruit

Education-specialized talent discovery, candidate profiles, and company recruiting.

> **Project status: architecture defined, awaiting approval to scaffold.**
> No application code exists yet. See [`docs/14_PROGRESS_TRACKER.md`](docs/14_PROGRESS_TRACKER.md).

---

## What this is

A recruitment platform for the education sector. Education businesses publish public,
Google-indexable company pages and declare lightweight hiring intent — **without writing formal
job descriptions**. Educators build one structured professional profile with a real evidence
layer: credentials, verified scores, teaching samples, curriculum experience, and outcomes.
Recruiters search that private candidate network with education-specific filters and progress
people through a lightweight pipeline.

It is deliberately **not** a generic job board and **not** an enterprise ATS.

### The one thing to understand first

There are no "candidate accounts" and "recruiter accounts."

**Every person has one global account.** Candidate and recruiter are *capabilities*: you have a
candidate profile, and/or you hold membership in one or more companies. A single user can be
both, simultaneously, and belong to several companies at once.

This shapes the entire data model, the authorization system, and the routing. If you read only
one document before touching code, read [ADR-001](docs/10_DECISION_LOG.md#adr-001).

---

## Stack

| Layer | Technology |
|---|---|
| Client | React (Vite) · React Router · Tailwind CSS · Axios · JavaScript |
| Server | Node.js 18+ · Express.js · ESM |
| Database | MongoDB · Mongoose |
| Auth | JWT access token (memory) + rotating refresh token (httpOnly cookie) |
| Validation | Zod, shared between client and server |

Fixed by the CTO — see [ADR-002](docs/10_DECISION_LOG.md#adr-002). No TypeScript, no Next.js,
no second database. Changing any of it requires a new ADR and explicit approval.

---

## Repository layout

```
evallo-recruit/
├─ apps/web         React client
├─ apps/api         Express server
├─ packages/shared  Zod schemas · taxonomy · permission matrix
├─ docs/            Documentation (01–14)
└─ prototypes/      Founder HTML prototypes — reference only, never imported
```

Full detail: [`docs/07_PROJECT_STRUCTURE.md`](docs/07_PROJECT_STRUCTURE.md)

---

## Getting started

Setup, environment variables, and troubleshooting:
[`docs/08_SETUP_GUIDE.md`](docs/08_SETUP_GUIDE.md)

One thing worth knowing before you start: **run MongoDB as a single-node replica set, not
standalone.** Four operations depend on transactions, and a standalone `mongod` silently doesn't
support them — so those paths behave differently locally than in production.

---

## Documentation

Documentation is a **first-class deliverable**. Code is not complete until the related documents
are updated in the same commit.

| Doc | Contents |
|---|---|
| [01_BRD](docs/01_BRD.md) | Vision, personas, journeys, goals, metrics, constraints |
| [02_PRD](docs/02_PRD.md) | User stories, acceptance criteria, edge cases, permissions |
| [03_TRD](docs/03_TRD.md) | Architecture, routing, auth, API conventions, security |
| [04_API](docs/04_API_DOCUMENTATION.md) | Every endpoint |
| [05_DATABASE](docs/05_DATABASE_SCHEMA.md) | Collections, indexes, constraints, transactions |
| [06_COMPONENTS](docs/06_COMPONENT_GUIDE.md) | Every React component |
| [07_STRUCTURE](docs/07_PROJECT_STRUCTURE.md) | Folder guide and import boundaries |
| [08_SETUP](docs/08_SETUP_GUIDE.md) | Install, run, troubleshoot |
| [09_DEPLOYMENT](docs/09_DEPLOYMENT_GUIDE.md) | Deployment constraints and checklist |
| [10_DECISIONS](docs/10_DECISION_LOG.md) | **ADRs — read this to understand *why*** |
| [11_CHANGELOG](docs/11_CHANGELOG.md) | What changed, when |
| [12_KNOWN_ISSUES](docs/12_KNOWN_ISSUES.md) | Bugs and accepted limitations |
| [13_BACKLOG](docs/13_BACKLOG.md) | Deferred work and ideas |
| [14_PROGRESS](docs/14_PROGRESS_TRACKER.md) | **Current status and next task** |

Product source of truth: `Evallo_Recruit_PRD_v1.pdf` (40 pp.). Where the docs and the PDF
disagree on product intent, the PDF wins and the doc is stale.

### If you are joining this project

Read in this order: this README → [ADR-001](docs/10_DECISION_LOG.md#adr-001) →
[03_TRD](docs/03_TRD.md) → [07_PROJECT_STRUCTURE](docs/07_PROJECT_STRUCTURE.md) →
[14_PROGRESS_TRACKER](docs/14_PROGRESS_TRACKER.md). That should take about two hours and leave
you able to make a change safely.

---

## Non-negotiable rules

These exist because violating them causes privacy defects, not style complaints.

1. **No `role` field on `User`.** Authority comes from `CompanyMembership`, resolved per request.
2. **Candidate data never reaches an unauthenticated response** — not in public HTML, public
   APIs, or sitemaps.
3. **Candidate visibility is filtered inside the database query, before ranking** — never
   post-filtered.
4. **Internal recruiter notes live in a separate collection from messages**, so exposure is
   structurally impossible rather than one serialisation bug away.
5. **Business logic lives in services and hooks**, never in UI components.
6. **Modules call other modules' services, never their models** — models bypass authorization
   and audit logging.
7. **Documentation updates ship in the same commit as the code.**
