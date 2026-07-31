# 10 — Architecture Decision Log (ADR)

Every significant technical decision is recorded here **before** implementation.
Decisions are never silently reversed: a superseded ADR keeps its number, is marked
`Superseded by ADR-XXX`, and the replacement explains what changed and why.

**Status values:** `Proposed` · `Accepted` · `Superseded` · `Rejected`

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](#adr-001) | One global account; candidate & recruiter are capabilities | Accepted | 2026-07-31 |
| [002](#adr-002) | MERN stack in JavaScript (no TypeScript) | Accepted | 2026-07-31 |
| [003](#adr-003) | Single monorepo with npm workspaces | Accepted | 2026-07-31 |
| [004](#adr-004) | SEO: Express-side SSR for public routes only | **Proposed** | 2026-07-31 |
| [005](#adr-005) | Refresh token in httpOnly cookie with rotation + reuse detection | Accepted | 2026-07-31 |
| [006](#adr-006) | Object-level authorization resolved per request from CompanyMembership | Accepted | 2026-07-31 |
| [007](#adr-007) | Question bank as versioned database configuration, not hardcoded UI | Accepted | 2026-07-31 |
| [008](#adr-008) | Candidate profile split across collections, not one document | Accepted | 2026-07-31 |
| [009](#adr-009) | Zod for shared runtime validation across client and server | Accepted | 2026-07-31 |
| [010](#adr-010) | MongoDB-only search behind an internal SearchService boundary | Accepted | 2026-07-31 |
| [011](#adr-011) | Feature-module backend structure, not MVC-by-type | Accepted | 2026-07-31 |
| [012](#adr-012) | ES Modules everywhere | Accepted | 2026-07-31 |

---

<a id="adr-001"></a>
## ADR-001 — One global account; candidate and recruiter are capabilities

**Status:** Accepted · 2026-07-31

### Decision
The `User` document has **no role field**. A person has exactly one account. "Candidate"
means the user owns a `CandidateProfile`. "Recruiter" means the user holds an active
`CompanyMembership`. Both can be true simultaneously.

### Context
PRD §1 (Product rule) and §4 (Account architecture) state this explicitly:

> Candidate and recruiter are capabilities, not exclusive account types.

The initial engineering brief described "two major users: Candidates and Recruiters."
Taken literally as `User.role`, this contradicts the PRD in four places:

| PRD requirement | Fails under a global `User.role` |
|---|---|
| §4.1 — a user may create or join **multiple** companies | Role is per-company, not per-user |
| §5.2 — context switcher shows Personal + every company | No single role can express N contexts |
| §7.10 — recruiter access requires active membership in a *published* company | A `role: recruiter` claim survives company removal |
| §21.6 — recruiter removed from company loses access **immediately** | Impossible if authority lives in a long-lived token |

### Alternatives considered
1. **`User.role` enum** — Simplest to implement; matches the original brief wording.
   Rejected: directly contradicts the PRD and cannot express multi-company membership.
2. **`User.roles[]` array of global roles** — Allows both capabilities.
   Rejected: still cannot scope a role *to a specific company*, which is the actual requirement.
3. **Capability derived from relationships (chosen)** — Authority is computed, never stored on the user.

### Consequences
**Pros**
- Matches the PRD exactly; no reconciliation debt later.
- Revocation is instant and correct — deleting a membership removes access on the next request.
- Supports the multi-company context switcher (§5.2) with no special-casing.

**Cons**
- Every candidate-data request requires a membership lookup. Mitigated by a compound index on
  `{ userId, companyId, status }` and short-lived per-request caching.
- Authorization logic is more involved than an `if (user.role === 'recruiter')` check.

### Impact
Foundational. Determines the `User`, `CompanyMembership`, and `CandidateProfile` schemas,
the JWT payload (ADR-005), the authorization middleware (ADR-006), and the frontend
`CompanyContext`. Reversing this after auth is built would be a rewrite.

---

<a id="adr-002"></a>
## ADR-002 — MERN stack in JavaScript (no TypeScript)

**Status:** Accepted · 2026-07-31 · **Decided by: CTO**

### Decision
```
Frontend   React (Vite) · React Router · Tailwind CSS · Axios · JavaScript
Backend    Node.js · Express.js · JavaScript
Database   MongoDB · Mongoose
```
No TypeScript. No Next.js or alternative frontend framework. No database other than
MongoDB. Any proposal to change the stack requires explicit CTO approval, with
trade-offs documented here first.

### Context
Engineering recommended TypeScript, citing PRD §12 (~200 structured candidate fields
across 12 sections with conditional display rules) and §14.2 (seven state machines).
The CTO selected JavaScript to match company engineering standards.

### Alternatives considered
1. **TypeScript end-to-end** — Compile-time safety across the Mongoose model → API →
   React props chain. Not selected: conflicts with company standards.
2. **TypeScript on `api` + `shared` only** — Types at the trust boundary. Not selected: same reason.
3. **JavaScript everywhere (chosen)** — Consistent with existing company codebases.

### Consequences
**Pros**
- Consistent with company engineering standards and existing team familiarity.
- No build step in `packages/shared`; modules are consumable directly by Vite and Node.
- Faster initial velocity; no type-definition maintenance for Mongoose or Express.

**Cons**
- No compile-time protection during candidate-schema refactors, which PRD §20.2 guarantees
  will recur as role modules expand beyond the five pilot roles.
- Renaming a field cannot be verified mechanically across ~35 screens.

### Mitigations (mandatory, not optional)
Because the compiler is unavailable, these substitute for it and are treated as required:
1. **Zod schemas in `packages/shared`** are the single source of truth for every data
   contract, enforced at runtime on both client and server (ADR-009).
2. **JSDoc `@typedef` blocks** accompany all shared schemas and service signatures. Editors
   surface autocomplete and inline errors from JSDoc with no build step.
3. **Field-name constants** — taxonomy keys, question keys, pipeline stages, and status
   enums are exported constants in `packages/shared`, never inline string literals.
4. **ESLint + integration tests** on every API route; the API contract is verified by test,
   since it cannot be verified by type.

### Impact
Applies to every file in the repository.

---

<a id="adr-003"></a>
## ADR-003 — Single monorepo with npm workspaces

**Status:** Accepted · 2026-07-31

### Decision
```
evallo-recruit/
├─ apps/web      React client
├─ apps/api      Express server
└─ packages/shared   Zod schemas · constants · taxonomy · permission matrix
```
Managed with npm workspaces. No Nx, Turborepo, or Lerna.

### Context
PRD §12 requires identical validation rules on the client (inline errors, §19.1) and the
server (trust boundary). PRD Appendix B defines a filter taxonomy that both the search UI
and the search service must agree on, field for field.

### Alternatives considered
1. **Two separate repositories** — Conventional and simple. Rejected: validation rules and
   taxonomy constants would be duplicated and would drift. In JavaScript (ADR-002) that
   drift is silent until runtime.
2. **Monorepo with Turborepo/Nx** — Better caching and task orchestration. Rejected as
   premature; npm workspaces is sufficient for two apps and one package, and adds no tooling
   to learn or maintain.
3. **npm workspaces (chosen)** — Native to npm, zero additional dependencies.

### Consequences
**Pros** — One source of truth for contracts; atomic cross-cutting commits; a single
`npm install`; one place to check "what does the candidate schema look like."
**Cons** — `apps/web` and `apps/api` deploy from one repository, so the deployment pipeline
must scope builds per app (addressed in `09_DEPLOYMENT_GUIDE.md`).

### Impact
Repository layout, install/build scripts, deployment configuration.

---

<a id="adr-004"></a>
## ADR-004 — SEO: staged approach, Express-side metadata first, SSR only if needed

**Status:** ⚠️ **Proposed — awaiting CTO approval.** Not required until PUB-01/PUB-02 are built.

**CTO constraint (2026-07-31):** *"SEO will be google search engine."* Google is the only
crawler we optimise for. This materially reduces the required work and is reflected below.

### Decision (proposed)

**Stage 1 — ship with PUB-02. Express-side metadata injection. No SSR.**
Express intercepts the public routes, loads the company from MongoDB, and injects into the
HTML shell before responding:
- `<title>` and `<meta name="description">` generated from structured company fields (§17)
- `<link rel="canonical">` pointing at the stable slug
- Open Graph and Twitter card tags for link previews
- `Organization` JSON-LD structured data (§17: Organization data only — **not** `JobPosting`,
  which §17 restricts to sufficiently detailed formal listings, not lightweight hiring intent)
- `robots` directives: `index,follow` on published pages; `noindex` on draft, paused,
  archived, and moderation-restricted pages (§9.3)

Plus two Express-served routes: `/sitemap.xml` (published companies only, removing archived
and restricted pages promptly per §17) and `/robots.txt` (blocking all candidate, search,
message, pipeline, and account surfaces).

The page **body** remains client-rendered React.

**Stage 2 — conditional, not automatic.** Full SSR of the two public routes via
`react-dom/server` + React Router `StaticRouter`, hydrated on the client. **Triggered only if
Stage 1 measurably underperforms** against the exit criteria below.

### Why Stage 1 is now sufficient to start

Googlebot executes JavaScript using an evergreen Chromium renderer, so React-rendered company
content **will** be indexed. The known weaknesses of client rendering against Google are:

| Weakness | Mitigated by Stage 1? |
|---|---|
| Title/description missing from initial HTML | **Yes** — injected server-side, the most reliable source for SERP snippets |
| Structured data not reliably detected | **Yes** — JSON-LD is in the served HTML |
| Rendering deferred to a second indexing pass, delaying indexation | **No** — remains a risk |
| Weaker LCP, a ranking signal (§17 Core Web Vitals) | **Partially** — needs measurement |
| Social crawlers (LinkedIn, WhatsApp, X) never execute JS | **Yes** — OG tags are server-injected |

That last row is worth calling out even though it is not strictly SEO: recruiters and
companies will share their page links directly, and a link with no preview card converts
badly. Stage 1 fixes it regardless of the Google-only scope.

### Exit criteria — when Stage 2 becomes necessary
Escalate to full SSR if, after pilot company pages are live and submitted via Search Console:
1. Pages remain unindexed or show *"Crawled — currently not indexed"* / *"Discovered — currently
   not indexed"* beyond ~2 weeks; or
2. URL Inspection's rendered HTML does not contain the company's main content; or
3. Field LCP on public pages exceeds ~2.5 s and client rendering is the cause.

These are cheap to check and give a factual trigger rather than a guess.

### Why neither stage changes the stack
Per ADR-002 the stack is fixed. Neither stage introduces a new framework:

| Piece | Package | Already in the stack? |
|---|---|---|
| Metadata injection (Stage 1) | `express` | Yes |
| Sitemap / robots (Stage 1) | `express` | Yes |
| `renderToString` (Stage 2) | `react-dom/server` | Yes — ships inside React |
| `StaticRouter` (Stage 2) | `react-router-dom` | Yes — ships inside React Router |
| SSR build (Stage 2) | `vite build --ssr` | Yes — Vite is the chosen bundler |

Next.js *would* have been a stack change and is excluded. This is React and Express doing
what they already support.

### Context
PRD §17 and §20.5 require:
> Critical company content **server-rendered or reliably pre-rendered** for crawlers and sharing previews.

Read strictly, that mandates Stage 2. The Google-only scope narrows it: Google renders JS, so
Stage 1 satisfies the *intent* — discoverable, correctly-titled, structured company pages —
at roughly a tenth of the cost. Per PRD §2.3 these pages are the platform's entire inbound
acquisition wedge, so the requirement cannot be dropped, only sequenced. Staging it with a
measurable trigger is the sequencing.

### Alternatives considered
1. **Full SSR immediately** — Strictly correct against §17 as written; removes all indexing-lag
   and LCP risk. **Not chosen as the starting point:** with Google-only scope it front-loads a
   dual-build, hydration-safety, and SSR-debugging cost on a solo engineer for a benefit that
   may never be measurable during a limited pilot. Retained as Stage 2 with explicit triggers.
2. **Nothing server-side; rely entirely on Googlebot rendering** — Cheapest. **Rejected:** loses
   server-side titles, descriptions, JSON-LD, and all social link previews. The gap between this
   and Stage 1 is roughly one day of work for a large share of the total benefit.
3. **Publish-time prerender cache** — Render each company page to stored HTML on publish/edit;
   Express serves the cache. *Pros:* best possible LCP, no per-request render. *Cons:* needs all
   of Stage 2's machinery **plus** cache invalidation on every company edit. **Deferred as a
   later optimisation on top of Stage 2, not an alternative to it.**
4. **Next.js** — Excluded by ADR-002.
5. **Staged: metadata first, SSR on evidence (chosen).**

### Consequences
**Pros**
- Stage 1 is roughly a day of work and carries no hydration risk whatsoever.
- Fixes social link previews immediately — a conversion win outside the SEO scope.
- Defers the genuinely expensive work until there is evidence it is needed.
- Blast radius stays at 2 screens out of ~35 in either stage.

**Cons**
- Accepts indexing latency from Google's deferred render pass during the pilot.
- Two separate pieces of work instead of one, if Stage 2 is eventually triggered.
- Requires someone to actually monitor Search Console against the exit criteria. **Owner must
  be assigned when PUB-02 ships**, or the trigger is never checked and the decision defaults
  silently to "do nothing."

### Structural constraint — enforced from day one regardless of approval
Public routes live in an isolated route group (`apps/web/src/routes/public/`) whose components
may only import from `components/ui/` and `components/public/`. They must never touch
`AuthContext`, `CompanyContext`, or browser-only APIs during render. **This costs nothing now
and makes Stage 2 a configuration task later rather than an audit of every component.** If this
ADR is rejected outright, the constraint remains harmless.

### Impact
Stage 1: two Express route handlers, a metadata builder, sitemap and robots endpoints. No
frontend impact. Stage 2: `apps/web` Vite config and a second entry point. Neither stage
affects scaffolding, authentication, or any authenticated screen.

---

<a id="adr-005"></a>
## ADR-005 — Refresh token in httpOnly cookie with rotation and reuse detection

**Status:** Accepted · 2026-07-31

### Decision
- **Access token** — JWT, 15-minute expiry, held **in JavaScript memory only**. Never in
  `localStorage`, `sessionStorage`, or a readable cookie. Payload: `{ userId, sessionId, iat, exp }`
  and nothing else.
- **Refresh token** — opaque random value in an `httpOnly; Secure; SameSite=Lax; Path=/api/auth`
  cookie. Stored **hashed** in a `Session` collection. Rotated on every use.
- **Reuse detection** — presenting an already-rotated refresh token revokes the entire
  session family and logs a security audit event.

### Context
PRD §16.4 requires session invalidation, brute-force protection, and suspicious-login
monitoring. PRD §12.4 stores teaching **license numbers**; §16.2 stores **background-check
status**; §12.2 covers safeguarding and minors-adjacent data. The blast radius of token
theft here is a reportable data incident, not an inconvenience.

### Alternatives considered
1. **Both tokens in `localStorage`** — Simplest; the common tutorial pattern. **Rejected:**
   any XSS — including one from a third-party dependency — exfiltrates a long-lived
   credential granting access to candidate PII. Unacceptable for this data class.
2. **Long-lived access token, no refresh token** — Fewer moving parts. **Rejected:** cannot
   satisfy §21.6 ("recruiter removed from company → immediate loss of access") or §16.4
   session invalidation.
3. **Server-side sessions only, no JWT** — Simple revocation. Rejected: the CTO specified
   JWT + refresh tokens. The chosen design keeps JWTs while retaining server-side revocation
   via the `Session` collection.
4. **httpOnly rotating refresh + in-memory access (chosen).**

### Consequences
**Pros** — XSS cannot read the refresh token. Revocation is immediate. Reuse detection
surfaces token theft. Satisfies §16.4.
**Cons** — Requires CORS `credentials: true` and an exact origin allowlist. An Axios
response interceptor must handle 401 → refresh → retry, including request queueing to avoid
a refresh stampede. A page refresh needs a silent-refresh call on boot.

### Impact
`modules/auth`, the `Session` collection, Axios interceptor configuration, CORS setup,
`AuthContext` bootstrap.

---

<a id="adr-006"></a>
## ADR-006 — Object-level authorization resolved per request

**Status:** Accepted · 2026-07-31

### Decision
Authorization is a three-layer check on every candidate-data request. Roles are **never**
carried in the JWT.

```
1. authenticate            valid session → req.user
2. resolveCompanyContext   companyId from URL/header → load active CompanyMembership
                           → req.company, req.membership     (fails closed)
3. requirePermission(p)    membership.role grants p?         (PRD §4.2 matrix)
4. candidate visibility    the CANDIDATE's rules permit THIS company?  (PRD §4.3, §7.10)
```

Layer 4 runs **before ranking and before result assembly**, never as a post-filter.

### Context
PRD §16.4 requires "role-based **and object-level** authorization on every company,
candidate, evidence, message, and pipeline action." Layer 4 is candidate-controlled and has
no analogue in conventional RBAC: a candidate's `draft`/`private`/`discoverable`/`paused`
state (§4.3), explicit per-company access grants, and company blocks all constrain access
independently of the recruiter's role. PRD §10.1 is explicit that privacy filtering precedes
ranking.

### Alternatives considered
1. **Roles in the JWT** — One token read, no database lookup. **Rejected:** violates §21.6.
   A removed recruiter would retain access until token expiry.
2. **RBAC only, visibility applied in the UI** — **Rejected:** trivially bypassed via the API
   and would leak candidate data through JSON responses (§21.2: "Candidate data never appears
   in public company HTML, public APIs, sitemaps, or unauthenticated responses").
3. **Post-filtering search results after ranking** — **Rejected:** leaks existence and counts,
   breaks pagination, and contradicts §10.1.
4. **Four-layer per-request resolution (chosen).**

### Consequences
**Pros** — Correct and immediate revocation; single enforcement point; auditable (§14.3).
**Cons** — A membership lookup per request (mitigated by a compound index and request-scoped
caching). Visibility predicates must be composed into the Mongo query itself rather than
applied afterward, which makes the search query builder the most security-critical code in
the system and requires dedicated tests.

### Impact
All middleware; every company-scoped route; `modules/search`; `modules/candidates`;
the permission matrix in `packages/shared`.

---

<a id="adr-007"></a>
## ADR-007 — Question bank as versioned database configuration

**Status:** Accepted · 2026-07-31

### Decision
Candidate profile questions — core (§12.1–12.5) and role-specific (§12.6) — are stored as
**versioned configuration documents in MongoDB**, not hardcoded in React components.
The CAN-02 profile builder is a **generic schema-driven renderer**.

Answers are stored structurally as `{ questionKey, value, bankVersion }` and projected into
a denormalized `CandidateProfile.facets` subdocument, which is the shape talent search queries.

### Context
PRD §12.6 defines role-specific question banks for 12+ educator role families. PRD §20.2
says to fully optimize five pilot roles and support generic modules for the rest, implying
continuous expansion. PRD Appendix C defines conditional display rules (core-first, role
modules with duplicate merging, evidence-triggered prompts, experience conditionality,
location conditionality).

Hardcoding means every new role — and every reworded question — is a full-stack deploy.

### Alternatives considered
1. **Hardcoded per-role React forms** — Direct, easy to read. **Rejected:** 12+ near-duplicate
   forms, no duplicate-question merging (Appendix C), and unbounded UI growth.
2. **JSON config files in the repo** — Better; still requires a deploy per change and gives
   no versioning of answers already collected.
3. **Versioned DB configuration (chosen)** — Adding a role becomes a configuration change.

### Consequences
**Pros** — New roles ship without a frontend deploy. Appendix C display rules live in one
evaluator. Answers remain interpretable after question wording changes, via `bankVersion`.
Directly enables §21.3 ("dynamically shows role-relevant questions while retaining a common core").
**Cons** — The renderer is the most complex component in the app and must support every field
type. A projection step is needed to keep `facets` in sync with answers. Requires an internal
tool (or seed scripts) to edit the bank — an accepted MVP limitation, tracked in the backlog.

### Impact
`QuestionBank` and `CandidateAnswer` collections; CAN-02 profile builder; the search facet
projection; taxonomy constants in `packages/shared`.

---

<a id="adr-008"></a>
## ADR-008 — Candidate profile split across collections

**Status:** Accepted · 2026-07-31

### Decision
`CandidateProfile` holds core identity, preferences, visibility state, and the denormalized
`facets` used by search. Repeating evidence entities live in **separate collections**:
`Experience`, `Education`, `Credential`, `EvidenceItem`, `Reference`, `CandidateAnswer`.

### Context
PRD §8.6 gives every evidence item its own visibility control, verification lifecycle
(`unverified → pending → verified/rejected → expired`, §14.2), and access logging (§16.1).
PRD §21.3 requires candidates to add *multiple* experience, education, credential, score,
document, reference, and video entries, with videos explicitly unlimited.

### Alternatives considered
1. **One embedded document** — Single-read profile fetch. **Rejected:** not the 16 MB limit —
   the real problems are (a) concurrent partial saves during a long builder session
   (Appendix C: "every answer persists immediately"), (b) per-item verification state
   transitions rewriting the whole document, and (c) per-item access logging having no stable
   document identity to reference.
2. **Fully normalized, nothing denormalized** — Cleanest model. **Rejected:** talent search
   (§10) would require `$lookup` across six collections per query, and §10.1 requires the
   first result page to return quickly.
3. **Split collections + denormalized search facets (chosen)** — Hybrid.

### Consequences
**Pros** — Atomic per-item writes; per-item visibility and verification; stable IDs for audit;
search reads one collection.
**Cons** — `facets` must be recomputed whenever a source entity changes. This is a genuine
consistency risk and is handled by a single `refreshCandidateFacets(candidateId)` service
called from every mutating path — never inline. Profile assembly for the recruiter viewer
(REC-13) requires a parallel multi-collection read.

### Impact
All candidate collections; `modules/candidates`; `modules/search`; CAN-02, CAN-03, REC-13.

---

<a id="adr-009"></a>
## ADR-009 — Zod for shared runtime validation

**Status:** Accepted · 2026-07-31

### Decision
Every data contract is defined once as a Zod schema in `packages/shared/schemas/` and used
by both the React forms and the Express validation middleware.

### Context
ADR-002 removes compile-time type checking, so runtime validation carries the full weight of
data integrity. PRD §19.1 requires inline, specific, accessible, non-layout-shifting
validation messages; PRD §16.4 requires the server to trust nothing from the client. Writing
these rules twice guarantees divergence.

### Alternatives considered
1. **Joi / express-validator on the server, manual checks on the client** — Conventional MERN.
   **Rejected:** two rule sets, guaranteed drift, and client rules cannot be reused server-side.
2. **Mongoose schema validation only** — Runs too late (at write time), produces poor error
   messages, and is unavailable to the client.
3. **Zod in `packages/shared` (chosen)** — Isomorphic, precise error shapes, composable.

### Consequences
**Pros** — One rule, two enforcement points. Error objects map directly to form field errors.
Composable schemas suit the modular candidate profile. Works in plain JavaScript.
**Cons** — A dependency in both apps. Mongoose schemas and Zod schemas describe overlapping
shapes and must be kept aligned — Zod governs the **API boundary**, Mongoose governs
**persistence**; where they disagree, Zod is authoritative and the mismatch is a bug.

### Impact
`packages/shared`; all API routes; all forms.

---

<a id="adr-010"></a>
## ADR-010 — MongoDB-only search behind an internal SearchService boundary

**Status:** Accepted · 2026-07-31 · **Constraint set by CTO**

### Decision
MongoDB is the sole data store and the sole search engine. No Elasticsearch, OpenSearch,
Typesense, or any secondary index. Talent search (§10, Appendix B) is implemented with:
- **MongoDB Atlas Search** (`$search` + `$searchMeta` facets) when deployed on Atlas;
- **aggregation pipelines** (`$match` + `$facet`) with supporting compound indexes otherwise.

All query construction is confined to `modules/search/search.service.js`. No other module
builds search queries. This is an **internal code boundary for testability and swappability
of the MongoDB query strategy** — not an abstraction for replacing MongoDB.

### Context
CTO directive: MongoDB is the source of truth for all application data; do not introduce
another database or search store; use Atlas Search if the deployment uses Atlas. PRD §10.1
requires composable facets, OR-within-facet / AND-between-facet boolean logic, result
explanations, and fast first-page returns. PRD §20.5 lists deployment specifics as still open.

### Alternatives considered
1. **Dedicated search engine** — Excluded by CTO directive.
2. **Atlas Search hardcoded throughout** — Best facet support, but couples every call site to a
   deployment choice the CTO has explicitly deferred. Rejected on sequencing grounds.
3. **MongoDB-only behind a single service module (chosen)** — Lets us build search now and
   switch between the aggregation and Atlas Search strategies when infrastructure is decided,
   without touching controllers or the frontend.

### Consequences
**Pros** — One datastore to operate, back up, and secure. No index-sync consistency class of
bug. Deployment decision stays open without blocking development.
**Cons** — Facet counts over large result sets are more expensive than in a dedicated engine.
Relevance ranking is weaker than BM25-tuned alternatives — acceptable, since §10.3 warns
against implying objective quality ranking anyway. Compound index design becomes critical and
is tracked in `05_DATABASE_SCHEMA.md`.

### Impact
`modules/search`; `CandidateProfile.facets` design (ADR-008); index strategy; REC-12.

---

<a id="adr-011"></a>
## ADR-011 — Feature-module backend structure

**Status:** Accepted · 2026-07-31

### Decision
`apps/api/src/modules/<domain>/` colocates `*.routes.js`, `*.controller.js`, `*.service.js`,
`*.model.js`, and `*.validation.js` per domain. Not `controllers/`, `models/`, `routes/`
folders split by file type.

Business logic lives **only** in `*.service.js`. Controllers map HTTP to service calls and
nothing else.

### Context
PRD §14.1 defines ten core objects and the system spans thirteen domains. Type-split folders
mean a single feature change touches four distant directories, and `controllers/` grows to
thirteen unrelated files.

The decisive case: interest submission (§8.7) writes `Interest`, `PipelineEntry`,
`AccessGrant`, `Notification`, and `AuditEvent` in one operation and must be **idempotent**
(§21.5: "Company receives interest exactly once even if the user retries or refreshes").
That is a transactional service operation. It cannot correctly live in a controller.

### Alternatives considered
1. **MVC-by-type** — Familiar Express convention. Rejected at this domain count.
2. **Feature modules (chosen)** — Each domain is self-contained and independently testable.

### Consequences
**Pros** — Changes are local. Onboarding is by domain, not by file type. Services are testable
without HTTP. Cross-module boundaries are explicit (service-to-service, never model-to-model).
**Cons** — Requires discipline: modules must call each other's **services**, never import
another module's Mongoose model directly. Enforced in code review and documented in
`07_PROJECT_STRUCTURE.md`.

### Impact
Entire `apps/api` layout.

---

<a id="adr-012"></a>
## ADR-012 — ES Modules everywhere

**Status:** Accepted · 2026-07-31

### Decision
`"type": "module"` in all three workspace packages. `import`/`export` throughout, including
the Express server. No CommonJS, no Babel, no build step for `apps/api` or `packages/shared`.

### Context
Vite is ESM-native. For `packages/shared` to be imported by both the React client and the
Express server **without a dual build**, one module system must work in both. Under ADR-002
(no TypeScript) there is no compiler to emit dual output.

### Alternatives considered
1. **CommonJS API + ESM web** — Traditional Express style. **Rejected:** `packages/shared`
   would need dual builds or a bundler, adding exactly the toolchain complexity ADR-002 avoids.
2. **Transpile shared with Babel** — Rejected: build step, source maps, added dependencies.
3. **ESM everywhere (chosen)** — Fully supported in modern Node.

### Consequences
**Pros** — `packages/shared` is consumed as-is by both apps. One module system. Top-level
`await` available for database connection at boot.
**Cons** — Requires Node 18+. `__dirname` and `require` are unavailable and need
`import.meta.url` equivalents. A small number of older CommonJS-only packages need
`createRequire` interop — noted in `12_KNOWN_ISSUES.md` if encountered.

### Impact
All `package.json` files; Node version requirement in `08_SETUP_GUIDE.md`.
