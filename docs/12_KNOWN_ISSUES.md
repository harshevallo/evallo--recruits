# 12 — Known Issues & Limitations

**Last updated:** 2026-08-10 (documentation audit against the working tree)

> Open issues first, then **known limitations accepted by decision** — each traceable to an ADR or
> a PRD constraint. Recording the latter prevents a future engineer from mistaking a deliberate
> trade-off for an oversight and "fixing" it.

---

## 1. Current issues

### I-01 — ~~Integration suites cannot run concurrently~~ RESOLVED 2026-08-10
**Severity:** — · **Resolution:** fixtures namespaced per suite

The prescribed fix was taken: each suite now cleans up only its **own** fixture addresses rather than
issuing an unscoped `deleteMany({})`. Two earlier variants are called out in the suites' own comments
as things not to repeat — the unscoped delete (which signed out every real user in the shared
development database) and a `/@example\.com$/` filter (which still matched every other suite's
fixtures and orphaned their candidate profiles mid-run).

**Verified 2026-08-10:** a single `npm test` runs all 20 files together — **365 tests, 81 suites,
365 pass, 0 fail** — with no per-file invocation and no `--test-concurrency=1`.

One caveat remains: the suites still share one `evallo-recruit` database with development data, so
fixture addresses must stay unique per suite. A new suite that reuses another's email will resurrect
this class of failure.

### I-02 — ~~Google sign-in does not work on localhost~~ RESOLVED 2026-08-04
**Severity:** — · **Resolution:** fixed in `GoogleButton.jsx`

The cause was ours, not Google's. `useGoogleButtonRendered` waited for a non-zero-width `iframe`
inside the container, but GIS renders its button as a `div[role="button"]`; the only iframe it
creates is an auxiliary FedCM frame that is *always* 0×0. The predicate was therefore
unsatisfiable, and after the timeout a fully working button was torn down and replaced by the
disabled fallback — which is why it looked intermittent: whether you saw the button depended
entirely on whether you looked before or after the timer fired.

Two things that looked like evidence but were not. `accounts.google.com/gsi/button` returning
`403` is that same auxiliary frame and does not stop the button rendering. And a server-side
`fetch` with a spoofed `Origin` header proves nothing about origin authorisation — a bare fetch
has no browsing context. The client ID was confirmed valid by loading Google's authorisation
endpoint directly, which returned `200` and "Sign in to continue to Evallo Recruit".

The check now polls for `[role="button"]` with a non-zero width.

### I-06 — Candidate profile arrays are not validated against the taxonomy
**Severity:** Medium · **Workaround:** write through the API, never directly

`candidateProfiles.subjects`, `learnerSegments`, `deliveryModes` and `targetRoles` are bare
`[String]` with no enum. REC-12 validates *input* against the shared taxonomy, so a profile
holding a value outside it — `in_person` instead of `on_site`, say — is accepted on write and then
permanently unfindable by that facet. Found while seeding demo data, which is exactly how it will
be found in production.

The fix is an enum on the model, which is a schema change and was left out of REC-12's scope.

### I-07 — ~~Candidate profile access is not logged~~ RESOLVED 2026-08-10
**Severity:** — · **Resolution:** `modules/audit` shipped with REC-13

`auditEvents` now records `candidate_profile.viewed` with company, user, timestamp and source, and
`candidate_contact.revealed` as its own event carrying the rule that permitted the reveal. A refused
view writes nothing; the log is append-only, so repeat views accumulate. Read back at
`GET /api/companies/:companyId/audit` behind `company:settings`. Four `candidateViewer.test.js` cases
pin the behaviour.

**Superseded by I-08** — the writes happen, but they are not guaranteed.

### I-08 — Audit writes are fire-and-forget
**Severity:** Medium · **Blocks:** treating the audit log as a compliance artefact

`recordAuditEvent()` calls `AuditEvent.create(event).catch(...)` **without `await`**. A failed write
is logged to the app logger and swallowed; the request succeeds regardless, and the caller never
learns the event was lost. The service header states the intent that this becomes an `await` at the
call site without changing shape.

This is acceptable for diagnostics and wrong for compliance: PRD §16.1 treats profile-view and
contact-reveal records as auditable obligations, and an obligation that can silently fail is not
being met. It also makes the four passing audit assertions timing-dependent in principle, since a
read could in theory outrun the un-awaited write.

**Fix:** `await` the write on the paths §16.1 names, and decide explicitly whether a failed audit
write should fail the request.

### I-03 — MongoDB is standalone, so there are no transactions
**Severity:** Medium

`/api/health` reports `supportsTransactions: false`. The four operations listed in
`05_DATABASE_SCHEMA.md` §11 — refresh rotation among them — currently run without atomicity.
Conversion steps are in `08_SETUP_GUIDE.md` §1.

### I-05 — `npm run lint` does not catch missing cross-module exports
**Severity:** Low · **Mitigation:** run `npm run build --workspace=apps/web`

ESLint resolves imports per file, so a symbol imported from a barrel that does not export it lints
clean and then fails at runtime with a blank page. `vite build` catches it. Add the build to any
verification that touches `services/index.js` or another barrel.

### I-04a — CAN-02 covers eight of the PRD's twelve profile sections
**Severity:** Low (was Medium) · **Updated:** 2026-08-10

PRD §8.3 lists twelve sections. The builder now presents **eight display steps**: four question-bank
sections (identity, role preferences, teaching expertise, teaching practice), four evidence-entry
steps (experience, education, credentials, portfolio media — see `05_DATABASE_SCHEMA.md` §8), and
publish/visibility.

**Still outstanding from §8.3:** references (PRD §20.3 defers collection to Phase 2), assessments
(§20.3 Phase 2, TRD §15 D-01, unscheduled), and issuer **verification** of credentials — the
`verificationStatus` field exists on every entry but nothing writes any value other than
`unverified`, so no credential is actually verified today.

The completeness concern in the original entry was addressed: profile strength is derived from the
same `publishBlockers` the publish gate uses, and unanswered optional questions are reported
separately, so an evidence-free profile cannot read "100% complete" as a publish claim.

**Update 2026-08-21 — collected is now also rendered.** A separate and worse problem sat behind
this entry: the builder wrote experience, education, credentials and media to four real
collections, and `toRecruiterView()` reported all four as permanently empty arrays. Every audience
— the candidate's own preview and the recruiter viewer alike — showed "no experience, education,
or credential entries yet" regardless of what had been entered. `portfolio.service.js` now projects
them, so the eight built sections reach a reader. References and assessments remain Phase 2.

### I-04b — ~~Interest statuses never advance past "Submitted"~~ RESOLVED 2026-08-10
**Severity:** — · **Resolution:** REC-11 and REC-15 are both built

`PATCH /api/companies/:companyId/interests/:interestId` advances interest status
(`interestInbox.test.js`, 20 cases), and `POST /api/companies/:companyId/conversations` opens a
thread that appears in the candidate's CAN-09 inbox (`recruiterWorkflow.test.js`). Neither surface
depends on unbuilt work any more.

### I-04 — HOME-01 creates the candidate profile inline
**Severity:** Low · **Partially addressed** 2026-08-10

`AppHomePage.startCandidateProfile()` still calls `POST /api/me/candidate-profile` directly
(`AppHomePage.jsx`). The responsibility sits in the wrong screen: creation belongs to CAN-02.

The user-visible defect that came with it **is** fixed — the handler previously set a success message
and never navigated, so `RequireCandidate` bounced the user straight back and the profile appeared not
to have been created. It now refreshes capabilities and routes to the builder. What remains is
placement, not behaviour.

### I-09 — Talent search sorts and matches on unindexed fields
**Severity:** Medium · **Found:** 2026-08-10 documentation audit

`candidateProfiles` carries exactly two indexes — `{ userId: 1 }` unique and
`{ status: 1, lastActiveAt: -1 }`. REC-12 matches on `status` plus the facet fields and sorts by
`publishedAt`/`createdAt` (`recent`, `newest`) or `user.name` (`name`), none of which those indexes
cover, so the sort runs in memory after the `$match`.

Correct at pilot scale and fine at ~10 k profiles, but it degrades non-linearly and MongoDB hard-fails
an in-memory sort above 32 MB. It also compounds I-10.

**Fix:** compound indexes matching the real match+sort shapes, validated with `explain()` against
seeded volume rather than guessed.

### I-10 — Per-row access resolution in pipeline and messaging lists (N+1)
**Severity:** Medium · **Found:** 2026-08-10 documentation audit

`pipeline.service.js` and `messaging/companyMessaging.service.js` `await candidateCard(...)` **inside**
a `Promise.all` over rows, and each call runs one to three `exists()` queries through
`resolveCandidateAccess`. A 25-row board issues up to ~75 extra round trips, fired concurrently
against a connection pool of **10** (`DB.MAX_POOL_SIZE`), so the pool saturates and requests queue
behind each other.

The pattern to copy already exists in this codebase: `search.service.js` batch-preloads interests and
passes them as `hints`.

**Fix:** batch-preload grants and interests per page and pass hints in; raise `maxPoolSize`.
**Do not** introduce a second access check — `resolveCandidateAccess` must remain the only authority.

### I-11 — Rate limiting is in-memory and keyed by IP
**Severity:** Medium · **Found:** 2026-08-10 documentation audit

`middleware/rateLimit.js` passes neither `store` nor `keyGenerator`, so `express-rate-limit` uses its
defaults: an **in-process** store keyed by **IP**. Two consequences:

- Schools, districts and mobile carriers behind one NAT share a single 300-request/15-min budget, so a
  handful of legitimate users can lock out everyone at that address.
- The store is per-process, so the limit both multiplies by instance count and stops being
  enforceable the moment a second instance runs — which blocks horizontal scaling.

Limiters are skipped when `NODE_ENV=test`, so no suite exercises this.

**Fix:** key by authenticated user with IP as fallback; move the store to Redis.

### I-12 — Notification preferences are stored but never consulted
**Severity:** Medium · **Found:** 2026-08-10 documentation audit

SET-01 persists a per-event × per-channel matrix to `users.notificationPreferences`, and the settings
UI presents it as controlling what the user receives. **Nothing reads it.** No code outside
`settings.service.js` references the field, there is no `notifications` collection, and the only
emails the system sends are the two transactional ones in `lib/email` (verification, password reset).

The screen therefore promises control over notifications that are not generated. Not a data defect —
the preference is stored correctly and will be honoured once delivery exists — but it is a UI claim
ahead of the implementation.

**Fix:** either build M6 notification delivery, or state on the screen that these preferences apply
to notifications not yet enabled.

### I-13 — No test coverage for profile entries or account settings
**Severity:** Medium · **Found:** 2026-08-10 documentation audit

Two shipped endpoint families have **no integration test at all**:

| Untested | Endpoints | Why it matters |
|---|---|---|
| Profile entries (CAN-02 evidence) | `GET`/`POST /api/me/candidate-profile/entries/:kind`, `PATCH`/`DELETE .../:entryId` | Four collections, four body schemas, per-item visibility, the media provider allow-list, **and the rule that `verificationStatus` cannot be forged** — all implemented, none pinned |
| Account settings (SET-01) | all nine `/api/me/settings/*` | Includes password change (session revocation), data export scoping, and deletion blocked while still a company owner — three security-relevant behaviours with no regression guard |

`profileBuilder.test.js` (17 cases) covers the question-bank sections only; no test in the suite
requests either path. Given ADR-002 makes integration tests the substitute for a compiler (L-01),
these are the two places where that substitute is currently absent.

### I-14 — No frontend tests
**Severity:** Low–Medium · **Found:** 2026-08-10 · **Partially addressed:** 2026-08-12

`apps/api/tests/unit/` now holds one suite — `cookies.test.js`, 17 cases pinning the refresh-cookie
policy across every deployment topology. It is a unit test because the decision it covers is pure,
and because the failure it prevents (a wrong `SameSite`) cannot be reproduced by an integration
test that never leaves one origin. The other 402 cases remain integration tests.

`apps/web` still has **no test files of any kind** — no component, hook or route-guard tests.

Frontend correctness is currently verified by `npm run lint`, `vite build`, and ad-hoc
browser-automation scripts that live outside the repository. That has caught real defects — the
sidebar and navigation fixes in `11_CHANGELOG.md`, and on 2026-08-12 a CAN-04 unblock that sent
`company.id` (always `undefined`, so every unblock was a `400`) plus a state update that spread an
array over the state object. Both were invisible to lint and to the build, and both sat in a shipped
screen. None of that automation is committed, so none of it will run again for the next engineer.

**Fix:** commit the browser checks as a runnable suite, or add component tests for the pieces where a
regression is silent — the permission-filtered rail, the route guards, and the builder's section
switching.

### I-15 — File upload and object storage do not exist
**Severity:** Low, by design · **Found:** 2026-08-10 documentation audit

There is no upload endpoint, no multipart handling and no blob store anywhere in the codebase.
Consequently:

- `credentials.documentUrl` accepts a **link the candidate already hosts**; the UI says so rather than
  showing a "PDF uploaded" badge that would be a lie.
- `evidenceItems.url` is restricted to YouTube and Vimeo hosts (`MEDIA_PROVIDERS`).
- `messages.attachments` exists on the model and every serializer emits `[]`, but the field is
  **reserved, not implemented**.

Deliberate — file storage is undecided (TRD §14 Q2, D-02). Recorded so the reserved fields are not
mistaken for working features. Whenever storage is chosen it must be object storage with pre-signed
URLs; serving uploads through the API process is the one choice that would undo the scaling profile
described in I-10 and I-11.
### I-17 — Account deletion never purges anything; the retention policy is undecided
**Severity:** High (compliance) · **Found:** 2026-08-12 production-readiness pass

`POST /api/me/settings/delete` marks the account `deletion_pending`, revokes its sessions, and
stops both sign-in paths. **Nothing then processes that queue**, so a deletion request is honoured
as a permanent lock-out while the data is retained indefinitely. PRD §16.1 requires deletion to be
designed in; `05_DATABASE_SCHEMA.md` §11 and ADR-014 both state that a retention policy is required
before pilot launch, and backlog **B-09** ("Account deletion and anonymisation workflow") is
unbuilt.

Three questions have no answer in any product document, and each is a decision, not an
implementation detail:

1. **How long** is a `deletion_pending` account retained before it is processed?
2. **Which records are anonymised versus removed?** `users.deletedAt` is documented as
   "anonymisation, not removal", and §16.1 requires an audit trail that survives — but the
   field-level policy is unwritten.
3. **What happens to records another party owns** — a company's interest inbox, a conversation the
   company also participated in, pipeline entries and recruiter notes about the person?

**What was built instead** (2026-08-12): `src/jobs/` now exists — a small in-process runner plus
`account-deletion-review`, which every six hours reports the queue (how many accounts are waiting,
how long the oldest has waited, how many would be eligible under a given period) and **deletes
nothing**. `ACCOUNT_DELETION_RETENTION_DAYS` is deliberately unset, and setting it still does not
enable a purge — there is no purge pass to enable. `accountDeletion.test.js` asserts `purged === 0`
and that an eligible account still exists afterwards, so the day someone implements the purge, the
test that fails is the one that says "this was a deliberate decision".

**Owner: founder + legal.** Until (1)–(3) are answered, the product accepts deletion requests it
does not fulfil, which is a GDPR/DPDP exposure rather than a backlog item.

### I-16 — ~~Ten marketing/legal routes are still placeholders~~ PARTIALLY RESOLVED 2026-08-12
**Severity:** Low, except for the legal dependency · **Verified:** 2026-08-12

`COMPANY_PLACEHOLDERS` is **empty** — no feature route is a placeholder, and every company-scoped
screen the app links to is real. Eight marketing routes remain content placeholders:

`/pricing` · `/assessments` · `/help` · `/guides` · `/blog` · `/research` · `/about` · `/contact`

Each renders `PlaceholderPage`, which names what will replace it and offers a **context-aware** way
back (company home inside a company, app home when signed in, marketing home otherwise) rather than a
dead end. Nothing is a fake control.

**`/terms` and `/privacy` are no longer placeholders.** They are real routes rendering
`LegalDocumentPage` from `apps/web/src/content/legal/`, with the document structure, headings,
contents list and effective date already implemented. Publishing the approved text is a change to
the content module only — no code change, no new route, and every existing link keeps working.

**The compliance exposure is unchanged and still owned by the founder (D-09).** The pages carry a
`pending_approval` status and say so plainly; no draft or example legal language was invented. The
sign-up and early-access forms still claim consent to documents that have not been published, and
that gap closes only when approved text arrives.
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

### L-04 — ~~`CandidateProfile.facets` can drift from its source collections~~ CORRECTED 2026-08-10
**Source:** ADR-008 · **Severity:** — · **Status:** describes something that was never built

This entry described a denormalized `facets` subdocument, recomputed by
`refreshCandidateFacets(candidateId)`, as "the only shape talent search queries".

**Neither exists in the codebase.** There is no `facets` field on `candidateProfiles` and no
`refreshCandidateFacets` function anywhere. REC-12 shipped querying the profile's flat fields
(`targetRoles`, `subjects`, `learnerSegments`, `employmentTypes`, `deliveryModes`, `availability`,
`yearsExperience`) directly, joining `users` for country, language and region.

There is therefore **no derived copy and no drift risk** — the highest-severity entry in this
document was describing a design that was superseded before it was implemented. Verified against
`candidates/candidateProfile.model.js` and `modules/search/search.service.js`. Corresponding
correction in `14_PROGRESS_TRACKER.md` (TD-04) and `05_DATABASE_SCHEMA.md` §8.

**Two real gaps replace it:** the fields are unvalidated (I-06) and the query shape is unindexed
(I-09).

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

### L-08 — Anonymous share-link views are not in the audit log
**Source:** ADR-019 · **Severity:** Low · **Added:** 2026-08-21

PRD §21.4 requires the source of every candidate-profile access to be logged. `GET
/api/portfolio/:token` does not write an `auditEvents` row, because `actorUserId` is a required
field on that model and a share-link holder has no account.

Writing the **candidate's own** id as the actor was considered and rejected: it would put a false
entry into the one log §21.4 exists to make trustworthy, which is worse than an honest gap. Views
are written to the request logger (`shared portfolio viewed`, with referrer) instead.

Low severity because the disclosure is one the candidate deliberately made and can revoke at any
moment — unlike a recruiter view, which happens without their involvement and is therefore the
case §21.4 is actually written about.

**Exit:** make `actorUserId` nullable and add an `anonymous_share` actor type, or add a
`portfolioViews` collection if the candidate should see view counts. Neither is worth doing before
someone asks for the data.

---

### L-09 — `noindex` on the share page is client-side only
**Source:** ADR-019, ADR-004 · **Severity:** Low · **Added:** 2026-08-21

`apps/web` is a static SPA served by Vercel (`vercel.json` rewrites everything to `index.html`).
ADR-004's Stage 1 Express metadata injection is still **Proposed** and was never built, so there is
no server able to put a per-page `<meta name="robots">` into the initial HTML. `/p/:token` sets it
from JavaScript on mount.

Three things make this acceptable rather than a defect:

1. The API answers with `X-Robots-Tag: noindex, nofollow, noarchive`, which is a header and needs no
   rendering.
2. `apps/web/public/robots.txt` disallows the whole `/p/` prefix.
3. The URL contains 256 bits of secret. A crawler that does not execute JavaScript also has no way
   to *discover* the address.

**Related, and deliberately not a limitation:** the Open Graph tags on a share page are generic
("A teaching portfolio on Evallo Recruit") and carry no name or headline. Social crawlers do not
execute JavaScript, so anything person-specific there would be rendered in a group chat *before*
anyone chose to open the link. That is a privacy decision, not something to fix when SSR lands.

**Exit:** implementing ADR-004 Stage 1 would let the shell carry the tag — and would still leave
the OG decision exactly as it is.

---

## 3. Temporary fixes

*None.*

---

## 4. Future improvements

Tracked in `13_BACKLOG.md`.
