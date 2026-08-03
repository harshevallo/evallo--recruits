# 03 — Technical Requirements Document

**Version:** 1.0 · 2026-07-31
**Source of truth for product scope:** `Evallo_Recruit_PRD_v1.pdf` (40 pp.)
**Decisions referenced here are recorded in:** `10_DECISION_LOG.md`

This document describes *how* Evallo Recruit is built. Every significant choice below links to
an ADR containing the alternatives and trade-offs. If this document and an ADR disagree, the
ADR is authoritative and this document is stale — fix it.

---

## 1. Overall architecture

Three deployable units, one repository.

```
                     ┌──────────────────────────────┐
   Anonymous  ─────▶ │  Express (apps/api)          │
   visitor           │                              │
   (Googlebot)       │  ├─ /api/public/*   no auth  │──┐
                     │  ├─ /sitemap.xml             │  │
                     │  ├─ /robots.txt              │  │
   React SPA  ─────▶ │  ├─ /api/auth/*              │  ├──▶  MongoDB
   (apps/web)  HTTPS │  ├─ /api/me/*                │  │     (Mongoose)
        │            │  └─ /api/companies/:id/*     │──┘
        │            └──────────────────────────────┘
        │                          ▲
        └──────────────────────────┘
              packages/shared
     (Zod schemas · taxonomy · permission matrix)
```

**Architectural style:** modular monolith. One Express process, thirteen internally isolated
feature modules (ADR-011). Not microservices — PRD §20 describes a pilot with a limited set of
businesses, and a solo engineering team. Service boundaries would add deployment and
distributed-consistency cost with no corresponding benefit at this stage. The module structure
means the boundaries already exist in code should extraction ever be warranted.

**Two distinct authorization surfaces**, per PRD §16.1:

> Public company information and private recruiter/candidate information are stored and served
> through **distinct authorization paths**.

This is implemented as a hard routing split. `/api/public/*` is served by `modules/public`,
which may only read published company data and **can never reach candidate collections**.
Everything else requires authentication. This satisfies PRD §21.2: *"Candidate data never
appears in public company HTML, public APIs, sitemaps, or unauthenticated responses."*

---

## 2. Technology stack

Fixed by the CTO. See **ADR-002**. Changing any row requires a new ADR and explicit approval.

| Layer | Technology | Notes |
|---|---|---|
| Client | React (Vite), JavaScript | No TypeScript, no Next.js |
| Routing | React Router | |
| Styling | Tailwind CSS | Design tokens from PRD §19.1 |
| HTTP | Axios | Single configured instance, interceptor-driven |
| Server | Node.js 18+, Express.js | ESM throughout (ADR-012) |
| Database | MongoDB + Mongoose | Sole datastore and sole search engine (ADR-010) |
| Validation | Zod, in `packages/shared` | Isomorphic (ADR-009) |
| Auth | JWT access + opaque rotating refresh | ADR-005 |

**Deliberately excluded:** Redux/MobX (§8 explains why), Elasticsearch or any secondary index
(ADR-010), Next.js or any alternative framework (ADR-002), any second database.

---

## 3. Folder structure

Specified in full in **`07_PROJECT_STRUCTURE.md`**, including import boundaries and layer
rules. Not repeated here.

---

## 4. Routing

### 4.1 Frontend route tree

Routes are grouped by **the object being managed**, per PRD §5.3 — not by user type, which
would contradict ADR-001.

```
/                                   → MKT-01 marketing landing      [public, prerendered]
/home                               → HOME-01 universal home        [auth]
/signin  /signup  /verify  /set-password
/forgot-password  /reset-password                                   [public]

/companies                          → PUB-01 directory              [public, SSR-safe]
/companies/:slug                    → PUB-02 company profile        [public, SSR-safe]

/me                                 → CAN-01 candidate home         [auth + candidate]
/me/profile                         → CAN-02 builder                [auth + candidate]
/me/profile/preview                 → CAN-03                        [auth + candidate]
/me/visibility                      → CAN-04                        [auth + candidate]
/me/companies                       → CAN-05 discovery              [auth + candidate]
/me/companies/:slug                 → CAN-06 company, signed in     [auth + candidate]
/me/interests                       → CAN-08                        [auth + candidate]
/me/messages                        → CAN-09                        [auth + candidate]
/me/saved                           → CAN-11                        [not built]
/settings/*                         → SET-01                        [auth]

/c/:companySlug                     → REC-10 company home           [auth + membership]
/c/:companySlug/interests           → REC-11                        [+ interest:view]
/c/:companySlug/search              → REC-12                        [+ candidate:search]
/c/:companySlug/candidates/:id      → REC-13                        [+ candidate:view]
/c/:companySlug/pipeline            → REC-14                        [+ pipeline:view]
/c/:companySlug/messages            → REC-15                        [+ message:send]
/c/:companySlug/hiring              → REC-16                        [+ hiring:manage]
/c/:companySlug/profile/edit        → REC-17                        [+ company:edit]
/c/:companySlug/team                → REC-18                        [+ member:manage]
/c/:companySlug/settings            → SET-02                        [+ company:settings]
```

**The `/c/:companySlug` prefix is load-bearing.** Company context lives in the URL, not in
client state. This gives three things the PRD requires: a shareable/bookmarkable link that
carries its own context, correct browser back/forward across company switches (PRD §5.2
multi-company switcher), and a server-verifiable context on every request (ADR-006). Storing
the "current company" only in React state would make deep links ambiguous and put an
authorization-relevant value under client control.

### 4.2 Route guards

Capability guards must treat "authenticated, capabilities not yet loaded" as *loading*, not as
"no capability" — `status` flips to authenticated before `GET /api/me` resolves, and getting this
wrong redirects a genuine candidate or member away on every hard reload.

Guards are **UX only**. They prevent a user from navigating into a screen that will fail; they
are never the security boundary. The server re-verifies every request independently (ADR-006).

| Guard | Checks |
|---|---|
| `RequireAuth` | A valid session exists; otherwise redirect to `/signin` preserving `returnTo` |
| `RequireCandidate` | A `CandidateProfile` exists. Sends a user without one back to HOME-01, where creating one is an explicit action |
| `RequireCompany` | The user has an active membership in `:companySlug` |
| `RequirePermission` | The membership role grants the permission, per the shared matrix |

### 4.3 Return-path preservation (AUTH-14, PRD §9.2)

PRD §21.5 requires an anonymous visitor to click "I'm interested", authenticate, complete a
minimum profile, and return **without losing company/role context**.

Intent is stored server-side in a short-lived signed record keyed to the auth flow — capturing
company, hiring intent, campaign source, and return path — not in `localStorage`. Client
storage would not survive the email-verification round trip, which frequently completes in a
different browser from where it started.

### 4.4 Public rendering strategies

Three public surfaces, three different data profiles, three strategies. The strategy follows
from the data, not from preference.

| Screen | Data at request time | Strategy | ADR |
|---|---|---|---|
| MKT-01 marketing | **None** — fully static | **Build-time prerender** into `index.html` | ADR-013 |
| PUB-01 directory | Company list from MongoDB | Runtime metadata injection; SSR if triggered | ADR-004 |
| PUB-02 company page | One company from MongoDB | Runtime metadata injection; SSR if triggered | ADR-004 |

All three use `react-dom/server`, which ships with React. None changes the stack (ADR-002).

MKT-01 is the cheapest and highest-value case: because nothing varies per request, it can be
rendered once at build time and served as complete static HTML, giving Googlebot the full page
on first byte with **no runtime cost and no indexing-latency risk**. It is therefore exempt from
limitation L-02.

### 4.5 Anchor navigation

MKT-01 uses in-page anchors (`#businesses`, `#educators`, `#features`, `#get-started`). **React
Router does not scroll to a hash fragment on navigation** — this must be handled explicitly by a
small `ScrollToHash` effect in the public layout that reads `location.hash` and scrolls the
target into view after paint.

The effect must respect `prefers-reduced-motion`: the prototype sets `scroll-smooth` globally
with no guard, which is a vestibular-accessibility problem (PRD §19 Accessibility).

---

## 5. Authentication

Full rationale in **ADR-005**.

### 5.1 Token model
| Token | Form | Lifetime | Stored |
|---|---|---|---|
| Access | JWT `{ userId, sessionId }` | 15 min | JavaScript memory only |
| Refresh | Opaque random | 30 days, rotating | `httpOnly; Secure; SameSite=Lax` cookie (`evallo_rt`); **hashed** in `authSessions` |

> The collection is `authSessions`, **not** `sessions`. The shared MongoDB host also serves the
> main Evallo platform, whose `sessions` collection holds tutoring sessions — a name collision
> there would have been a data-loss incident, not a naming quibble.

The access token carries **no roles and no company data** — required by ADR-001/006, because
company authority must be revocable instantly (PRD §21.6).

### 5.2 Sign-up sequence (PRD §6.1)

Email verification precedes password creation. PRD §21.1 requires that the sign-up page ask
for no role, no company, no profile detail, and **no password**.

```
AUTH-01  email only          → POST /auth/signup          → verification token issued, emailed
AUTH-02  verification sent   → POST /auth/resend-verification | /auth/change-email
AUTH-03  link opened         → POST /auth/verify-email     → { needsPassword, setupToken }
         set password        → POST /auth/set-password     → session created here, first time
AUTH-04  basic setup         → PATCH /me { name }
AUTH-05  first-action router → POST /me/complete-onboarding → then candidate | company | explore
                             → HOME-01 /home
```

**As built:**

- **Signup issues no session.** `POST /auth/signup` accepts an email and nothing else; the schema
  strips `password`/`name` so they cannot be smuggled in. The account has no `passwordHash` until
  AUTH-03.
- **`verify-email` returns a single-use setup token** (30-minute TTL, purpose
  `password_setup`) rather than authenticating. That token is the only thing that authorises
  `set-password`, so the credential can only be created by whoever opened the emailed link.
- **`set-password` is where the session begins** — it sets the password, marks the email verified,
  clears any lockout, and issues the token pair that carries onboarding to `/home`.
- **Login enforces verification *after* the password check**, so a wrong password on an unverified
  account returns the same generic `401` and the endpoint is not a verification oracle.
- **Remember me** (AUTH-10): unticked ⇒ session cookie with no `Max-Age` and a 1-day server
  session; ticked ⇒ persistent cookie and the full TTL. The choice is carried across rotations, so
  a short session is never silently upgraded to a long one.
- **Failed-attempt throttling is per account**, not per IP (10 attempts ⇒ 15-minute lock), so
  rotating IPs does not dodge it. A successful sign-in clears the counter.

`AUTH-05` writes **no role anywhere.** It is navigation only (ADR-001). Its single side effect is
stamping `users.onboardingCompletedAt` so the screen is shown once — a timestamp is required
because the "Explore" branch leaves no other trace, and nothing derivable could distinguish a
returning user from a new one.

### 5.3 SSO (Google, Microsoft)
PRD §6.3 AUTH-13 requires that an email already tied to a password or another provider must
never silently produce a duplicate account. Providers link to an existing `User` via verified
email after proof of ownership. `User.authMethods[]` records each linked provider.

### 5.4 Refresh flow
Axios response interceptor: on `401`, queue concurrent failures, issue **one** refresh call,
replay the queue on success, redirect to sign-in on failure. Queueing is required — without it
a screen firing five parallel requests triggers five rotations, and rotation-reuse detection
(ADR-005) would correctly revoke the user's own session.

---

## 6. Authorization

Full rationale in **ADR-006**. Four layers, evaluated in order, failing closed.

```
1. authenticate            → req.user
2. resolveCompanyContext   → req.company, req.membership   (active membership required)
3. requirePermission(p)    → role grants p?               (PRD §4.2 matrix)
4. candidate visibility    → does the CANDIDATE permit THIS company?  (PRD §4.3, §7.10)
```

### 6.1 Permission matrix (PRD §4.2)
Defined once in `packages/shared/permissions/matrix.js`.

| Permission | Owner | Admin | Recruiter | Hiring mgr | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| `company:edit` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `company:delete` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `company:transfer` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `member:manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `hiring:manage` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `candidate:search` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `candidate:view` | ✅ | ✅ | ✅ | assigned only | ✅ |
| `interest:view` | ✅ | ✅ | ✅ | assigned only | ✅ |
| `pipeline:edit` | ✅ | ✅ | ✅ | recommend only | ❌ |
| `message:send` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `note:write` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `data:export` | ✅ | ✅ | ❌ | ❌ | ❌ |

### 6.2 Layer 4 — candidate visibility

This layer has no equivalent in ordinary RBAC and is the part most likely to be implemented
incorrectly. A recruiter with `candidate:view` may still be denied, because the **candidate**
controls access (PRD §4.3, §7.10). A candidate is visible to company C when:

```
profile.status === 'discoverable'                            (in search)
  OR  an explicit AccessGrant exists for C                    (shared via interest)
  OR  (profile.status === 'paused' AND C was previously authorized)
AND   C is not in profile.blockedCompanies
AND   C's membership is active AND C is published/verified    (PRD §7.10)
```

**These predicates are composed into the MongoDB query itself, never applied after ranking.**
PRD §10.1 requires privacy filtering *before* ranking; post-filtering would leak existence
through result counts and corrupt pagination. `modules/search/search.service.js` is therefore
the single most security-critical file in the codebase and carries mandatory test coverage.

### 6.3 Access logging
PRD §7.10 and §16.1 require every candidate profile view, evidence download, contact reveal,
and export to be logged with company, user, timestamp, and source. Emitted by the owning
service (never the controller) into `auditEvents`.

---

## 7. API architecture

### 7.1 Conventions
- Base path `/api`. Resource-oriented. Company-scoped resources nest under
  `/api/companies/:companyId/...` so context is explicit and middleware-enforceable.
- **Every** response passes through one envelope. No route hand-rolls a response shape.

```jsonc
// success
{ "success": true, "data": { }, "meta": { "page": 1, "total": 143 } }

// error
{ "success": false,
  "error": { "code": "VALIDATION_ERROR",
             "message": "Human readable",
             "details": { "email": "Enter a valid email address" } } }
```

`details` is keyed by form field so the client maps errors to inputs directly (PRD §19.1:
inline, specific, accessible, no layout shift).

- Status codes: `400` validation · `401` unauthenticated · `403` unauthorized ·
  `404` not found *or deliberately masked* · `409` conflict · `429` rate limited · `5xx` server.
- **`404`-not-`403` for candidate resources.** Returning `403` for a candidate the recruiter
  may not see confirms that candidate exists — an information leak under PRD §16.1.

### 7.2 Idempotency
PRD §19 (Reliability) requires idempotent interest submission, invitation acceptance, and
verification. Implemented with a unique compound index plus upsert semantics — for interest,
`{ candidateId, companyId, hiringIntentId }` unique among active records (PRD §4.1). A retry
returns the existing record with `200`, never a duplicate. This satisfies PRD §21.5.

### 7.3 CORS and custom headers

Any custom request header the client sends must appear in the CORS `allowedHeaders` allowlist in
`middleware/security.js`. If it does not, the preflight succeeds but the browser blocks the
actual request — and the failure surfaces as a generic network error, not a CORS message, which
makes it easy to misdiagnose.

Currently allowed: `Content-Type`, `Authorization`, `x-request-id`, `x-landing-path`.

### 7.4 Full endpoint catalogue
Maintained in **`04_API_DOCUMENTATION.md`**, updated as each endpoint is built.

**Implemented:** `GET /api/health` (development diagnostic) ·
`POST /api/public/early-access` (MKT-01).

---

## 8. State management

**No Redux, no Zustand, no MobX.** Justification, since this is a deliberate omission:

Application state here separates cleanly into three kinds, none of which needs a global store:

| Kind | Handled by | Examples |
|---|---|---|
| **Server state** | Per-feature data hooks in `features/<domain>/hooks/` | Candidates, companies, interests, pipeline, messages |
| **Global client state** | React Context — two providers only | `AuthContext` (session, user), `CompanyContext` (active company + membership) |
| **Local UI state** | `useState` / `useReducer` in the component | Modal open, form drafts, filter panel expansion |

The overwhelming majority is **server state** — data owned by MongoDB, needing fetching,
caching, and invalidation, not global mutation. A Redux store would become a hand-rolled cache
with manual invalidation, which is where this class of bug lives.

Only two values are genuinely global, and both change rarely. Context is the correct tool at
that cardinality.

**Revisit trigger:** if request waterfalls or duplicated fetches become measurable, introduce a
server-state library (TanStack Query) — *not* a global store. That would require a new ADR.

### 8.1 Profile builder draft state (CAN-02)
PRD Appendix C requires *"every answer persists immediately or through reliable draft save."*
The builder autosaves per answer with debounce, optimistic local state, and explicit
save-state indication. It does **not** hold the whole profile in memory and save at the end —
that loses work and conflicts with ADR-008's per-item write model.

---

## 9. Validation strategy

Three layers, deliberately redundant (ADR-009):

| Layer | Where | Purpose |
|---|---|---|
| 1 — Client | Shared Zod schema in the form | Immediate inline feedback (§19.1). **Not a security control** |
| 2 — Server | `validate.js` middleware, *same* schema | The trust boundary. Rejects before any business logic |
| 3 — Database | Mongoose schema + indexes | Last-resort integrity: required fields, enums, uniqueness |

One Zod schema powers layers 1 and 2. Where Zod and Mongoose disagree, **Zod governs the API
boundary and is authoritative**; the divergence is a bug.

Business-rule validation ("can this candidate express interest in this closed intent?" —
PRD §21.5) is **not** schema validation. It lives in the service layer, which is the only layer
with the necessary database context.

---

## 10. Security

Mapped to PRD §16.4.

| Requirement | Implementation |
|---|---|
| Secure password storage | bcrypt, cost ≥ 12 |
| Token expiry / session invalidation | ADR-005; server-side `sessions` allows immediate revocation |
| Rate limiting, brute-force protection | Per-IP and per-account limits on sign-in, verification resend, password reset, messaging (§16.3) |
| Object-level authorization | ADR-006, four layers, fail-closed |
| Encryption in transit | HTTPS enforced; HSTS |
| Secure file storage | Private bucket, time-limited signed URLs, never public paths |
| Secrets management | Environment variables validated at boot; process exits on missing required config |
| Audit logging | `auditEvents` per PRD §14.3 |
| Dependency scanning | `npm audit` in CI |
| MFA | Capability designed for; owner/admin enforcement is a later phase per §16.4 |

**Additional, not explicit in the PRD but required in practice:** Helmet security headers,
strict CORS origin allowlist with `credentials: true` (needed by ADR-005), MongoDB query
sanitisation against operator injection, request body size limits, and file upload type/size
validation with scanning (§16.3).

**Privacy-by-default rules that must never be relaxed without an ADR:**
1. Candidate email and phone are **hidden by default** and never included in search results
   (PRD §7.10, Appendix D).
2. Internal recruiter notes are never serialised into any candidate-visible response
   (PRD §11.2, §21.4).
3. `/api/public/*` cannot import or query any candidate collection (§21.2).

---

## 11. Performance

| Concern | Approach | PRD |
|---|---|---|
| Public page load | SEO Stage 1 metadata injection; compressed images; semantic markup | §17, §19 |
| Search first page | Compound indexes on `facets`; cursor pagination; facet counts computed asynchronously | §10.1, §19 |
| Long result lists | Pagination, then virtualisation if needed | §19 |
| Candidate profile assembly | Parallel reads across split collections (ADR-008), not sequential | §19 |
| Media | Lazy-loaded embeds; never blocking render | §19 |
| Onboarding | Optional enrichment never blocks progression | §19 |
| Bundle size | Route-level code splitting; company workspace never loaded for candidate-only users | §19 |

**Deliberately deferred:** caching layers, CDN configuration, and read replicas. Adding them
before there is measurable load is speculative. Revisit with real pilot numbers.

---

## 12. Accessibility

PRD §19 requires keyboard navigation, visible focus, semantic labels, sufficient contrast,
screen-reader support, error association, and captions/transcripts for media.

Treated as a **component-level obligation**, not an audit at the end. Every primitive in
`components/ui/` ships with correct semantics, keyboard handling, and focus management. Notably
the floating-label input (§19.1) must keep a real `<label>` bound via `htmlFor` — a visual
floating label implemented with a placeholder alone is inaccessible to screen readers, and this
component appears on nearly every screen in the product.

Contrast note: `#0671E0` on white gives roughly 4.7:1 — passing AA for normal text, but **not**
AA for large text used as a subtle accent, and not AAA. Any use of the primary colour for text
needs checking rather than assuming.

---

## 13. Deployment

Deliberately deferred by the CTO. `09_DEPLOYMENT_GUIDE.md` holds the current state.

Architectural constraints already fixed that the eventual deployment must satisfy:
1. Node 18+ with ESM support (ADR-012).
2. `apps/web` and `apps/api` build independently from one repository (ADR-003).
3. `apps/api` must be reachable at a stable origin for cookie `SameSite=Lax` refresh to work —
   API and web should share a registrable domain (e.g. `app.` and `api.` on the same domain),
   otherwise the refresh cookie requires `SameSite=None` and weaker CSRF posture (ADR-005).
4. If MongoDB Atlas is chosen, Atlas Search becomes available and `modules/search` selects its
   Atlas strategy; otherwise it uses aggregation facets (ADR-010). **No other code changes.**
5. Public routes must be served by Express, not a static host, for SEO Stage 1 metadata
   injection and `/sitemap.xml` (ADR-004).

Point 3 is the one worth deciding early — it is cheap now and awkward to change later.

---

## 14. Open technical questions

Tracked from PRD §20.5 and Appendix D. These do **not** block M0 or M1.

| # | Question | Needed by | Current default |
|---|---|---|---|
| Q1 | Atlas or self-hosted MongoDB? | REC-12 (M5) | Design for both (ADR-010) |
| Q2 | File storage provider? | CAN-02 evidence (M3) | Interface defined in `lib/storage.js`; provider TBD |
| Q3 | Transactional email provider? | AUTH-01 (M1) | **Needed early** — interface in `lib/mailer.js` |
| Q4 | Google/Microsoft OAuth app registration | AUTH-13 (M1) | Password auth first; SSO can follow |
| Q5 | Candidate contact visibility default | CAN-04 (M3) | Hidden by default (Appendix D) |
| Q6 | Video provider allow-list beyond YouTube | CAN-02 (M3) | YouTube only (Appendix D) |

**Q3 is the only one that could block M1** and should be resolved before authentication work
begins — email verification is unbuildable without a delivery path.

---

## 15. Scope deltas — where the product has moved past the PRD

Per **ADR-016**, founder-supplied HTML is the newer requirement source and supersedes
`Evallo_Recruit_PRD_v1.pdf` (v1.0, 30 July 2026). This section is the running record of every
place the current design differs from that baseline.

**A delta is recorded, not contested.** The only ones that gate implementation are those that add
a collection, a module, an external dependency, or an authorization path — flagged 🔴 below.

### 15.1 From MKT-01 (`evallo_recruit_marketing.html`)

| # | Delta | PRD baseline | Architectural impact |
|---|---|---|---|
| D-01 🔴 | **Native in-platform assessments** — adaptive digital SAT/ACT testing taken on-platform before applying | §20.3 defers expanded assessments to Phase 2 | **New domain.** `modules/assessments`, item bank, attempt/scoring/proctoring state, anti-cheat, result→evidence linkage. Comparable in size to the candidate profile domain |
| D-02 🔴 | **Company-set video prompts with candidate video responses** | §3.2 non-goal: no native recording/hosting; embeds only | **New media pipeline.** Recording capture, upload, transcode, storage, playback, retention. Adds an external dependency (§14 Q2 becomes urgent) |
| D-03 🔴 | **"Post a Job"** as the primary conversion CTA | §7.5: no mandatory job description; lightweight hiring intent | **New entity.** A `jobPostings` collection alongside `hiringIntents`, plus `JobPosting` structured data currently excluded by §17 |
| D-04 | **"Centralized applicant tracking"** positioning | §20.1 scopes a lightweight pipeline | Low. The planned pipeline (§7.9) largely satisfies this; it is positioning, not a new object |
| D-05 | **Candidate-facing role search** — "Find Teaching Roles" | §8.2 CAN-05 is company-first discovery | Medium. A role-centric browse surface is a new screen, not a new domain. Depends on D-03 |
| D-06 | Marketing landing page owns `/` | Not in Appendix A | Resolved — ADR-013, ADR-015 |
| D-07 | Early-access waitlist capture | Not in §14.1 | Resolved — ADR-014 |
| D-08 | Marketing surfaces: pricing, blog, help centre, guides, about, contact | Not in PRD | Low. Content pages. **Pricing implies a monetisation model the PRD does not define** |
| D-09 | Terms of Service and Privacy Policy pages | §6.2 requires acknowledgement at AUTH-01 | Low technically. The MKT-01 form already claims consent to both, so they are needed **before** that form collects data |
| D-10 | Top-aligned form labels | §19.1 mandates floating labels | Low. **Shipped as top-aligned** per "preserve the UI exactly". Affects the shared `FormField` primitive — resolve before AUTH-01, where §19.1 applies directly |

### 15.3 Implementation status

| Delta | Status |
|---|---|
| D-06 marketing page owns `/` | ✅ Shipped — ADR-015 |
| D-07 early-access capture | ✅ Shipped — ADR-014, `POST /api/public/early-access` |
| D-10 top-aligned labels | ✅ Shipped as-is; decision deferred to AUTH-01 |
| D-01, D-02, D-03, D-05 | Described on the page; **not built, not scheduled** |
| D-04 | Positioning only; planned pipeline covers it |
| D-08, D-09 | Footer links are placeholders. **D-09 (Terms, Privacy) is referenced by the live consent text and needed before the form collects real data** |

### 15.2 Status of the gated deltas

**D-01, D-02, and D-03 are not scheduled and not designed.** Each adds at least one module and one
collection; D-02 also adds an external service dependency. They do not block MKT-01 — the page can
ship describing them — but they must be sequenced into the milestone plan before they are built.

**Awaiting founder decision on:** whether each is MVP or post-MVP, and where it sits relative to
M1–M6. Until then `14_PROGRESS_TRACKER.md` carries them as unscheduled.

None of the three changes any decision already accepted in ADRs 001–015.
