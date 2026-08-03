# 12 — Known Issues & Limitations

**Last updated:** 2026-08-03

> Open issues first, then **known limitations accepted by decision** — each traceable to an ADR or
> a PRD constraint. Recording the latter prevents a future engineer from mistaking a deliberate
> trade-off for an oversight and "fixing" it.

---

## 1. Current issues

### I-01 — Integration suites cannot run concurrently
**Severity:** Medium · **Workaround:** run one file at a time

Every suite points at the same remote `evallo-recruit` database and clears collections in
`beforeEach`. Node's test runner parallelises across files by default, so two suites clobber each
other's fixtures and fail non-deterministically. Each file passes in isolation.

**Fix:** run with `--test-concurrency=1`, or namespace fixtures per suite so they cannot collide.
Related: the suites call `Session.deleteMany({})` unscoped, which signs out every real user in the
shared development database.

### I-02 — Google sign-in does not work on localhost
**Severity:** Low · **Workaround:** use email authentication

Google's `gsi/status` returns `403` for `http://localhost:3001` unless the origin is registered as
an authorised JavaScript origin in the Google Cloud console. The client detects the resulting
zero-size iframe and unmounts it, so it never becomes an invisible focusable tab stop, and shows a
disabled fallback instead.

### I-03 — MongoDB is standalone, so there are no transactions
**Severity:** Medium

`/api/health` reports `supportsTransactions: false`. The four operations listed in
`05_DATABASE_SCHEMA.md` §11 — refresh rotation among them — currently run without atomicity.
Conversion steps are in `08_SETUP_GUIDE.md` §1.

### I-04a — CAN-02 covers four of the PRD's twelve profile sections
**Severity:** Medium

PRD §8.3 lists twelve sections. The seeded bank covers 1–3 plus teaching practice. Sections 4–11
are the **evidence layer**: ADR-008 gives each its own collection with per-item visibility and
verification state, which no single form captures, and PRD §20.3 already defers reference
collection and issuer verification to Phase 2.

Because the bank is database configuration, adding them is a new bank version rather than a code
change. **The completeness indicator must be extended in the same change**, or a profile with no
experience or credentials will read "100% complete" — which is misleading rather than merely
incomplete.

### I-04b — Interest statuses never advance past "Submitted"
**Severity:** Low, by design

CAN-08 shows every interest at `submitted`, because the later statuses are set by the recruiter's
interest inbox (REC-11), which is not built. The screen says so explicitly rather than implying
the company has ignored the candidate. Likewise CAN-09's inbox stays empty until REC-15 can open a
thread.

### I-04 — HOME-01 creates the candidate profile inline
**Severity:** Low

"Start your candidate profile" calls `POST /api/me/candidate-profile` directly. Creation belongs
to CAN-02; when that screen exists, HOME-01's action should route to it instead. Behaviour is
correct today — nothing is created without an explicit click — but the responsibility sits in the
wrong screen.

---

## 2. Accepted limitations

---

### L-01 — No compile-time type safety
**Source:** ADR-002 (CTO decision) · **Severity:** Medium

The stack is JavaScript, so the compiler cannot catch a mismatch between a Mongoose model, an
API response, and a React prop. Given PRD §12 defines ~200 candidate fields across 12 sections
and PRD §20.2 guarantees schema churn as role modules expand, refactors carry real risk.

**Compensating controls — mandatory, not optional:** shared Zod schemas as the single contract
(ADR-009) · JSDoc typedefs on all shared schemas · exported constants instead of string literals ·
integration tests on every API route.

**Do not treat these as nice-to-haves.** They are the substitute for the compiler.

---

### L-02 — SEO indexing latency accepted during pilot
**Source:** ADR-004 Stage 1 · **Severity:** Low, but **unowned**

Public company page **bodies** are client-rendered. Googlebot executes JavaScript, so content
will be indexed, but via a deferred render pass that can delay indexation. Titles, descriptions,
canonicals, OG tags, and JSON-LD are server-injected, so SERP snippets and social link previews
are unaffected.

**Trigger for escalation to full SSR:** the exit criteria in ADR-004 — pages stuck at
"Crawled/Discovered — currently not indexed" beyond ~2 weeks, main content missing from URL
Inspection's rendered HTML, or field LCP above ~2.5 s attributable to client rendering.

⚠️ **This has no named owner.** The criteria are only useful if somebody checks them. Assign an
owner when PUB-02 ships, or this decision silently defaults to "do nothing forever."

---

### L-03 — Question bank has no admin interface
**Source:** ADR-007 · **Severity:** Medium

Candidate profile questions are versioned database configuration, so adding a role no longer
requires a frontend deploy — but in MVP the bank is edited only through seed scripts. Any
non-engineer wanting to reword a question must ask an engineer.

**Improvement:** an internal question-bank editor. Tracked in `13_BACKLOG.md`.

---

### L-04 — `CandidateProfile.facets` can drift from its source collections
**Source:** ADR-008 · **Severity:** **High** — the most dangerous known limitation

`facets` is denormalized from `experiences`, `credentials`, `candidateAnswers`, and others, and
is the **only** shape talent search queries. Any code path that writes candidate data without
calling `refreshCandidateFacets(candidateId)` silently corrupts search results — the candidate
becomes invisible, or visible under wrong criteria, with **no error anywhere**.

**Mitigations, all required before M5:**
1. Exactly one function performs the refresh; no ad-hoc facet writes anywhere.
2. Every mutating candidate service path calls it — verified by test, not by convention.
3. A reconciliation script can rebuild all facets from source; run it after any bulk migration.

This is the limitation most likely to cause a silent production defect. Treat any facet write
outside `refreshCandidateFacets` as a bug in review.

---

### L-05 — Search relevance is weaker than a dedicated engine
**Source:** ADR-010 (CTO constraint) · **Severity:** Low

MongoDB provides the text search and faceting. Relevance ranking is less sophisticated than a
tuned search engine, and facet counts over large result sets cost more.

Low severity because PRD §10.3 explicitly discourages implying objective quality ranking, and
PRD §10.1 makes structured filters — not relevance scoring — the source of truth. Compound index
design is where the real performance work lives.

---

### L-06 — Local development diverges from production without a replica set
**Source:** `05_DATABASE_SCHEMA.md` §11 · **Severity:** Medium

Four operations require multi-document transactions: interest submission, refresh-token rotation,
ownership transfer, and company publish. A standalone `mongod` does not support them, so these
paths behave differently locally than in production — the worst kind of divergence, because it
only appears under failure conditions.

**Mitigation:** `08_SETUP_GUIDE.md` §1 mandates a single-node replica set locally. This is easy
to skip and expensive to debug later.

---

### L-07 — Modular monolith, single process
**Source:** `03_TRD.md` §1 · **Severity:** Low

One Express process serves public pages, the authenticated API, and eventually search. A
long-running search query can affect public page latency.

Appropriate for a limited pilot (PRD §20). Module boundaries (ADR-011) already exist should
extraction become warranted. **Do not pre-emptively split this** — that trade would add
distributed-system cost for load that does not yet exist.

---

## 3. Temporary fixes

*None.*

---

## 4. Future improvements

Tracked in `13_BACKLOG.md`.
