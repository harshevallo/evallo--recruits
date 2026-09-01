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
| [013](#adr-013) | Marketing site lives inside `apps/web`, prerendered at build time | **Proposed** | 2026-07-31 |
| [014](#adr-014) | Early-access capture is a lead record, not account creation | **Proposed** | 2026-07-31 |
| [015](#adr-015) | `/` is the marketing page; HOME-01 moves to `/home` | **Proposed** | 2026-07-31 |
| [016](#adr-016) | Founder HTML supersedes the PRD as the newer requirement source | Accepted | 2026-07-31 |
| [017](#adr-017) | In-house authentication; no external identity provider | Accepted | 2026-08-01 |
| [018](#adr-018) | `onboardingCompletedAt` — a timestamp, not a role | Accepted | 2026-08-02 |
| [019](#adr-019) | Candidate share links — a revocable secret, not a public profile | **Proposed** | 2026-08-21 |
| [020](#adr-020) | Profile photos: bytes in MongoDB now, object storage later | **Proposed** | 2026-08-26 |
| [021](#adr-021) | One company profile component, rendered by every surface | Accepted | 2026-08-27 |
| [022](#adr-022) | A role gets its own page; consent gets no second implementation | Accepted | 2026-08-27 |
| [023](#adr-023) | The approved HTML is a design reference, not a data contract | Accepted | 2026-08-27 |
| [024](#adr-024) | A conversation is between two people, not a candidate and a company | **Proposed** | 2026-09-01 |

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

### Implementation note — added 2026-08-10 (the decision stands; one half of it was not built)

**Built as decided:** the split collections. `experiences`, `educationEntries`, `credentials` and
`evidenceItems` each exist with their own `visibility` and `verificationStatus`, served by one route
family (`/api/me/candidate-profile/entries/:kind`). Per-item state is exactly what embedding could not
give, and REC-13 does assemble the profile with parallel multi-collection reads. `references` remains
unbuilt (PRD §20.3, Phase 2).

**Not built:** the denormalized search facets. There is no `facets` subdocument on
`candidateProfiles` and no `refreshCandidateFacets()`. REC-12 shipped querying the profile's own flat
fields and `$lookup`-ing `users` for country, language and region.

The "Cons" above therefore do not apply — with no derived copy there is nothing to recompute and no
consistency risk. Two different gaps replace it: the flat fields carry no taxonomy enum (I-06), and no
index covers the real match+sort shape (I-09). This ADR is left as the record of what was decided;
`05_DATABASE_SCHEMA.md` §8 documents what exists.

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

---

<a id="adr-013"></a>
## ADR-013 — Marketing site lives inside `apps/web`, prerendered at build time

**Status:** ⚠️ **Proposed** · 2026-07-31 · Triggered by `evallo_recruit_marketing.html`

### Decision (proposed)
The marketing landing page (**MKT-01**) is a React route inside `apps/web/src/routes/public/`,
not a separate site or CMS. Because its content is **entirely static** — no per-request database
reads — it is rendered to HTML **at build time** by a prerender step using
`react-dom/server`'s `renderToString`, and the result written into the built `index.html`.

### Context
The founder supplied a marketing landing page that is not in PRD Appendix A. It is the root URL
and therefore the single most SEO-critical page in the product, ahead of company pages.

It differs from PUB-01/PUB-02 in one decisive way: **it has no dynamic data.** Company pages need
per-request database reads, which is why ADR-004 proposed runtime metadata injection for them.
The marketing page needs nothing at request time, so the far cheaper option is available.

### Alternatives considered
1. **Separate marketing site (Webflow, Framer, static generator)** — Lets non-engineers iterate
   without a deploy, and keeps marketing churn out of the app repo. **Rejected for now:** the
   design system, `Button`, `Logo`, `Footer`, and form primitives would be duplicated and drift.
   With one engineer there is no marketing team to unblock, so the main benefit does not apply.
   **Revisit if a marketing hire joins** — at that point the calculus genuinely inverts.
2. **React route, client-rendered only** — Simplest. **Rejected:** the root URL served as an empty
   `<div id="root">` is the worst possible case for the product's primary SEO and LCP target, and
   it also breaks social link previews for the homepage.
3. **React route with runtime SSR (ADR-004 Stage 2 machinery)** — Correct but wasteful: it pays a
   per-request render cost forever for content that never changes between deploys.
4. **React route, prerendered at build time (chosen)** — Crawlers and users receive complete HTML
   with zero runtime cost.

### Relationship to ADR-004
This **refines** ADR-004 rather than replacing it. The two are complementary:

| Page type | Data | Strategy |
|---|---|---|
| MKT-01 marketing | None — static | **Build-time prerender** (this ADR) |
| PUB-01 / PUB-02 company | Per-request from MongoDB | Runtime metadata injection, SSR if triggered (ADR-004) |

Both use `react-dom/server`, already part of React. Neither changes the stack (ADR-002).

### Consequences
**Pros**
- Full HTML on first byte for the highest-value SEO page, at zero runtime cost.
- One design system, one `Button`, one `Footer` — no duplication.
- Removes MKT-01 entirely from the ADR-004 indexing-latency risk (L-02).
- The prerender script is a natural stepping stone to ADR-004 Stage 2 if it is ever triggered.

**Cons**
- Adds a build step to `apps/web`; the prerendered route must stay free of browser-only APIs
  during render, which the `routes/public/` constraint already enforces.
- Content changes require an engineer and a deploy. Acceptable at one engineer; **this is the
  cost that flips the decision if a marketing function is ever hired.**

### Impact
`apps/web` build config; one prerender script; `routes/public/`. No backend impact.

---

<a id="adr-014"></a>
## ADR-014 — Early-access capture is a lead record, not account creation

**Status:** ⚠️ **Proposed** · 2026-07-31

### Decision (proposed)
The marketing page's "Request Early Access" form writes to a new `earlyAccessRequests`
collection. It **does not** create a `User`, does not send a verification link, and does not begin
the AUTH-01 sign-up flow. Onboarding from the waitlist is operator-initiated.

### Context
The form collects **segment ("I am a…"), name, and email**. PRD §6.2 and §21.1 are explicit about
what the sign-up screen may ask:

> The sign-up page does **not** ask candidate/recruiter role, company information, detailed
> profile information, or password.

If this form triggered sign-up, the product would violate its own acceptance criterion at the
very first touchpoint — the "I am a…" selector is precisely the role question AUTH-01 forbids.

The two surfaces also serve different purposes. PRD §20 describes a pilot with a **limited,
selected** set of businesses and candidates: *"onboarding a select group."* A waitlist that
operators triage and invite matches that; open self-service signup does not.

### Alternatives considered
1. **Form triggers AUTH-01 sign-up** — One flow, fewer moving parts. **Rejected:** violates
   PRD §21.1, and turns a curated pilot into open registration.
2. **Drop the segment field and treat it as sign-up** — Preserves one flow and satisfies §21.1.
   **Rejected:** segment is genuinely useful marketing data, and it costs nothing to keep it on a
   lead record where it is harmless. On a `User` it would be actively harmful (ADR-001).
3. **Separate lead collection (chosen)** — Keeps marketing capture and identity strictly apart.

### Consequences
**Pros**
- AUTH-01 stays PRD-compliant; the sign-up screen never learns about roles.
- Matches the curated pilot model in PRD §20.
- `segment` is captured without any risk of becoming a user role (ADR-001).
- Marketing funnel analytics (PRD §18.1 Acquisition) are cleanly separable from account funnels.

**Cons**
- Two paths to becoming a user: waitlist→invite, and direct sign-up once open. Both must work.
- Operators need a way to review the list. **No admin UI exists in MVP** — triage happens against
  the database directly. Tracked as a limitation.
- Personal data is collected before an account exists, so deletion, export, and **retention**
  obligations apply from day one (PRD §16.1). A retention policy is required before pilot launch.

### Impact
New `earlyAccessRequests` collection; one public endpoint; `modules/public`.

---

<a id="adr-015"></a>
## ADR-015 — `/` is the marketing page; HOME-01 moves to `/home`

**Status:** ⚠️ **Proposed** · 2026-07-31

### Decision (proposed)
`/` serves MKT-01 (public marketing). HOME-01, the authenticated universal home, moves to
`/home`. An authenticated user landing on `/` is **not** redirected — they see the marketing page
with the navigation CTAs swapped to "Go to dashboard".

### Context
`03_TRD.md` §4.1 originally assigned `/` to HOME-01, following PRD Appendix A, which has no
marketing page. The supplied HTML claims `/`. Both cannot have it.

### Alternatives considered
1. **Redirect authenticated users from `/` to `/home`** — Common pattern; gets users to their
   workspace fast. **Rejected:** it makes the homepage unreachable for logged-in users, which
   breaks sharing the marketing link with a colleague, blocks the team from reviewing their own
   landing page while signed in, and — the deciding factor — **a redirect on the prerendered root
   URL risks Googlebot encountering redirect behaviour on the most SEO-critical page.**
2. **Marketing at `/welcome`, HOME-01 stays at `/`** — Preserves the TRD. **Rejected:** the
   marketing page must own the root URL. It is the SEO and acquisition entry point (PRD §2.3), and
   a non-root landing page forfeits most of its value.
3. **Marketing at `/`, HOME-01 at `/home`, no redirect (chosen).**

### Consequences
**Pros** — Root URL is public, static, and prerendered, which is optimal for SEO. Authenticated
users retain access to the marketing page. Post-login redirect targets one unambiguous path.
**Cons** — `/home` is one extra hop after sign-in versus landing on `/`. Every place that assumed
`/` meant "the app" — post-login redirect, `returnTo` defaults, the logo link when authenticated —
must be checked. Cheap to fix now, tedious after M1 ships.

### Impact
`03_TRD.md` §4.1 routing table (updated); post-authentication redirect; AUTH-14 return-path
defaults; the logo destination in the authenticated app shell.

---

<a id="adr-016"></a>
## ADR-016 — Founder HTML supersedes the PRD as the newer requirement source

**Status:** Accepted · 2026-07-31 · **Decided by: Founder**

### Decision
When a founder-supplied HTML screen differs from `Evallo_Recruit_PRD_v1.pdf`, **the HTML is
treated as the newer design iteration and wins.** The PRD is a v1.0 document dated 30 July 2026;
HTML arrives afterwards and reflects current product thinking.

Engineering's job on a difference is to **document it**, not to reject the design or argue it
back to the PRD.

**The one exception:** where a difference changes **architecture or business logic**, it is
explicitly flagged and **implementation waits for founder approval**. Documenting a difference is
never blocked; *acting* on an architectural one is.

### Requirement precedence
```
1. Founder HTML + direct instruction     ← newest, authoritative
2. Evallo_Recruit_PRD_v1.pdf             ← baseline product definition
3. /docs                                 ← derived; stale if it disagrees with 1 or 2
```

### Context
The founder supplies HTML incrementally, 2–3 screens at a time. During the MKT-01 analysis,
engineering flagged four capabilities present in the HTML but listed as non-goals or Phase 2 in
the PRD, and recommended revising the HTML copy to match the PRD.

The founder corrected this: the PRD is the older artifact. Treating it as permanently
authoritative would freeze the product at its 30 July definition and force every design evolution
to be re-litigated against a document that predates it.

### Alternatives considered
1. **PRD always authoritative; HTML must conform** — Maximum consistency with the written spec.
   **Rejected:** makes the PRD a ceiling on the product and turns every iteration into a
   negotiation. It also inverts reality — the founder owns the product definition, and the PRD is
   an expression of it, not a constraint on it.
2. **HTML always wins, no gate at all** — Fastest. **Rejected:** a screen can imply an entire new
   domain (assessments, media hosting, job requisitions) whose cost is invisible in the markup. A
   silent architectural commitment made from a visual prototype is exactly the failure this
   project's approval gate exists to prevent.
3. **HTML wins; architectural and business-logic deltas gated on approval (chosen)** — Design
   iterates freely; only decisions with structural cost require a conversation.

### Consequences
**Pros**
- Design can evolve without re-opening the PRD.
- Engineering stops spending analysis effort arguing scope and spends it on decomposition.
- The founder retains a decision point precisely where cost is non-obvious.

**Cons**
- The PRD progressively drifts from reality. Mitigated by recording every delta in `03_TRD.md` §15,
  which becomes the running record of where the product has moved past the PRD.
- Requires judgment on what counts as "architectural." Working rule: **if it adds a collection, a
  module, an external dependency, or an authorization path, it is architectural.** Visual, copy,
  layout, and interaction changes are not.

### Documentation policy (also set by this decision)
Per-HTML analysis updates **only**: `03_TRD.md`, `06_COMPONENT_GUIDE.md`,
`04_API_DOCUMENTATION.md` (when endpoints change), `14_PROGRESS_TRACKER.md`, and this log (only
when architecture changes).

**Not** updated per HTML: `11_CHANGELOG.md`, `13_BACKLOG.md`, `12_KNOWN_ISSUES.md`. These are
maintained at feature-completion and release boundaries instead.

### Impact
Governs all future HTML batches. Retroactively reframes the MKT-01 analysis: its four "PRD
conflicts" are **scope deltas pending approval**, recorded in `03_TRD.md` §15.


---

<a id="adr-017"></a>
## ADR-017 — In-house authentication; no external identity provider

**Status:** Accepted · 2026-08-01 · **Supersedes** an unrecorded Auth0 spike

### Context
An early iteration integrated Auth0. The founder reversed it: *"We are NOT using Auth0. Do not
introduce any external authentication provider unless I explicitly request it later."*

### Decision
Authentication is implemented in this codebase: bcrypt (cost 12) password hashing,
`jsonwebtoken` access tokens, opaque rotating refresh tokens in an httpOnly cookie (ADR-005), and
our own email verification and password-reset tokens.

**Google sign-in is identity only.** `google-auth-library` verifies the Google **ID token**; the
token is then discarded and *our* JWT is issued. Google's token never authorizes an API call, and
Google is never in the request path after sign-in. A SPA using `@react-oauth/google` performs no
code exchange, so `GOOGLE_CLIENT_SECRET` is not used at all.

### Consequences
**Pros** — no per-MAU vendor cost; no third party in the authentication path; the `User` document
stays the single identity record, which ADR-001's capability model depends on; the whole flow is
testable offline with the console mail transport.

**Cons** — we own the security-sensitive code: lockout, rotation, reuse detection, and
non-enumerating responses are ours to get right and to keep right. Mitigated by 46 integration
tests over the auth surface.

### Impact
No `AUTH0_*` variable, dependency, or code path may be reintroduced without a superseding ADR.
Every remaining reference has been removed from the code and documentation.

---

<a id="adr-018"></a>
## ADR-018 — `onboardingCompletedAt` is a timestamp, not a role

**Status:** Accepted · 2026-08-02

### Context
AUTH-05 (first-action router) must be shown exactly once, immediately after AUTH-04. Nothing in
the existing model could express "this screen has been seen": the PRD's `users` schema has no
onboarding field, and capabilities are derived, never stored.

Deriving it was considered first — "has a candidate profile **or** a company membership" — and
rejected. The **Explore** branch deliberately creates nothing, so a user who chose it would see
the router forever. Client-side storage was also rejected: it does not survive a new browser or
device, and the requirement is per account, not per browser.

### Decision
Add a single nullable `Date` to `users`, written only by `POST /api/me/complete-onboarding`.

### Why this does not violate ADR-001
It records **that a screen was shown**, not what the user may do. It grants nothing, gates nothing,
and is never consulted for authorization. Capabilities remain derived per request from
`CandidateProfile` and `CompanyMember`. Had it stored the *choice* — "this is a candidate account"
— that would have been exactly the permanent user type ADR-001 exists to prevent.

### Consequences
**Pros** — smallest possible change; survives devices; idempotent, so the first stamp wins and a
second tab cannot move it.

**Cons** — one more field on the most-read document, and accounts predating it have no value (they
are simply never routed to AUTH-05).

**Rejected alternative:** exposing the field through `PATCH /api/me`. A dedicated endpoint means
the client can only stamp "now" and can never un-set it.

---

<a id="adr-019"></a>
## ADR-019 — Candidate share links: a revocable secret, not a public profile

**Status:** ⚠️ **Proposed — awaiting CTO approval.** Implemented behind the decision below;
**amends PRD §21.2** and must be approved or reversed before pilot.

### Context

A candidate needs to send their portfolio to someone who is not on Evallo Recruit: a principal, an
agency, a referrer, a former colleague writing them a reference. Today they cannot. The only way a
company sees a candidate is by holding an `AccessGrant`, which exists solely as a by-product of the
candidate expressing interest in that company.

The obvious implementation — a public `/candidate/<slug>` page — is **forbidden by our own
requirements**, in three places:

- **PRD §21.2:** *"Candidate data never appears in public company HTML, public APIs, sitemaps, or
  unauthenticated responses."*
- **`public.routes.js`:** *"HARD BOUNDARY: this module may never import or query a candidate
  collection."*
- **ADR-004:** *"`/robots.txt` blocks candidate, search, message, pipeline, and account routes."*

And the visibility model has no vocabulary for it. `draft` / `private` / `discoverable` / `paused`
all describe what a **company** may reach; none of them means "anyone holding this URL".

Three options were put to the CTO:

| Option | Reach | Cost |
|---|---|---|
| Signed-in share link | Only people who create an Evallo account | Zero new privacy surface; kills the use case for the principal who will not sign up |
| **Revocable secret link** | Anyone with the URL | Requires amending §21.2 |
| No new route | Recruiters already inside a company workspace | The share button would be decorative |

**CTO decision (2026-08-21): the revocable secret link.**

### Decision

A candidate may mint a **256-bit secret** that resolves their portfolio at `/p/<token>`, served by
`GET /api/portfolio/:token`. The endpoint is unauthenticated. It is **not public**.

That distinction is the whole ADR, and it rests on five properties, each enforced in
`share.service.js` rather than by its callers:

1. **The token is the entire address.** No slug, no id, no name. A link cannot be derived from
   knowing who someone is, cannot be enumerated, and discloses nothing about the person until it is
   opened.
2. **Revocation is total.** Disabling or rotating `$unset`s the stored token, so an old link becomes
   *unresolvable* rather than merely refused. There is no window in which a withdrawn link still
   identifies a profile.
3. **It never widens visibility.** A link holder is one more audience for the **same** projection
   every other audience gets. `status` still gates access, ADR-008 per-item visibility still filters
   entries, and contact is revealed only by `contactVisibility === authorized_recruiters` — the same
   rule applied to a signed-in recruiter. `after_interest` and `on_request` resolve to *hidden*,
   because both describe a relationship with a **company** and a link holder is not one.
4. **Off by default.** Publishing does not mint a link. Previewing does not mint a link. Only an
   explicit action does.
5. **Silent about non-existence.** Never-valid, rotated, disabled, draft, archived and deleted all
   return the same 404 with the same message. Distinguishing them would confirm that a particular
   person is on the platform.

`paused` **is** shareable, deliberately. §4.3 defines paused as removal from NEW discovery, and
following a link someone was personally handed is not discovery. A candidate who wants the link dead
turns the link off — a more direct control than their search visibility, and one the share panel
states in words on screen.

### Why this amends §21.2 rather than evading it

§21.2 is written to stop candidate data leaking through surfaces a **stranger can reach without
being given anything**: the company page, the directory, the sitemap, search. Every one of those is
*discoverable*. A share link is not discoverable — it is disclosed, by the candidate, to a person
they chose, and withdrawable by them at any moment.

The route is mounted at `/api/portfolio` rather than inside `/api/public` **precisely to keep §21.2's
implementation honest**: `public.routes.js` still may not touch a candidate collection, and a reader
auditing that module can still trust its header.

If the CTO rejects this ADR, the reversal is small: delete the `portfolio` module and the three
`shareToken` fields, and point "Share portfolio" at the signed-in preview.

### Consequences

**Pros** — the candidate owns distribution of their own work, which is what a portfolio is for; the
mechanism is one secret with one off switch, not a permission matrix; nothing about the existing
recruiter access path changes.

**Cons, stated plainly** —

- A leaked URL is a leaked portfolio until the candidate revokes it. A screenshot of the link in a
  group chat is outside our control. Mitigated by rotation, by the off switch, and by the link
  carrying no name to make it worth forwarding.
- **Anonymous views are not in `auditEvents`.** That model requires `actorUserId`, and a link holder
  has no account. Writing the candidate's own id as the actor would put a false entry in the one log
  §21.4 exists to make trustworthy. Views are written to the request logger instead. Tracked in
  `12_KNOWN_ISSUES.md` as **L-05**.
- **`noindex` is client-side only.** `apps/web` is a static SPA on Vercel (ADR-004 Stage 1 was never
  built), so the meta tag exists only after JavaScript runs. The API sends `X-Robots-Tag` on the JSON,
  `robots.txt` disallows `/p/`, and the URL is unguessable — but a non-rendering crawler that somehow
  obtained a link would see no directive in the initial HTML. Tracked as **L-06**.
- **Social previews are deliberately generic.** WhatsApp, Slack and LinkedIn fetch Open Graph tags
  without executing JavaScript, so whatever the static shell carries is what appears in the card.
  Rendering the candidate's name and headline there would disclose them in a group chat *before*
  anyone chose to open the link. The card therefore says what the link **is**, never who it is about.
  This is a privacy decision, not a limitation to fix later.

### Impact

New: `shareToken`, `shareEnabled`, `shareTokenCreatedAt` on `candidateProfiles` (unique partial
index on `shareToken`); `apps/api/src/modules/portfolio/`; `share.service.js`; `/p/:token`;
`apps/web/public/robots.txt`. Covered by 18 integration tests in `candidatePortfolio.test.js`, of
which 13 are privacy assertions.

---

## ADR-020 — Profile photos: bytes in MongoDB now, object storage later

**Status:** ⚠️ **Proposed — awaiting CTO approval.** Implemented behind the decision below;
**supersedes the storage guidance in I-15** and should be revisited before the pilot scales.

### Context

The profile builder has shown a "Profile photo" block since CAN-02 shipped, and it has never
worked. Both it and Settings → Account rendered whatever `users.profilePicture` held — which was
populated in exactly one place, `auth.service.js`, from the Google OAuth payload. A candidate who
signed up with an email address therefore had no way to ever have a photo, and the copy said so:
*"Photo upload is not available yet."*

That was honest, and it was also a real gap. A headshot is the single strongest signal on a
candidate card, and every recruiter-facing surface has a hole where one should be: the pipeline, the
talent search results, the messages list, the portfolio hero, the candidate detail page.

`12_KNOWN_ISSUES.md` I-15 anticipated this and set a condition on it:

> *"Whenever storage is chosen it must be object storage with pre-signed URLs; serving uploads
> through the API process is the one choice that would undo the scaling profile described in I-10
> and I-11."*

That guidance is correct, and following it today means provisioning an R2 or S3 bucket, adding
credentials to every environment, and writing a pre-signed-URL handshake — before a single candidate
can pick a file.

### Decision

**Store the bytes in MongoDB, in a dedicated `mediaAssets` collection, served by the API.**

The CTO was given both options with this trade-off stated plainly, and chose to ship. The
constraint accepted alongside it is that this is explicitly an interim measure, and the design pays
for the right to be interim:

1. **The stored value is a URL, exactly as before.** `users.profilePicture` still holds an absolute
   URL — it always did, because Google supplied one. Twelve surfaces read it into an `<img src>` and
   **not one of them knows where the bytes live.** Moving to a bucket changes what new URLs point at
   and leaves every existing URL working, because `GET /api/media/:id` can keep serving from the
   collection for as long as rows remain. There is no migration of consumers, and no flag day.

2. **The collection grows with PEOPLE, not with uploads.** A unique index on
   `{ ownerUserId, kind }` makes an upload an upsert, so replacing a photo six times leaves one
   document. This is the assumption the whole decision rests on, so it is asserted by a test
   (*"replacing leaves exactly one document"*) rather than left as an intention.

3. **The client downscales before uploading.** The browser centre-crops to a square, scales the
   longest edge to 512px and re-encodes as WebP. A 900×600 PNG measured **1,250 bytes** stored.
   A phone camera original would have been several megabytes, to be displayed at 40px in a sidebar.
   Doing this server-side would mean `sharp` — a native dependency — on a request that currently
   costs no CPU at all.

4. **`data` is `select: false`.** Ownership checks, the deletion purge and any future listing work on
   metadata alone. Only the streaming route asks for the bytes.

### What was rejected, and why

- **Object storage now (I-15 as written).** Correct destination, wrong week. It blocks a visible
  broken feature behind infrastructure procurement. Revisit when photo volume or egress shows up in
  the numbers — points 1–4 exist so that day is a configuration change, not a rewrite.
- **Base64 on the user document.** Simplest possible change, and the worst. `users` is read on
  virtually every authenticated request; inlining a 100 KB string would put it in the working set of
  every one of them.
- **GridFS.** Built for files over the 16 MB document limit. A 512px WebP is three orders of
  magnitude under it, so GridFS adds chunk bookkeeping to solve a problem this data does not have.
- **Multipart upload.** A photo upload carries one file and no fields. `multipart/form-data` would
  add boundary parsing — and boundary-parsing attack surface — to encode nothing. The `Blob` is the
  request body.

### Security consequences, stated deliberately

- **The declared `Content-Type` is never trusted.** It costs an attacker nothing to send. The format
  is decided by sniffing magic bytes, and the stored `contentType` is what the *sniff* returned —
  which is also what the file is later served as. An ELF binary sent as `image/png` is refused; a
  real JPEG mislabelled as PNG is stored, correctly, as JPEG. Both are tested.
- **`GET /api/media/:id` is unauthenticated, and this is a considered trade.** An `<img src>` cannot
  send an Authorization header, and the twelve consuming surfaces span six authorization contexts
  including a share link opened by a stranger with no account. It is acceptable *only* because of
  what the asset is: the picture a person chose to represent themselves to employers. Nothing is
  reachable from the URL but the image — no name, no location, no identifiers. The id is a 96-bit
  ObjectId, so the space cannot be swept, and the URL is only ever disclosed inside a response that
  already passed an authorization check. Responses carry `X-Robots-Tag: noindex` and
  `Cache-Control: private` so an asset is exactly as visible as the URL it came in, and no more.
- **`profilePicture` was removed from the `PATCH /api/me` allowlist.** While it sat there, any client
  could set it to any URL that parsed — and that value is rendered as an `<img src>` in *other*
  users' browsers, making it an arbitrary third-party fetch that logs a recruiter's IP on request.
  It is now written in exactly two places, both server-side: Google sign-in, and upload. No client
  ever sent the field, so this removes an attack surface without removing a behaviour.
- **`GET /api/media/:id` overrides the global `Cross-Origin-Resource-Policy`.** `helmet` sets
  `same-site` for the whole API, which is right for JSON and wrong for the one route that exists to
  be embedded from another origin: the web app is on `*.vercel.app` and the API on `onrender.com`,
  different registrable domains, so `same-site` makes the browser refuse to render the image while
  the request still returns 200. `cross-origin` is scoped to this route only, and is safe for the
  same reason the route is unauthenticated. **This is invisible in local development** —
  `localhost:3001` and `localhost:8081` differ only by port, which CORP does not consider — so it is
  pinned by a test rather than left to manual checking.
- **Uploads are rate limited** (`MEDIA_UPLOAD`, 20 per 15 minutes) — the only authenticated write
  whose cost is measured in megabytes of storage rather than bytes.
- **The deletion purge deletes the asset.** The tombstone step already `$unset` the pointer; on its
  own that would have left a photograph of a face in the database indefinitely, reachable by anyone
  who still held the URL.

### Impact

New: `mediaAssets` collection; `apps/api/src/modules/media/`; `POST`/`DELETE /api/me/photo`;
`GET /api/media/:id`; `mediaUploadLimiter`; `apps/web/src/utils/imageResize.js`;
`apps/web/src/features/account/ProfilePhotoUploader.jsx`.

Changed: `user.service.js` (allowlist), `user.validation.js`, `errorHandler.js` (`entity.too.large`
now reads as a validation error rather than a 500), `accountDeletion.job.js` (purge),
`IdentitySection.jsx` and `SettingsAccountPage.jsx` (both stale "not available yet" blocks replaced
by the shared uploader), `Icon.jsx` (`camera`).

Covered by 17 integration tests in `profilePhoto.test.js`, of which 5 assert that the declared
content type is disregarded and one pins the `Cross-Origin-Resource-Policy` header below.

---

## ADR-021 — One company profile component, rendered by every surface that shows a company

**Status:** ✅ Accepted and implemented, 2026-08-27.

### Context

A company profile was reachable at three places: `/companies/:slug` anonymously (PUB-02),
`/me/companies/:slug` signed in (CAN-06), and inside REC-06's preview panel. All three were built
independently. They shared `CompanyOverview` and `OpenRoleCard` and nothing else — the header, the
page width, the section rhythm, the roles heading and the empty state were each written three
times.

The predictable thing happened. PUB-02 was rebuilt to the approved reference; the other two were
not. The product then had two different-looking company pages at the same time, and **which one a
person saw depended on how they arrived** — a link gave them the new page, browsing while signed in
gave them the old one. REC-06's own source comment claimed "what a recruiter reviews is what the
public gets", which had quietly become false.

Restyling the two stragglers to match would have restored the appearance and left the structure
that caused it, ready to diverge again on the next change.

### Decision

**The layout lives once, in `features/companies/components/CompanyProfileView.jsx`.** All three
routes render it. Pages supply only what genuinely differs:

| Prop | Why it differs per surface |
|---|---|
| `actions` | Anonymous gets "Express interest". Signed-in gets Save, Block and interest state — which depend on a relationship an anonymous visitor does not have |
| `banner` | Signed-in status messages: blocked, interest already sent, last action's outcome |
| `backTo` | The directory this profile was reached from |
| `topSpacing` | Navbar clearance differs per shell — a named prop, not a `className`, because `cn` is a plain join and a passed `pt-0` beside a built-in `pt-20` leaves both classes on the element and lets stylesheet order decide |
| `editStepHref` | REC-06 only. What turns the shared rendering into an editing surface, without the public page carrying any of it |

Everything else — and that is nearly everything — is **not a prop**, so it cannot diverge.

### Consequences

- A change to the company page is one change. The failure mode that produced this ADR is now
  structurally impossible rather than a thing to remember.
- REC-06's claim is true: the preview *is* the public rendering.
- The cost is a component with five props whose values are decided by the caller. That is the
  correct trade against three copies, and the props are few because the surfaces genuinely differ
  in few ways.
- `CompanyProfileSkeleton` was extracted for the same reason: two routes load the same payload
  through the same hook, so a skeleton written twice is two chances to stop matching.

---

## ADR-022 — A role gets its own page; the consent flow does not get a second implementation

**Status:** ✅ Accepted and implemented, 2026-08-27. **Reverses the destination half of an earlier
decision recorded in `RoleResultCard`.**

### Context

`RoleResultCard` linked to `/me/companies/<slug>#open-roles`. The reasoning was written down and
was about the interest flow:

> *"There is no separate role detail page and no second interest flow — the consent disclosure, the
> intent selector and the access grant all live on that page already (CAN-06/CAN-07), and a second
> implementation of a consented disclosure is the last thing this product should have two of."*

That is right about the **flow** and wrong about the **destination**. The effect was that "Search
for Roles" and "Search for Companies" led to the same screen. The role search could *find* a role
but never *show* one: opening a result landed on the organisation's profile, where the role you
clicked was one card among several. One of the two searches was, in practice, redundant.

### Decision

**A role has its own page** — `/me/roles/:roleId`, served by a new
`GET /api/public/roles/:roleId`. The role is the subject: heading, summary panel, apply action. The
company is context, with a real link to its profile — so that visit becomes a choice rather than
somewhere the candidate was sent.

**The original objection is answered rather than overridden.** `RoleDetailPage` *reuses*
`CandidateInterestModal`; it does not rebuild it. There is still exactly **one** implementation of
the PRD §8.7 step-6 consented disclosure, now openable from two places. A `defaultIntentId` prop was
added so applying from a role page submits *that role* instead of silently defaulting to general
interest.

### Consequences

- **Visibility is re-proved, not inherited.** Search hides a role by not returning it; a direct link
  asks for one *by id*, so the detail endpoint re-checks every rule search applies. A closed intent,
  a draft company, a moderation-restricted company and an unknown id all return an **identical
  404** — a 404 that meant "withdrawn" would let anyone enumerate closed roles. Six tests in
  `roleSearch.test.js` pin exactly that.
- The endpoint reuses `serialiseRole`, so the card and the page cannot disagree about a field; a
  test asserts the two payloads are deep-equal.
- `/roles/facets` is declared before `/roles/:roleId` so the literal segment wins.

---

## ADR-023 — The approved HTML is a design reference, not a data contract

**Status:** ✅ Accepted, 2026-08-27. **Qualifies ADR-016.**

### Context

ADR-016 established that the founder's HTML supersedes the PRD as the newer requirement source.
Four screens were rebuilt against those references in August 2026 (PUB-02, REC-02, REC-12, plus the
CAN-06 unification above). Each reference contained, alongside its layout, **content the product has
no data for** — and in one case content it must not fabricate:

| Reference | Element | Reality |
|---|---|---|
| REC-12 | "Platform Verified Credentials" — *1590 (Official)*, *Background Cleared* | **Nothing in this product verifies anything.** B-04 is unbuilt; no field distinguishes a checked background from a claimed one |
| REC-12 | "Must Have" filter toggles — Video Intro, Official Score Report, Background Check | Filters over that same non-existent verification |
| REC-12 | Teaching-sample video on the search card | `evidence.media` exists, but `toSearchCard` drops the evidence block by design (PRD §21.4) |
| REC-02 | Logo "Browse files" picker | No company-owned asset storage. B-18, blocked on D-02 |
| REC-02 | Editable slug field | Needs B-11 redirect handling, or every shared link breaks |
| PUB-02 | Media gallery, educator testimonials | B-15, B-16 |

### Decision

**Match the reference's layout, structure and visual language. Never render a claim the data cannot
support.** Where a reference block has no data behind it, one of three things happens, in this
order of preference:

1. **Fill the slot with something true.** REC-12's credential badges became "Why they match your
   search" — real, server-computed, in the identical two-tone chip treatment, and something PRD
   §21.4 requires be shown anyway.
2. **Keep the shape, change the control.** REC-02's logo block kept its preview-beside-field layout
   and dropped the file picker, because a dialog that opens and then discards the file is worse than
   a URL input that works.
3. **Omit it and write down why** — here, and in the backlog with a blocking dependency.

**The hard line is fabricated verification.** Rendering "Background Cleared" on a real educator's
card, to someone deciding whether to hire them, asserts a check this product has never performed.
That is not a styling shortcut with a cosmetic cost; it is a false statement about a person, in the
one context engineered to be trusted. No reference outranks that.

### Consequences

- Screens will differ from their reference in specific, listed places. Each difference is recorded
  in `11_CHANGELOG.md` with its reason and its unblocking backlog item.
- **A new button must work.** Every control added from a reference — the tag input, the option
  cards, the filter chips, "Save and exit", the onward rail links — is wired to real behaviour.
  Decorative controls are not shipped.
- B-04 is now the blocking dependency for two approved designs, and is annotated as such.

---

<a id="adr-024"></a>
## ADR-024 — A conversation is between two people, not a candidate and a company

**Status:** 🕐 Proposed, 2026-09-01. **Reverses an undocumented decision recorded in
`05_DATABASE_SCHEMA.md` and `04_API_DOCUMENTATION.md`. Not implemented.**

### Context

Messaging shipped (CAN-09 + REC-15) with one thread per `{ candidateId, companyId }`, enforced by a
unique index. On the call of 29 Aug 2026 the CTO asked for the opposite:

> *"Chat private. You need to have one-on-one chat between two people."*

and named the reason: *"what if there are two employees in the company?"* Today those two employees
share one thread, the candidate sees a company logo where a person's name belongs, and either
employee reads everything the other wrote.

**The data layer is already half-way there.** `messages.senderUserId` and `senderType` exist, and
`conversations.lastMessageSenderId` was denormalised specifically so the thread list could name the
individual. Attribution is solved. **Separation is not** — and the unique index makes it
structurally impossible, not merely unimplemented.

#### What the production data actually contains

All 8 live conversations were inspected before this decision. The distribution is the reason the
migration below refuses to backfill:

| Company messages in the thread came from | Threads | Owner determinable? |
|---|---|---|
| Exactly **one** employee | **6** | Yes, unambiguously |
| **Two** employees (5 messages, interleaved) | **1** | **No** |
| No `senderUserId` at all — pre-dates attribution | **1** | **No** |

Two of eight cannot be assigned to a person by any rule that is not a guess.

#### PRD §21.6 does not mandate the current design

Both documents justify company-scoping by citing PRD §21.6 — *"a recruiter leaving does not orphan
the thread and their replacement inherits it."* **§21.6 says the opposite.** Its only relevant line
is:

> | Recruiter removed from company | **Immediate** loss of candidate/search/message access; audit retained |

The PRD never uses the word "conversation". There is no ADR on messaging. So the citation is
mistaken, and per-person threads satisfy §21.6 **better** than the current design: a departing
recruiter's thread goes inert, rather than being handed to a colleague the candidate never spoke to.

This is recorded plainly because the company-scoped choice was a deliberate engineering decision and
deserves to be reversed openly rather than drifted away from. What it lacks is not merit — it is the
PRD authority it claims.

### Decision

**A new conversation is private between one candidate and one individual employee.**

1. `conversations` gains **`recruiterUserId`**, nullable, identifying the employee who owns the
   thread. Nullable is the whole design: it is what lets the 8 existing rows stay valid.
2. The unique index becomes **`{ candidateId, companyId, recruiterUserId }`**. The current
   `{ candidateId, companyId }` index is not a tidiness detail to be relaxed — it is a hard database
   constraint that would reject the second thread with a duplicate-key error. It must be replaced
   for the feature to exist at all. `companyId` stays in the key because blocking, authorization and
   the interest flow are all company-scoped and remain so.
3. Employee A's thread is separate from Employee B's. **Employees cannot see or reply to each
   other's new conversations.** A candidate may hold several concurrent threads with one company.
4. **Legacy rows keep `recruiterUserId = null` and remain shared** — any employee may read and
   reply, exactly as today. They genuinely *were* shared conversations; presenting them as one
   person's is a false statement about who said what.
5. **No backfill. No splitting. No reassignment of historical messages.**

#### Why not split, assign, or backfill

| Option | Why rejected |
|---|---|
| Split by `senderUserId` | Works for 6 rows; on the two-employee thread it yields two half-conversations with replies severed from the questions that prompted them. The candidate experienced one conversation — splitting rewrites their history. |
| Assign the whole thread to one employee | Puts one employee's messages under a colleague's name. **Misattribution is worse than the problem being fixed.** |
| Backfill "most frequent sender" | A heuristic dressed as a fact, and undefined for the row with no attribution at all. |
| Leave shared | Honest, reversible, and costs one transitional behaviour that decays as old threads go quiet. **Chosen.** |

Two behaviours therefore coexist for a while. That is the accepted price of not lying about history.

### Authorization expectations

Reads and sends already pass `resolveCandidateAccess` and the `message:send` permission; both are
unchanged. Added on top:

- A thread with `recruiterUserId` set is readable and writable by **that user only**, within that
  company. Not by owners, not by admins — *"chat private"* admits no membership-tier exception, and
  a role that can read every private thread is the feature's absence wearing a different name.
- A thread with `recruiterUserId = null` stays readable and writable by any member holding the
  permission.
- `listCompanyConversations` currently returns every thread for the company to any recruiter. It
  must return the caller's own threads plus legacy shared ones. **This is the security-relevant edit
  of the whole change** — the one place where getting it wrong exposes messages to the wrong
  employee.
- Replying to a legacy `null` thread **must not silently adopt it.** Adoption would privatise, on
  one click and with no consent, a thread colleagues could previously read.

### Blocking stays company-level

Unchanged, and deliberately so. Blocking bites in `resolveCandidateAccess`, keyed on
`{ profile, companyId }` and checked before any conversation is touched. One block therefore stops
**every** employee of that company across **all** threads, legacy and new, with no per-thread
bookkeeping. A candidate blocking a company means the company — not the individual who happened to
write last. Per-person threads must not weaken this into a per-person block.

### Unread-count implications

`candidateUnread` / `companyUnread` stay per side. Under per-person threads `companyUnread` becomes
genuinely per person, because each new thread has exactly one employee — the field acquires the
meaning it always implied.

**A pre-existing defect is exposed rather than introduced:** today `companyUnread` is shared, so one
recruiter opening a thread clears the badge for the entire company. New threads fix this as a side
effect; **legacy shared threads keep the bug.** It is named here so it is fixed on purpose, with a
test, instead of being mistaken for a migration artefact.

### Data-export implications

The candidate export (`settings.service.js`) emits `{ company, slug, startedAt, messages[{ from,
body, sentAt }] }`, where `from` is `senderType` only — a candidate's own export cannot today
distinguish two recruiters. Per-person threads make including the employee's name *possible*.

**It is not adopted here.** Naming a company's employee inside a file the candidate downloads,
retains and may forward is a privacy decision about a third party, not an export-formatting
improvement. The export stays company-level until someone decides otherwise on the record.

### Migration and index rollout

The schema change is one nullable field and one index swap. **No data migration.**

| # | Step | Reversible? |
|---|---|---|
| 1 | Add `recruiterUserId` (nullable, default `null`). Deploy. No behaviour change. | Yes, trivially |
| 2 | **Drop `{ candidateId, companyId }`, create `{ candidateId, companyId, recruiterUserId }` — back to back, in one maintenance step.** | Yes |
| 3 | Deploy the code that sets `recruiterUserId` on creation and enforces the authorization rules above. **First release with a behaviour change.** | See below |
| 4 | Frontend: person's name as thread title, company beneath; "mine" vs "team (legacy)". | Yes |

> ⚠️ **Correction, found while executing step 2.** The ordering below is wrong on one point, and it
> was observed failing rather than reasoned about: after the migration ran and was verified, the old
> `candidateId_1_companyId_1` unique index **came back on its own**. Nothing in this repository
> recreates it — one model owns the collection, it no longer declares that key, and a full test run
> left the index untouched.
>
> The cause is `autoIndex`. This project never sets `autoIndex: false` and never calls
> `syncIndexes()`, so **every process running the pre-step-2 model recreates the old index on boot**
> — the deployed API, a colleague's dev server, anything pointed at the same cluster. Mongoose adds
> declared indexes and removes nothing, so an old instance silently undoes the migration.
>
> **The real constraint is therefore: no instance running the old model may be connected when the
> migration runs.** Deploy step 2's code everywhere first (or stop the old instances), then migrate,
> then verify. Re-running the migration is safe and is the fix when this happens.
>
> This also means step 2 is not durable on a shared development cluster while anyone runs older
> code, and that the migration should be re-verified immediately before step 3 ships rather than
> trusted from an earlier run.

**The ordering is the substance of this section: field before index, index before code, code before
UI.** Any other order fails in a specific way —

- Index before field: the new index is created over a field no document has.
- Code before index: the second thread is rejected by the old unique index; sending appears broken.
- Index created before step 3's code: every new thread is written with `recruiterUserId = null`,
  collides with the legacy row, and messaging **silently reverts to shared** with nothing failing.

Step 2's window between `drop` and `create` is the only moment no uniqueness constraint exists.
Messaging is low-volume; it is performed in one step at a quiet hour, not left open across a deploy.

### Rollback considerations

- **Steps 1–2:** drop the new index, restore the old one. Nothing has changed behaviourally.
- **Step 3 is the point of no easy return.** Once per-person threads exist, restoring the old unique
  index fails wherever two threads share a `{ candidateId, companyId }` pair — the index build
  itself aborts. Rolling back then means merging real conversations, which is the splitting problem
  in reverse and equally lossy.
- Therefore step 3 is rehearsed against a restored copy of production before it ships, and step 2 is
  preceded by a backup.
- Rolling back the frontend alone (step 4) is always safe: threads exist and remain readable.

### Consequences

- `05_DATABASE_SCHEMA.md` and `04_API_DOCUMENTATION.md` both state that threads belong to the
  company and cite §21.6. **Both are wrong on the citation today, and will be wrong on the
  behaviour after step 3.** Each now carries a pointer to this ADR; each is rewritten when step 3
  ships, not before — the docs describe what runs.
- Tests to change: `candidateJourney`, `recruiterWorkflow`, `candidateBlocking`, `dataExport` — all
  assume one thread per candidate/company pair. Tests to add: two employees produce two threads · a
  legacy `null` thread still works for any member · an employee cannot read a colleague's thread ·
  unread isolation · blocking still kills every thread from that company.
- **The 5-message two-employee thread is the regression fixture.** It is the only production row
  that exercises the ambiguous case, and it is checked by hand after every step above.
- One question remains open and is the CTO's to answer, not engineering's: **may colleagues *see*
  (without replying to) each other's threads?** This ADR assumes not, per *"chat private"*. If the
  answer changes, only the `listCompanyConversations` filter in step 3 changes — which is why the
  question does not block steps 1 and 2.
