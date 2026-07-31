# 07 — Project Structure

Explains every folder in the repository, what belongs in it, and — just as importantly —
what does not. If you are new to this project, read this document second, after
`08_SETUP_GUIDE.md`.

> **Status:** This document describes the *target* structure agreed in the ADRs.
> Folders are created as the features that need them are built; see
> `14_PROGRESS_TRACKER.md` for what physically exists today.

---

## 1. Top level

```
evallo-recruit/
├─ apps/
│  ├─ web/                  React client (Vite)
│  └─ api/                  Express server
├─ packages/
│  └─ shared/               Contracts shared by web and api
├─ docs/                    This documentation set (01–14)
├─ prototypes/              Founder-supplied HTML prototypes (reference only, never imported)
├─ package.json             npm workspaces root
└─ README.md
```

Rationale for the monorepo is in **ADR-003**. In short: PRD §12 requires identical validation
rules on client and server, and under ADR-002 (JavaScript, no compiler) duplicated rules drift
silently until runtime.

### `prototypes/`
Raw HTML files supplied by the founder. **Reference material only.** No file in `apps/` ever
imports from here. The workflow is HTML → analysis → React components → API wiring; the HTML
is never served, bundled, or copied verbatim. Kept in the repository so that the intended
visual design remains inspectable after the React version diverges.

---

## 2. `packages/shared`

The single source of truth for anything both sides must agree on. **This is the most important
folder in the repository** — under ADR-002 there is no compiler to catch a mismatch between
client and server, so this package is what prevents drift.

```
packages/shared/
├─ schemas/          Zod schemas — the API contract (ADR-009)
│   ├─ auth.schema.js
│   ├─ candidate.schema.js
│   ├─ company.schema.js
│   ├─ hiringIntent.schema.js
│   ├─ interest.schema.js
│   └─ ...
├─ constants/        Enumerated values — never inline string literals anywhere else
│   ├─ roles.js              Company membership roles (PRD §4.2)
│   ├─ permissions.js        Permission keys
│   ├─ visibility.js         Candidate visibility states (PRD §4.3)
│   ├─ pipelineStages.js     Default pipeline stages (PRD §7.9)
│   └─ states.js             State machines (PRD §14.2)
├─ taxonomy/         Canonical vocabularies (PRD §8.4, §12, Appendix B)
│   ├─ roleFamilies.js
│   ├─ subjects.js
│   ├─ curricula.js
│   ├─ gradeBands.js
│   └─ learnerPopulations.js
├─ permissions/
│   └─ matrix.js             role → permission[] map (PRD §4.2)
├─ utils/            Pure functions safe in both browser and Node
└─ index.js
```

**Rules**
- Plain JavaScript, ESM, **no build step** (ADR-012). Both Vite and Node import it directly.
- Nothing environment-specific. No `window`, no `process.env`, no `fs`, no Mongoose, no Axios.
- Every exported schema carries a JSDoc `@typedef` so editors provide autocomplete — the
  agreed substitute for compile-time types (ADR-002, mitigation 2).
- Adding a value to a taxonomy or state enum happens **here first**, then in the consumers.

---

## 3. `apps/api` — Express server

```
apps/api/
├─ src/
│  ├─ config/            Env loading and validation, app constants
│  ├─ lib/               Cross-cutting infrastructure (no business logic)
│  │   ├─ db.js              Mongoose connection
│  │   ├─ tokens.js          Access/refresh token issue, verify, rotate
│  │   ├─ mailer.js          Transactional email
│  │   ├─ storage.js         File storage + time-limited access URLs (PRD §16.4)
│  │   ├─ logger.js
│  │   └─ ApiError.js        Typed error class used by the error handler
│  ├─ middleware/
│  │   ├─ authenticate.js         Verify access token → req.user
│  │   ├─ resolveCompanyContext.js  companyId → active membership → req.company/req.membership
│  │   ├─ requirePermission.js    Permission check against the matrix (ADR-006)
│  │   ├─ validate.js             Runs a shared Zod schema against the request
│  │   ├─ rateLimit.js
│  │   └─ errorHandler.js         The ONLY place that formats an error response
│  ├─ modules/           One folder per domain (ADR-011)
│  │   ├─ auth/
│  │   ├─ users/
│  │   ├─ candidates/
│  │   ├─ companies/
│  │   ├─ memberships/
│  │   ├─ hiring-intents/
│  │   ├─ interests/
│  │   ├─ pipeline/
│  │   ├─ messaging/
│  │   ├─ evidence/
│  │   ├─ search/
│  │   ├─ notifications/
│  │   ├─ audit/
│  │   └─ public/        Unauthenticated read surface + SEO metadata/sitemap (ADR-004)
│  ├─ app.js             Express app assembly — middleware, routes, error handler
│  └─ server.js          Process entry: connect DB, then listen
└─ tests/
```

### Anatomy of a module

```
modules/interests/
├─ interest.model.js         Mongoose schema + indexes
├─ interest.service.js       ALL business logic
├─ interest.controller.js    HTTP in → service call → HTTP out. Nothing else.
├─ interest.routes.js        Router + middleware chain + validation
└─ interest.validation.js    Request schemas (composed from packages/shared)
```

### Layer rules — these are not stylistic

| Layer | May do | Must never do |
|---|---|---|
| `*.routes.js` | Define paths, attach middleware, bind controller | Contain logic |
| `*.controller.js` | Read `req`, call one service, shape the response | Query the database; contain conditionals about business rules |
| `*.service.js` | Business logic, transactions, call other modules' **services** | Touch `req`/`res`; import another module's **model** |
| `*.model.js` | Schema, indexes, and data-integrity validators | Contain business logic |

**Why the controller/service split is enforced strictly:** interest submission (PRD §8.7)
writes `Interest`, `PipelineEntry`, `AccessGrant`, `Notification`, and `AuditEvent` in one
operation and must be idempotent — PRD §21.5 requires the company receives the interest
*exactly once* even if the user retries or refreshes. That is a transactional service
operation. Placed in a controller it cannot be reused, tested, or made transactional.

**Why modules call services, not models:** a direct model import bypasses the authorization
and audit logic that lives in the owning service. Given PRD §16.1 (all candidate access
auditable), that is a privacy defect, not an style violation.

---

## 4. `apps/web` — React client

```
apps/web/
├─ src/
│  ├─ app/
│  │   ├─ App.jsx              Root component
│  │   ├─ providers.jsx        Composed context providers
│  │   └─ router.jsx           Route tree
│  ├─ routes/
│  │   ├─ public/          ⚠️ SSR-SAFE ZONE — see constraint below
│  │   ├─ auth/            AUTH-01 … AUTH-14
│  │   ├─ personal/        HOME-01, CAN-01 … CAN-12
│  │   ├─ company/         REC-01 … REC-19
│  │   ├─ settings/        SET-01, SET-02
│  │   └─ guards/          RequireAuth, RequireCompany, RequirePermission
│  ├─ pages/               One component per screen; composition only, no logic
│  ├─ components/
│  │   ├─ ui/              Design-system primitives (Button, FloatingLabelInput, Modal …)
│  │   ├─ layout/          AppShell, Sidebar, Navbar, CompanySwitcher
│  │   ├─ public/          Components usable by SSR-safe public routes
│  │   └─ <domain>/        Feature components (candidate/, company/, search/ …)
│  ├─ features/            Per-domain hooks + API bindings + local state
│  ├─ hooks/               Generic reusable hooks
│  ├─ services/
│  │   ├─ apiClient.js     Axios instance, interceptors, 401 → refresh → retry queue
│  │   └─ <domain>.api.js  Thin endpoint wrappers — the ONLY place URLs appear
│  ├─ context/             AuthContext, CompanyContext, ToastContext
│  ├─ utils/
│  ├─ styles/
│  └─ main.jsx
├─ index.html
├─ tailwind.config.js
├─ jsconfig.json           Path aliases for editor support (ADR-002, mitigation 2)
└─ vite.config.js
```

### The `routes/public/` constraint (ADR-004)

Components reachable from `routes/public/` **may import only** from `components/ui/`,
`components/public/`, `packages/shared`, and `services/`. They must **never**:
- read `window`, `document`, `localStorage`, or `navigator` during render;
- consume `AuthContext` or `CompanyContext`;
- assume a logged-in user.

This holds from day one whether or not ADR-004 Stage 2 is ever approved. It costs nothing
now, and it is the difference between "enable SSR" being a config change and being an audit
of every component on the page.

### Where logic goes — and does not

Per the coding rules, **business logic never lives in a UI component.**

| Concern | Belongs in |
|---|---|
| HTTP calls | `services/<domain>.api.js` |
| Data fetching, caching, loading/error state | `features/<domain>/hooks/` |
| Derived values, formatting, sorting | `utils/` or a hook |
| Cross-screen shared state | `context/` |
| Rendering and user events only | `components/`, `pages/` |

A page component should read as a layout: fetch via a hook, render components, hand callbacks
down. If a `.jsx` file contains an `axios` call or a business rule, it is misplaced.

---

## 5. Naming conventions

| Kind | Convention | Example |
|---|---|---|
| React component file | PascalCase | `CandidateCard.jsx` |
| Hook | camelCase, `use` prefix | `useCandidateProfile.js` |
| API binding | `<domain>.api.js` | `interests.api.js` |
| Backend module file | `<domain>.<layer>.js` | `interest.service.js` |
| Zod schema | `<domain>.schema.js` | `candidate.schema.js` |
| Constants | SCREAMING_SNAKE values, camelCase file | `pipelineStages.js` |
| Mongo collections | Plural, camelCase | `candidateProfiles` |

---

## 6. Import boundaries — quick reference

```
✅  apps/web        →  packages/shared
✅  apps/api        →  packages/shared
❌  packages/shared →  apps/*                (shared must stay dependency-free)
❌  apps/web        →  apps/api              (talk over HTTP only)
❌  module A model  ←  module B              (go through A's service — ADR-011)
❌  components/*    →  axios                 (use services/ — see §4)
❌  routes/public/* →  AuthContext           (SSR-safe zone — ADR-004)
```
