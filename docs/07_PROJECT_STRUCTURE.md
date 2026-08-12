# 07 — Project Structure

**Status:** Approved and in use. Folders marked deferred in §11 are created as their milestone arrives.
**Version:** 2.2 · 2026-08-03 · Supersedes v2.1

This is the complete folder design for Evallo Recruit — built to carry all 41 known screens plus
the unscheduled scope in `03_TRD.md` §15, not just the screens delivered so far.

Read this second, after `08_SETUP_GUIDE.md`.

**Creation policy:** folders are created when the milestone that needs them arrives. Every folder
below carries a milestone tag. §11 lists what stays empty and until when. Creating all of it on
day one produces a repository that looks finished and is mostly hollow — worse for a new engineer
than a small tree that grows.

---

## 1. Root

```
evallo-recruit/
├─ apps/
│  ├─ web/                    React client (Vite)
│  └─ api/                    Express server
├─ packages/
│  └─ shared/                 Contracts shared by web and api
├─ docs/                      01–14 documentation set
├─ prototypes/                Founder HTML — reference only, never imported
├─ .github/workflows/         CI (M0+)
├─ .editorconfig
├─ .gitignore
├─ .nvmrc                     Pins Node 18+ (ADR-012)
├─ eslint.config.js           One config, all workspaces
├─ package.json               npm workspaces root
└─ README.md
```

| Folder | Purpose |
|---|---|
| `apps/` | Deployable units. Each builds and runs independently |
| `packages/` | Non-deployable code imported by apps |
| `docs/` | Documentation. A first-class deliverable, not a byproduct |
| `prototypes/` | Founder-supplied HTML. **Never imported, bundled, or served.** Kept so the source design stays inspectable after the React version diverges. Per ADR-016 these are the newest requirement source, which is exactly why they are retained rather than deleted after conversion |

**Why a monorepo (ADR-003).** PRD §12 requires identical validation on client and server. Under
ADR-002 there is no compiler, so duplicated rules drift silently until runtime. One package, one
rule, both sides.

**Why npm workspaces and not Nx/Turborepo.** Two apps and one package. Turborepo's caching solves
a problem this repository does not have, and adds tooling a solo engineer must maintain.

---

## 2. `packages/shared` — the contract layer

**The most important folder in the repository.** Under ADR-002 there is no compiler to catch a
mismatch between server and client. This package is what prevents it.

```
packages/shared/
├─ src/
│  ├─ schemas/                Zod — the API contract (ADR-009)
│  │  ├─ common.schema.js       id · email · url · pagination · location · money
│  │  ├─ auth.schema.js         M1
│  │  ├─ user.schema.js         M1
│  │  ├─ company.schema.js      M2
│  │  ├─ hiringIntent.schema.js M2
│  │  ├─ membership.schema.js   M2
│  │  ├─ candidate.schema.js    M3
│  │  ├─ evidence.schema.js     M3
│  │  ├─ questionBank.schema.js M3
│  │  ├─ interest.schema.js     M4
│  │  ├─ pipeline.schema.js     M5
│  │  ├─ message.schema.js      M5
│  │  ├─ search.schema.js       M5
│  │  ├─ earlyAccess.schema.js  M-M
│  │  └─ index.js
│  ├─ constants/              Enumerated values — never inline literals elsewhere
│  │  ├─ roles.js               owner · admin · recruiter · hiring_manager · viewer
│  │  ├─ permissions.js         permission keys (PRD §4.2)
│  │  ├─ visibility.js          draft · private · discoverable · paused · archived
│  │  ├─ pipelineStages.js      PRD §7.9
│  │  ├─ states.js              all 7 state machines (PRD §14.2)
│  │  ├─ errorCodes.js          shared by API responses and client error handling
│  │  ├─ notificationTypes.js
│  │  ├─ auditActions.js
│  │  └─ index.js
│  ├─ taxonomy/               Canonical vocabularies (PRD §8.4, §12, App. B)
│  │  ├─ roleFamilies.js        8 families, ~60 roles
│  │  ├─ subjects.js
│  │  ├─ tests.js
│  │  ├─ curricula.js
│  │  ├─ gradeBands.js
│  │  ├─ learnerPopulations.js
│  │  ├─ teachingFormats.js
│  │  ├─ employmentTypes.js
│  │  ├─ deliveryModes.js
│  │  ├─ organizationTypes.js
│  │  ├─ languages.js
│  │  └─ index.js
│  ├─ permissions/
│  │  ├─ matrix.js              role → permission[] (PRD §4.2)
│  │  └─ can.js                 pure resolver: can(membership, permission)
│  ├─ policies/
│  │  └─ candidateVisibility.js pure predicates (PRD §4.3, §7.10)
│  ├─ utils/                  Pure. Browser- and Node-safe
│  │  ├─ slug.js · dates.js · strings.js · format.js
│  └─ index.js
└─ package.json
```

### Why `permissions/can.js` is shared, not duplicated
The backend enforces permissions in `requirePermission` middleware; the frontend uses the same
answer to decide whether to render a button or a route guard. **Two implementations of the same
rule guarantee a UI that offers actions the API rejects.** One pure function, imported by both.
The server remains the only *enforcement* point — the client copy is purely for display.

### Why `policies/candidateVisibility.js` is separate from `permissions/`
Two different questions, often confused:
- **Permission** — "may this recruiter view candidates?" (role-based, company-scoped)
- **Visibility** — "does *this candidate* permit *this company*?" (candidate-controlled)

PRD §4.3 and §7.10 make the second independent of the first. Keeping them in separate files stops
them being conflated in the code, which is the failure mode that leaks candidate data.

### Rules
- Plain JavaScript, ESM, **no build step** (ADR-012). Vite and Node both import it directly.
- **No environment-specific code.** No `window`, `process.env`, `fs`, Mongoose, or Axios.
- Every schema carries a JSDoc `@typedef` — the agreed substitute for compile-time types.
- New taxonomy or state values land **here first**, then in consumers.

---

## 3. `apps/api` — Express server

```
apps/api/
├─ src/
│  ├─ config/
│  │  ├─ env.js               Validates ALL env vars at boot; exits on missing
│  │  ├─ constants.js         Server tunables — TTLs, limits, page sizes
│  │  └─ index.js
│  ├─ lib/                    Infrastructure adapters. NO business logic
│  │  ├─ db.js                Mongoose connection + graceful shutdown
│  │  ├─ logger.js            Structured logging (PRD §19 Observability)
│  │  ├─ ApiError.js          Typed error the handler understands
│  │  ├─ asyncHandler.js      Async route wrapper
│  │  ├─ response.js          Envelope builders — the ONE response shape
│  │  ├─ paginate.js          Cursor + offset helpers
│  │  ├─ tokens.js            Access/refresh issue · verify · rotate
│  │  ├─ password.js          bcrypt wrapper
│  │  ├─ crypto.js            Token hashing, random generation
│  │  ├─ mailer/
│  │  │  ├─ index.js          Provider-agnostic send()
│  │  │  ├─ providers/        One file per provider (§14 Q3 open)
│  │  │  └─ templates/        Verification · reset · invitation · interest
│  │  └─ storage/
│  │     ├─ index.js          put · get · signedUrl · delete
│  │     └─ providers/        One file per provider (§14 Q2 open)
│  ├─ middleware/
│  │  ├─ requestContext.js    requestId, correlation, timing
│  │  ├─ security.js          helmet · cors · mongo-sanitize · body limits
│  │  ├─ rateLimit.js         Per-IP and per-account limiters
│  │  ├─ authenticate.js      Access token → req.user
│  │  ├─ requireVerifiedEmail.js
│  │  ├─ resolveCompanyContext.js  companyId → active membership
│  │  ├─ requirePermission.js Uses shared matrix + can()
│  │  ├─ validate.js          Runs a shared Zod schema against the request
│  │  ├─ notFound.js
│  │  └─ errorHandler.js      The ONLY place an error response is formatted
│  ├─ modules/                One folder per domain (ADR-011)
│  ├─ jobs/                   Background work. Started by server.js, never by app.js
│  ├─ seeds/                  Taxonomy + question bank seeding
│  ├─ routes.js               Single mount point for every module router
│  ├─ app.js                  Express assembly: middleware → routes → errors
│  └─ server.js               Connect DB, start jobs, then listen. Nothing else
├─ tests/
│  ├─ integration/            Route-level, real DB
│  ├─ unit/                   Services and pure logic
│  └─ helpers/                Factories, auth helpers, DB setup
└─ package.json
```

### 3.1 Module list

| Module | Owns | Milestone |
|---|---|---|
| `auth/` | Sign-up, verification, password, sessions, SSO linking | M1 |
| `users/` | Personal profile, account settings, deletion | M1 |
| `sessions/` | Refresh rotation, reuse detection, revocation | M1 |
| `companies/` | Company entity, publish lifecycle, revisions | M2 |
| `memberships/` | Membership, invitations, roles, ownership transfer | M2 |
| `hiring-intents/` | Lightweight hiring declarations | M2 |
| `public/` | Unauthenticated read surface, SEO, early access | M-M / M2 |
| `candidates/` | Profile, facets, visibility, answers | M3 |
| `question-bank/` | Versioned question configuration (ADR-007) | M3 |
| `evidence/` | Experience, education, credentials, media, references | M3 |
| `interests/` | Expression of interest, consent, access grants | M4 |
| `search/` | Talent search, facets, saved searches | M5 |
| `pipeline/` | Stages, assignment, notes, outcomes | M5 |
| `messaging/` | Conversations, messages, attachments | M5 |
| `notifications/` | Delivery, preferences, digests | M6 |
| `audit/` | Append-only audit events | M3+ |
| `moderation/` | Reports, blocks, appeals | M6 |
| `analytics/` | Event taxonomy, company summaries | M6 |
| `assessments/` | **Unscheduled** — TRD §15 D-01 | TBD |

### 3.2 Standard module anatomy

```
modules/interests/
├─ interest.model.js          Mongoose schema + indexes
├─ interest.service.js        ALL business logic
├─ interest.controller.js     HTTP in → one service call → HTTP out
├─ interest.routes.js         Router + middleware chain + validation
└─ interest.validation.js     Request schemas composed from packages/shared
```

**Layer rules — enforcement, not style:**

| Layer | May | Must never |
|---|---|---|
| `routes` | Define paths, attach middleware, bind controller | Contain logic |
| `controller` | Read `req`, call **one** service, shape response | Query the DB; hold business rules |
| `service` | Business logic, transactions, call other modules' **services** | Touch `req`/`res`; import another module's **model** |
| `model` | Schema, indexes, integrity validators | Hold business logic |

**Why the controller/service split is strict.** Interest submission (PRD §8.7) writes `Interest`,
`PipelineEntry`, `AccessGrant`, `Notification`, and `AuditEvent` in one transaction and must be
idempotent (§21.5: the company receives it *exactly once* even if the user refreshes). In a
controller that logic is untestable, unreusable, and cannot be made transactional.

**Why modules call services, not models.** A direct model import bypasses the owning service's
authorization and audit logging. Given PRD §16.1 requires all candidate access to be auditable,
that is a privacy defect, not a style violation.

### 3.3 Two modules that deviate

**`modules/search/`** — ADR-010 requires all query construction confined here, with a swappable
MongoDB strategy:

```
modules/search/
├─ search.routes.js · search.controller.js · search.validation.js
├─ search.service.js              Orchestration only
├─ savedSearch.model.js
└─ query/
   ├─ visibilityFilter.js         ⚠ MOST SECURITY-CRITICAL FILE IN THE PROJECT
   ├─ facetBuilder.js
   ├─ sortBuilder.js
   ├─ matchExplainer.js           PRD §7.8 "why this candidate matched"
   └─ strategies/
      ├─ aggregation.strategy.js  $match + $facet — works anywhere
      └─ atlasSearch.strategy.js  $search + $searchMeta — Atlas only
```

`visibilityFilter.js` composes candidate visibility predicates **into the query itself**. PRD
§10.1 requires filtering before ranking; post-filtering leaks existence through result counts and
breaks pagination. Isolating it in one file makes it independently testable — mandatory coverage
per `13_BACKLOG.md` T-03.

The two strategies exist because MongoDB hosting is deliberately undecided (§14 Q1). Both
implement one interface; `search.service.js` selects by config. **No other file changes** when
hosting is settled.

**`modules/public/`** — the unauthenticated surface, and a hard security boundary:

```
modules/public/
├─ public.routes.js · public.controller.js · public.validation.js
├─ earlyAccess.service.js
├─ earlyAccessRequest.model.js
├─ companyPublic.service.js       Published-company projections ONLY
└─ seo/
   ├─ metadata.js                 title · description · canonical · OG
   ├─ structuredData.js           Organization + WebSite JSON-LD
   ├─ sitemap.js                  Published companies only
   └─ robots.js                   Blocks candidate/search/message/account routes
```

**This module may never import a candidate collection.** PRD §21.2: *"Candidate data never appears
in public company HTML, public APIs, sitemaps, or unauthenticated responses."* Making it a
separate module turns that from a rule someone must remember into a boundary visible in the
import list.

---

## 4. `apps/web` — React client

```
apps/web/
├─ public/                    Served verbatim: favicon, og images, robots fallback
├─ scripts/
│  └─ prerender.js            Build-time prerender of MKT-01 (ADR-013)
├─ src/
│  ├─ main.jsx                Client entry
│  ├─ entry-server.jsx        Prerender/SSR entry (ADR-013 / ADR-004 Stage 2)
│  ├─ App.jsx
│  ├─ app/
│  │  └─ providers.jsx        Composed context providers
│  ├─ router/
│  │  ├─ index.jsx            Route tree
│  │  ├─ paths.js             EVERY path string — single source of truth
│  │  ├─ ScrollToTop.jsx
│  │  ├─ ScrollToHash.jsx     React Router does not do this natively
│  │  └─ guards/
│  │     ├─ RequireAuth.jsx
│  │     ├─ RequireCompany.jsx
│  │     ├─ RequirePermission.jsx
│  │     └─ RedirectIfAuthenticated.jsx
│  ├─ layouts/
│  │  ├─ MarketingLayout.jsx      MKT-01
│  │  ├─ PublicLayout.jsx         PUB-01, PUB-02 — SSR-safe
│  │  ├─ AuthLayout.jsx           AUTH-*  centred single-task (PRD §19.1)
│  │  ├─ PersonalLayout.jsx       HOME-01, CAN-*
│  │  ├─ CompanyLayout.jsx        REC-*  sidebar + company switcher
│  │  └─ partials/
│  │     ├─ AppNavbar.jsx · AppSidebar.jsx
│  │     ├─ CompanySwitcher.jsx · UserMenu.jsx
│  │     ├─ MarketingNavbar.jsx · MarketingFooter.jsx
│  │     └─ NotificationBell.jsx
│  ├─ pages/                  ONE file per screen. Composition only
│  │  ├─ marketing/MarketingPage.jsx
│  │  ├─ public/              CompanyDirectoryPage · CompanyProfilePage
│  │  ├─ legal/               TermsPage · PrivacyPage        (TRD §15 D-09)
│  │  ├─ auth/                AUTH-01 … AUTH-14
│  │  ├─ home/                HOME-01
│  │  ├─ candidate/           CAN-01 … CAN-12
│  │  ├─ company/             REC-01 … REC-19
│  │  ├─ settings/            SET-01, SET-02
│  │  └─ errors/              NotFound · Forbidden · ServerError
│  ├─ features/               Domain logic — hooks, components, utils
│  │  ├─ marketing/ auth/ candidate/ company/ hiring/
│  │  ├─ interests/ search/ pipeline/ messaging/ notifications/
│  ├─ components/             Presentational. No data fetching
│  │  ├─ ui/                  Design system primitives
│  │  ├─ form/                FormField · FormError · FormActions · FormSection
│  │  ├─ feedback/            Toast · EmptyState · Skeleton · ErrorBoundary · StatusRegion
│  │  ├─ data/                DataTable · Pagination · FilterPanel · SortControl
│  │  └─ public/              SSR-safe shared components
│  ├─ context/
│  │  ├─ AuthContext.jsx      Session + current user
│  │  ├─ CompanyContext.jsx   Active company + membership
│  │  └─ ToastContext.jsx
│  ├─ services/               HTTP transport + endpoint bindings
│  │  ├─ apiClient.js         Configured Axios instance
│  │  ├─ interceptors/
│  │  │  ├─ auth.interceptor.js   401 → refresh → retry, with queueing
│  │  │  └─ error.interceptor.js  Envelope → typed client error
│  │  ├─ auth.api.js · users.api.js · companies.api.js
│  │  ├─ candidates.api.js · interests.api.js · search.api.js
│  │  ├─ pipeline.api.js · messaging.api.js · public.api.js
│  │  └─ index.js
│  ├─ hooks/                  Generic, domain-free
│  │  ├─ useZodForm.js        Binds a shared schema to a form
│  │  ├─ useDebounce.js · useMediaQuery.js · useOnClickOutside.js
│  │  ├─ useFocusTrap.js · useReducedMotion.js · useLocalStorage.js
│  ├─ utils/                  Web-only pure helpers
│  ├─ constants/              Web-only: breakpoints, nav config, UI copy
│  ├─ styles/                 index.css, Tailwind layers, fonts
│  └─ assets/                 Imported and processed by Vite
├─ index.html
├─ jsconfig.json              Path aliases for editor support
├─ tailwind.config.js
├─ postcss.config.js
└─ vite.config.js
```

### 4.1 `pages/` vs `features/` vs `components/`

The distinction that keeps this from turning into a 200-file `components/` folder:

| Layer | Answers | Contains | Reusable |
|---|---|---|---|
| `pages/` | "What is at this URL?" | Layout choice, feature composition | Never |
| `features/` | "How does this domain work?" | Hooks, API calls, domain components | Within its domain |
| `components/` | "How does this look?" | Presentational primitives | Everywhere |

A page component should read as an outline: pick a layout, call a feature hook, render feature
components. If a page contains an `axios` call or a business rule, it is misplaced.

### 4.2 Feature folder anatomy

```
features/candidate/
├─ hooks/                     useCandidateProfile · useProfileBuilder · useVisibility
├─ components/                ProfileSectionNav · CompletenessBar · EvidenceCard
├─ utils/                     completeness.js · answerProjection.js
└─ index.js                   Public surface of the feature
```

Features **import from `services/`, never Axios directly.**

### 4.3 Why `services/` holds every endpoint, rather than colocating in features

Colocating an API module inside each feature is the more modern convention. Centralising was
chosen deliberately: with one engineer and ~60 endpoints, having a single directory where every
URL, method, and payload shape lives makes the client-server contract auditable at a glance — the
frontend mirror of the backend's single `routes.js`. Domain logic still lives in the feature; only
the transport binding is central.

**Revisit if a second frontend engineer joins** — at that point merge-conflict pressure on
`services/` starts to outweigh the auditability benefit.

### 4.4 Why `router/paths.js` exists

Every route string in one file. Under ADR-002 a mistyped path is a runtime 404 that no tool
catches. ADR-015 already moves HOME-01 from `/` to `/home`; with paths centralised that is a
one-line change instead of a search across the codebase.

### 4.5 The `routes/public` SSR-safe constraint

Components reachable from `pages/marketing/`, `pages/public/`, and `pages/legal/` may import
**only** from `components/ui/`, `components/form/`, `components/public/`, `packages/shared`, and
`services/`. They must never read `window`/`document`/`localStorage` during render, and never
consume `AuthContext` or `CompanyContext`.

This holds regardless of whether ADR-004 Stage 2 is ever approved. It costs nothing now and makes
enabling SSR a config change rather than an audit of every component.

---

## 5. Where every concern lives

| Concern | Location |
|---|---|
| **API services** | `web/src/services/*.api.js` + `apiClient.js` |
| **Hooks** | Generic: `web/src/hooks/` · Domain: `web/src/features/<d>/hooks/` |
| **Context** | `web/src/context/` — only `Auth`, `Company`, `Toast` |
| **Assets** | Processed: `web/src/assets/` · Verbatim: `web/public/` |
| **Layouts** | `web/src/layouts/` + `layouts/partials/` |
| **Routes** | Frontend: `web/src/router/` · Backend: `api/src/routes.js` + `modules/*/**.routes.js` |
| **Utilities** | Cross-tier pure: `shared/src/utils/` · Web-only: `web/src/utils/` · Server-only: `api/src/lib/` |
| **Constants** | Cross-tier: `shared/src/constants/` · Web-only: `web/src/constants/` · Server tunables: `api/src/config/constants.js` |
| **Validation** | Schemas: `shared/src/schemas/` · Server enforcement: `api/src/middleware/validate.js` · Client binding: `web/src/hooks/useZodForm.js` |
| **Shared UI** | `web/src/components/ui/` |
| **Forms** | Primitives: `components/form/` · Domain forms: `features/<d>/components/` · Rules: `shared/src/schemas/` |
| **Mongo models** | `api/src/modules/<domain>/<domain>.model.js` — colocated, never a global `models/` |
| **Controllers** | `api/src/modules/<domain>/<domain>.controller.js` |
| **Services** | `api/src/modules/<domain>/<domain>.service.js` |
| **Middleware** | `api/src/middleware/` |
| **Config** | `api/src/config/` · `web/vite.config.js` + `tailwind.config.js` |
| **Permissions** | Matrix + resolver: `shared/src/permissions/` · Enforced: `api/src/middleware/requirePermission.js` · Displayed: `web/src/router/guards/` |
| **Search** | `api/src/modules/search/` (+ `query/`) · `web/src/features/search/` |
| **Authentication** | `api/src/modules/auth/` + `sessions/` + `middleware/authenticate.js` · `web/src/features/auth/` + `context/AuthContext.jsx` + `services/interceptors/auth.interceptor.js` |
| **Company** | `api/src/modules/companies/` + `memberships/` + `hiring-intents/` · `web/src/features/company/` + `context/CompanyContext.jsx` |
| **Candidate** | `api/src/modules/candidates/` + `evidence/` + `question-bank/` · `web/src/features/candidate/` |
| **Messaging** | `api/src/modules/messaging/` · `web/src/features/messaging/` |
| **Notifications** | `api/src/modules/notifications/` · `web/src/features/notifications/` |
| **Audit** | `api/src/modules/audit/` — written by services only |
| **Logging** | Server: `api/src/lib/logger.js` + `middleware/requestContext.js` · Client: `components/feedback/ErrorBoundary.jsx` |

---

## 6. Naming conventions

| Kind | Convention | Example |
|---|---|---|
| React component | PascalCase `.jsx` | `CandidateCard.jsx` |
| Hook | camelCase, `use` prefix | `useCandidateProfile.js` |
| Frontend API binding | `<domain>.api.js` | `interests.api.js` |
| Backend module file | `<domain>.<layer>.js` | `interest.service.js` |
| Zod schema | `<domain>.schema.js` | `candidate.schema.js` |
| Constants file | camelCase file, SCREAMING_SNAKE values | `pipelineStages.js` |
| Mongo collection | plural camelCase | `candidateProfiles` |
| Route path constant | SCREAMING_SNAKE in `paths.js` | `COMPANY_SEARCH` |

---

## 7. Import boundaries

```
✅  apps/web             →  packages/shared
✅  apps/api             →  packages/shared
✅  pages/               →  layouts/ · features/ · components/
✅  features/            →  services/ · components/ · hooks/ · packages/shared
✅  components/          →  components/ · hooks/ · packages/shared

❌  packages/shared      →  apps/*                shared stays dependency-free
❌  apps/web             →  apps/api              HTTP only
❌  components/          →  features/ · context/  primitives receive props
❌  components/          →  axios                 use services/
❌  pages/marketing|public|legal → AuthContext    SSR-safe zone
❌  module A             →  module B's model      go through B's service
❌  modules/public       →  any candidate model   PRD §21.2 — hard boundary
❌  controller           →  Mongoose model        go through the service
```

The last three are security boundaries, not preferences. Treat a violation as a defect in review.

---

## 8. Why the backend is feature modules, not MVC-by-type

`controllers/` + `models/` + `routes/` is the conventional Express layout and works to roughly
five domains. This project has nineteen.

| | MVC-by-type | Feature modules |
|---|---|---|
| Files touched to change one feature | 4, in 4 distant folders | 4, in one folder |
| `controllers/` at completion | 19 unrelated files | n/a |
| Onboarding a new engineer | "read all of `services/`" | "read `modules/interests/`" |
| Extracting a service later | Untangle from three shared folders | Move one folder |

The cost is discipline: modules must call each other's **services**, never import another module's
model. That rule is what preserves the boundary.

---

## 9. Why only three React contexts

State separates into three kinds, and only one is genuinely global:

| Kind | Handled by | Share of the app |
|---|---|---|
| Server state | Feature hooks | ~90% |
| Global client state | `AuthContext`, `CompanyContext` | ~5% |
| Local UI state | `useState` in the component | ~5% |

Most state here is data owned by MongoDB needing fetch/cache/invalidate — not global mutation. A
Redux store would become a hand-written cache with manual invalidation, which is where this class
of bug lives. Only session and active company are truly global, and both change rarely.

**Revisit trigger:** if request waterfalls or duplicate fetches become measurable, add a
server-state library (TanStack Query) — not a global store. That needs a new ADR.

---

## 10. Testing layout

```
apps/api/tests/
├─ integration/     Route-level with a real database
├─ unit/            Services and pure logic
└─ helpers/         Factories, auth helpers, DB lifecycle
```

Under ADR-002 tests substitute for the compiler, so they are mandatory rather than aspirational.
Three areas carry required coverage:

1. **Every API route** — an integration test is the only verification of the contract (T-02).
   **Not currently met:** the four profile-entry endpoints and the nine SET-01 settings endpoints
   have no test (`12_KNOWN_ISSUES.md` I-13).
2. **Candidate data exposure** — concentrated in `candidates/candidateAccess.service.js`
   (`resolveCandidateAccess`), which every recruiter-facing path calls. There is no
   `search/query/visibilityFilter.js`; the visibility filter is
   `searchableCandidateFilter()` inside `modules/search/search.service.js`.
3. ~~**`refreshCandidateFacets()`**~~ — **does not exist.** The denormalized facets design was never
   implemented, so there is no facet-refresh path to cover (TD-04 void; see `12_KNOWN_ISSUES.md` L-04).

Frontend tests are colocated as `*.test.jsx` beside their component, added from M1.
**Not currently met:** `apps/web` contains no test files, and `apps/api/tests/unit/` is empty (I-14).

---

## 11. Folders that stay empty until later

Created only when their milestone arrives.

| Folder | Empty until | Why deferred |
|---|---|---|
| `api/src/modules/candidates/` | **built** | Profile, builder, visibility, and interest services (CAN-01…08) |
| `api/src/modules/question-bank/` | **built** | Versioned bank model, definition, and resolution service (ADR-007) |
| `api/src/modules/messaging/` | **built, both sides** | `conversations` + `messages`, the candidate service (CAN-09) and `companyMessaging.service.js` (REC-15) over the same rows |
| ~~`api/src/modules/evidence/`~~ | **built inside `modules/candidates/`** | The evidence layer shipped as `profileEntry.{model,service,controller,validation}.js` rather than its own module: one route family serves all four collections (`experiences`, `educationEntries`, `credentials`, `evidenceItems`), so a separate module would have added a boundary with nothing on the other side of it. `references` is still unbuilt (PRD §20.3, Phase 2) |
| `api/src/modules/interests/` | **built** | `expressionsOfInterest` + `accessGrants` (CAN-07/08); the recruiter inbox is REC-11 |
| `api/src/modules/search/` `pipeline/` | **built** | REC-12 search (ADR-010: all query construction confined here) and REC-14 pipeline + `savedCandidates`. Search queries the profile's flat fields — the `facets` subdocument this document once anticipated was never built |
| `api/src/modules/notifications/` `moderation/` `analytics/` | **M6 — still empty** | Cross-cutting; premature before the events exist. SET-01 stores notification *preferences* on `users`, but nothing generates or delivers a notification, and reports are recorded on the conversation rather than in a queue |
| `api/src/modules/assessments/` | **Unscheduled** | TRD §15 D-01 — awaiting a scope decision |
| `api/src/modules/audit/` | **built** | `auditEvents`, `recordAuditEvent()`, `auditContext(req)`, `listCompanyAuditEvents()` — shipped with REC-13 |
| `api/src/modules/notes/` | **built** | Internal recruiter notes, a separate collection from `messages` by design (§11.2) |
| `api/src/modules/settings/` | **built** | SET-01 account settings service and controller |
| `api/src/modules/memberships/` | **built** | Company join requests (`joinRequest.*`); membership rows themselves live in `modules/companies` |
| `api/src/jobs/` | **built 2026-08-12** | `jobRunner.js` (single-flight, error-isolated, unref'd timers, off under `NODE_ENV=test`), `accountDeletion.job.js` (reports the `deletion_pending` queue; purges nothing — I-17), `index.js` registry. Started from `server.js` after the database connects, **never** from `createApp()`, so importing the app in a test does not start timers. Digests (PRD §15.1) are the next consumer |
| ~~`api/src/lib/mailer/`~~ | **built as `api/src/lib/email/`** | `EmailService` + `templates/` + `transports/{console,smtp}`. Q3 resolved: nodemailer, SendGrid over SMTP in production |
| `api/src/lib/storage/providers/` | **still empty** | Provider undecided (§14 Q2). Consequence: no upload endpoint anywhere — credential documents and portfolio media are links, and `messages.attachments` is reserved and always empty (`12_KNOWN_ISSUES.md` I-15) |
| `web/src/components/data/` | **M5** | Tables, filters, and pagination have no consumer before talent search |
| `web/src/features/{search,pipeline,messaging,notifications}/` | **M5–M6** | Mirror their backend modules |
| `web/src/pages/candidate/` | **built** | CAN-01…09 |
| `web/src/pages/{company,settings}/` | **M2–M6** | Await their HTML. `/settings` and `/c/:companySlug` resolve to `PlaceholderPage` so no shipped page has a dead link |
| `web/src/entry-server.jsx` | **M-M** | Arrives with the ADR-013 prerender step |
| `web/src/pages/legal/` | **Before the MKT-01 form ships** | TRD §15 D-09 — the form already claims consent to these |

**Created at M0 even though nearly empty:** `packages/shared/*`, `api/src/config`, `api/src/lib`,
`api/src/middleware`, `web/src/components/ui`, `web/src/services`, `web/src/router`. These carry
the conventions every later folder copies — establishing them early is what keeps the structure
consistent as it grows.
