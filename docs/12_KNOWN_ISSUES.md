# 12 — Known Issues & Limitations

**Last updated:** 2026-07-31

> No code exists yet, so there are no bugs. What follows are **known limitations accepted by
> decision** — each traceable to an ADR or a PRD constraint. Recording them now prevents a future
> engineer from mistaking a deliberate trade-off for an oversight and "fixing" it.

---

## 1. Current bugs

*None. No code implemented.*

---

## 2. Accepted limitations

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
