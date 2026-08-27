# 05 — Database Schema

**Database:** MongoDB · **ODM:** Mongoose · **Sole datastore and sole search engine** (ADR-010)

> **Detail level.** Collections needed for milestones M0–M2 are specified in full. Later
> collections are defined structurally — relationships, key fields, and the constraints that
> follow from the PRD — and will be completed as they are built. Fabricating exact field lists
> for unbuilt features produces documentation that is wrong on arrival.
>
> **This document must be updated in the same commit as any schema change.**

---

## 1. Collection map

```
users ──1:1── candidateProfiles ──1:N── experiences
  │                    │         ──1:N── educationEntries
  │                    │         ──1:N── credentials
  │                    │         ──1:N── evidenceItems
  │                    │         ──1:N── references
  │                    │         ──1:N── candidateAnswers ──N:1── questionBanks
  │                    │
  │                    └──1:N── accessGrants ──N:1── companies
  │
  ├──1:N── authSessions
  ├──1:N── verificationTokens
  ├──1:N── companyJoinRequests ──N:1── companies
  └──1:N── companyMembers ──N:1── companies ──1:N── hiringIntents
                                          │       ──1:N── interests
                                          │       ──1:N── pipelineEntries
                                          │       ──1:N── savedCandidates
                                          │       ──1:N── conversations ──1:N── messages
                                          │       ──1:N── savedSearches
                                          │       ──1:N── notes
                                          └──1:N── companyRevisions

auditEvents · notifications · reports    (cross-cutting, reference many collections)
```

### Built vs specified

The map above is the target shape. What exists in the codebase today:

| Built | Specified, not built |
|---|---|
| `users` · `authSessions` · `verificationTokens` · `companies` · `companyRevisions` · `companyMembers` · `companyJoinRequests` · `hiringIntents` · `candidateProfiles` · `candidateAnswers` · `questionBanks` · `experiences` · `educationEntries` · `credentials` · `evidenceItems` · `savedCompanies` · `interests` (`expressionsOfInterest`) · `accessGrants` · `pipelineEntries` · `savedCandidates` · `conversations` · `messages` · `notes` · `auditEvents` · `earlyAccessRequests` | `references` · `savedSearches` · `notifications` · `reports` |

**25 collections built, 4 outstanding.** `companyMembers` doubles as the invitation record
(`status: 'invited'`) — there is no separate `invitations` collection.

### Naming conventions
- Collections: plural camelCase — `candidateProfiles`, `companyMembers`
- Foreign keys: `<singular>Id` — `userId`, `companyId`
- Timestamps: `createdAt` / `updatedAt` via `{ timestamps: true }` on every schema
- Soft delete: `deletedAt` where PRD retention rules apply; never a hard delete on
  candidate or audit data

---

## 2. `users`

The global human identity. **Contains no role field** — see ADR-001, which is the single most
consequential schema decision in the project.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| Field | as built | Type | Req | Notes |
|---|---|---|:--:|---|
| `_id` | ✅ | ObjectId | ✅ | |
| `email` | ✅ | String | ✅ | Lowercased, trimmed. **Unique** |
| `emailVerified` | ✅ | Boolean | | `false` until AUTH-03. Gates almost everything. *(Implemented as a boolean, not the `emailVerifiedAt` date this document originally specified.)* |
| `passwordHash` | ✅ | String | | bcrypt cost 12. `select: false`. Absent until AUTH-03, and for social-only accounts |
| `name` | ✅ | String | | Collected at AUTH-04, never at sign-up (PRD §21.1). *(Named `name`, not `fullName`.)* |
| `profilePicture` | ✅ | String | | Optional, deferred (PRD §6.2). *(Named `profilePicture`, not `photoUrl`.)* |
| `provider` | ✅ | String | | How the account was first created: `password \| google \| microsoft` |
| `googleId` / `microsoftId` | ✅ | String | | Provider's stable id, for lookup. Never a provider token |
| `platformRole` | ✅ | String | | `member \| support \| admin`. **Evallo staff access only** — not an application role, and not what ADR-001 forbids |
| `headline` | ✅ | String | | Personal layer, distinct from candidate headline |
| `location` | ✅ | Object | | `{ country, region, city, timezone }`. Written by the CAN-02 builder through the **`user`** answer target — PRD §8.5 makes country and time zone required for publication. `city` is captured only for on-site/hybrid candidates (Appendix C) |
| `languages` | ✅ | [String] | | Teaching languages. Also written by CAN-02 via the `user` target |
| `failedLoginAttempts` / `lockUntil` | ✅ | Number / Date | | Per-account throttling (AUTH-10). Both reset on a successful sign-in |
| `onboardingCompletedAt` | ✅ | Date | | AUTH-05 first-action router has been seen. **Not a role and not a capability** — just "has this screen been shown" |
| `status` | ✅ | String | ✅ | `active \| suspended \| deletion_pending \| deleted` (PRD §14.2) |
| `lastLoginAt` | ✅ | Date | | |
| `deletedAt` | ✅ | Date | | Anonymisation, not removal (PRD §16.1) |
| `phone` | ✅ | String | | Account-level contact number, added by SET-01. **Account identity, not profile content** — never returned on a recruiter-facing surface; what a company sees is decided by the candidate's own `contactVisibility` rules, and this field is not on that path |
| `notificationPreferences` | ✅ | Mixed | | SET-01. A map keyed by event, each `{ email, inApp }`. `Mixed` with `default: undefined` so absent keys fall back to the service defaults and a new event type needs no migration. The service **refuses to write** a preference for `security` events (PRD §15: security notices cannot be disabled) rather than storing one that would be ignored. **Stored only — nothing reads these to decide whether to send anything** (see `12_KNOWN_ISSUES.md`) |
| `deletionRequestedAt` | ✅ | Date | | Set when the person asks for deletion (SET-01 → Your data). The account is retained until processed; `status` moves to `deletion_pending` |
| `authMethods` | ⏳ | [Object] | | Multi-provider linking. Superseded for now by `provider` + `googleId`/`microsoftId`; needed for AUTH-13 |

**Indexes** (as built)
```js
{ email: 1 }                    // unique
{ googleId: 1 }                 // unique, partialFilterExpression: { googleId: { $type: 'string' } }
{ microsoftId: 1 }              // unique, same partial filter
{ status: 1, createdAt: -1 }    // admin/ops listing
```

**Partial, not sparse.** A sparse unique index still indexes `null`, so every password account —
all of which have no `googleId` — would collide with every other. `partialFilterExpression` on
`$type: 'string'` excludes them entirely. This was a real outage during AUTH-01.

**Constraints**
- `email` unique — **the** guard against the duplicate-account failure in PRD §6.4 and AUTH-13.
- An `active` account must have either a `passwordHash` or a linked social identity.
- **No `role` field. Ever.** Adding one silently breaks ADR-001, ADR-006, and PRD §21.6.

**Sample**
```json
{
  "_id": "66aa1f2c9d3e4b0012f8a101",
  "email": "priya.raman@example.com",
  "emailVerifiedAt": "2026-07-30T09:14:22.000Z",
  "passwordHash": "$2b$12$…",
  "fullName": "Priya Raman",
  "location": { "country": "IN", "city": "Bengaluru", "timezone": "Asia/Kolkata" },
  "languages": ["en", "ta", "hi"],
  "authMethods": [{ "provider": "password", "linkedAt": "2026-07-30T09:15:01.000Z" }],
  "status": "active",
  "createdAt": "2026-07-30T09:12:00.000Z"
}
```

---

## 3. `authSessions`

Backs refresh-token rotation and reuse detection (ADR-005).

> **The collection is `authSessions`, not `sessions`.** The MongoDB host is shared with the main
> Evallo platform, whose `sessions` collection holds tutoring sessions. Using that name here would
> have merged two unrelated datasets — and the TTL index this collection needs would have deleted
> the platform's rows. Never rename it back. Its existence is what makes
"recruiter removed from company loses access immediately" (PRD §21.6) achievable.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `_id` | ObjectId | ✅ | The `sessionId` in the access-token payload |
| `userId` | ObjectId → users | ✅ | |
| `familyId` | ObjectId | ✅ | Shared across a rotation chain. Reuse revokes the whole family |
| `refreshTokenHash` | String | ✅ | SHA-256. **The raw token is never stored** |
| `expiresAt` | Date | ✅ | TTL index |
| `revokedAt` | Date | | |
| `revokedReason` | String | | `rotated \| logout \| reuse_detected \| password_change \| admin` |
| `replacedBy` | ObjectId → authSessions | | Rotation chain link |
| `ttlDays` | Number | | Set to `1` for a "remember me: no" sign-in; carried across rotations so a short session is never upgraded (AUTH-10) |
| `userAgent`, `ip` | String | | Suspicious-login monitoring (PRD §16.4) |

**Indexes**
```js
{ refreshTokenHash: 1 }              // unique — the lookup path
{ userId: 1, revokedAt: 1 }          // "sign out all sessions" (AUTH-12)
{ familyId: 1 }                      // family-wide revoke on reuse
{ expiresAt: 1 }                     // TTL, expireAfterSeconds: 0
```

**Reuse detection.** Presenting a token whose session is already `rotated` means the token
leaked. Revoke every session sharing `familyId` and write an audit event. This is the
detection mechanism ADR-005 depends on; without the `familyId` index it does not work.

---

## 4. `verificationTokens`

One collection for email verification, password reset, and company invitations — identical
lifecycle, differing only by `purpose`.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `tokenHash` | String | ✅ | Raw token only ever exists in the email |
| `purpose` | String | ✅ | `email_verification \| password_setup \| password_reset \| company_invitation` |
| `userId` | ObjectId | | Absent for invitations to unregistered emails |
| `email` | String | ✅ | |
| `payload` | Object | | Invitation: `{ companyId, role }`. Signup: `{ returnTo, companyId, hiringIntentId, source }` |
| `expiresAt` | Date | ✅ | TTL index |
| `consumedAt` | Date | | Single use |
| `attempts` | Number | | Rate limiting (PRD §16.4) |

**Indexes**
```js
{ tokenHash: 1 }                              // unique
{ email: 1, purpose: 1, createdAt: -1 }       // resend cooldown (AUTH-02)
{ expiresAt: 1 }                              // TTL
```

**Why `payload` carries `returnTo`:** PRD §9.2 and §21.5 require an anonymous visitor's
company/role intent to survive sign-up. Verification links are frequently opened in a
different browser from the one that started the flow, so client storage cannot carry it. The
intent must travel with the token.

**`password_setup` (AUTH-03).** Issued by `POST /auth/verify-email` when the account has no
credential yet, with a **30-minute** TTL rather than the 24 hours a verification link gets. It is
the only thing that authorises `POST /auth/set-password`, which is how a password can be created
exactly once, only by whoever opened the emailed link, and without a session existing first.

**Constraints** — issuing a `password_reset` invalidates all prior unconsumed reset tokens for
that user (PRD §6.3, AUTH-12). Consuming an `email_verification` token likewise invalidates every
other outstanding verification token for that account.

---

## 5. `companies`

Public, indexable organisation profile (PRD §7.4, §13).

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `name` | String | ✅ | |
| `legalName` | String | | |
| `slug` | String | ✅ | **Unique.** Public URL. Redirect history preserved (PRD §17) |
| `slugHistory` | [Object] | | `{ slug, changedAt }` — 301s after a slug change |
| `organizationType` | String | ✅ | Taxonomy-linked |
| `status` | String | ✅ | `draft \| published \| paused \| archived` (PRD §14.2) |
| `moderationStatus` | String | | Overlays `status`; independent (PRD §9.3) |
| `website`, `foundingYear`, `sizeRange` | mixed | | `sizeRange` is a display band from `COMPANY_SIZE_OPTIONS`; deliberately **not** an enum on the model — nothing queries it, and an enum would fail any pre-existing value on its next save |
| `verifiedDomains` | [Object] | | `{ domain, verifiedAt, method }` (PRD §16.2) |
| `logoUrl`, `coverImageUrl`, `tagline` | String | | Logo or generated initials required to publish |
| `description` | Object | | `{ short, full, mission, values, culture, philosophy }` |
| `location` | Object | ✅ | Headquarters `{ country, region, city, timezone }` |
| `locations` | [Object] | | Additional offices |
| `serviceRegions`, `deliveryModes` | [String] | | |
| `educationServices` | [String] | ✅ | ≥ 1 required to publish (PRD §7.3) |
| `subjects`, `tests`, `curricula`, `gradeBands`, `learnerPopulations` | [String] | | Taxonomy-linked, drives discovery |
| `learnerSegments` | [String] | | **Enum** `LEARNER_SEGMENT_VALUES` — the same vocabulary `candidateProfiles.learnerSegments` uses, so "teaches SEN learners" is matchable across both sides rather than being two unrelated strings |
| `metrics` | [Object] | | `{ value, label }`, max 4. Self-reported trust figures rendered on the profile. Both halves free text — a tutoring business measures score uplift, a school measures ratio, and an enum here would produce blanks or lies. **Unverified: they feed no search, ranking, or facet** |
| `pullQuote` | Object | | `{ text, attribution }`. Clearing `text` clears the whole object — an attribution with no quote is not a quote |
| `perks` | [String] | | Max 12, each ≤ 80 chars. What the company offers educators |
| `isCurrentlyHiring` | Boolean | | Hiring activation event (PRD §3.3) |
| `acceptsGeneralInterest` | Boolean | | Allows interest with no active intent (PRD §9.3) |
| `seo` | Object | | `{ title, description, ogImageUrl, canonicalUrl }` (PRD §17) |
| `trust` | Object | | Accreditations, awards, memberships |
| `publishedAt`, `archivedAt` | Date | | |

**Indexes**
```js
{ slug: 1 }                                              // unique — public page lookup
{ "slugHistory.slug": 1 }                                // 301 redirects
{ status: 1, isCurrentlyHiring: 1, updatedAt: -1 }       // PUB-01 directory
{ status: 1, organizationType: 1, "location.country": 1 } // directory filters
{ educationServices: 1, subjects: 1 }                    // discovery facets
{ name: "text", "description.short": "text" }            // directory keyword search
```

**Constraints**
- Publishing requires: name, slug, organizationType, location, logo-or-initials, tagline,
  short description, ≥ 1 education service (PRD §7.3).
- `metrics`, `perks`, `pullQuote` are free text with **no** taxonomy behind them, so their bounds
  are applied on write in `saveCompanyStep` (`COMPANY_CONTENT_LIMITS`) rather than by the schema.
  A limit that exists only in the wizard's own controls is not a limit.
- `isCurrentlyHiring: true` requires ≥ 1 `active` hiring intent (PRD §7.3, §21.2).
- Only `status: 'published'` documents are readable by `modules/public` or appear in
  `/sitemap.xml` (PRD §9.3, §17).
- Those publishing requirements are enforced **server-side at publish time**, not per field.
  The REC-02 wizard writes partial drafts on purpose: a half-finished company is a legitimate
  stored state, and only `POST /publish` refuses.
- **Nothing in REC-07 … REC-12 added a field or an index to any collection.** The two partial
  unique indexes on `companyMembers` were already in place and are what make invitations
  duplicate-proof and memberships single.
- **The REC-02 wizard added no field to this collection.** Its three steps (basics, brand,
  footprint) map onto columns that already existed; the wizard is a grouping of existing fields,
  not a schema change. `publishedAt` records the first publication and survives unpublish, so a
  republished company keeps its original date.

---

## 6. `companyMembers`

**The authorization spine.** Every recruiter permission in the system resolves through this
collection on every request (ADR-006).

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `userId` | ObjectId → users | ✅ | |
| `companyId` | ObjectId → companies | ✅ | |
| `role` | String | ✅ | `owner \| admin \| recruiter \| hiring_manager \| viewer` (PRD §4.2) |
| `status` | String | ✅ | `invited \| active \| suspended \| removed` (PRD §14.2) |
| `permissionOverrides` | [String] | | Explicit grants beyond role, e.g. delegated `company:transfer` |
| `showOnPublicTeam` | Boolean | | Opt-in only — PRD §7.4 requires member consent |
| `invitedBy`, `invitedAt`, `acceptedAt`, `removedAt` | mixed | | Audit trail |

**An invitation is a row in this collection, not a separate one.** A pending invite is a
`companyMembers` document with `status: 'invited'`; accepting it (REC-01) flips the same document
to `active` and stamps `acceptedAt`. There is no invitations collection to reconcile, and the
membership a recruiter ends up with is literally the record they were invited by. Declining sets
`removed`. Creating invitations (REC-07) writes the same row with `status: 'invited'`.

**No collection was added for any REC-07 … REC-12 screen.** Team management, ownership transfer,
the company dashboard, the interest inbox and talent search are all reads and status changes over
collections that already existed — `companyMembers`, `expressionsOfInterest`, `hiringIntents`,
`candidateProfiles`, `accessGrants`.
| `assignedIntentIds` | [ObjectId] | | Scopes `hiring_manager` to assigned intents (PRD §4.2) |

**Indexes**
```js
{ userId: 1, companyId: 1 }              // unique — one membership per user per company
{ userId: 1, status: 1 }                 // company switcher (PRD §5.2)
{ companyId: 1, status: 1, role: 1 }     // team management (REC-18)
{ companyId: 1, role: 1 }                // owner-count enforcement
```

**Constraints**
- Unique on `{ userId, companyId }`.
- **At least one `active` owner per company at all times** (PRD §4.2). Enforced in
  `membership.service` — removing or demoting the last owner must fail. This cannot be
  expressed as a Mongoose validator and needs a service-level guard plus a test.
- `status: 'removed'` documents are **retained, not deleted** — PRD §21.6 requires the audit
  trail to survive removal.

**The first index is on the hot path of nearly every authenticated request** and is not
optional for performance.

---

## 7. `hiringIntents`

Lightweight hiring declaration. PRD §7.5 is explicit that **no job description is required**.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `companyId` | ObjectId → companies | ✅ | |
| `status` | String | ✅ | `draft \| active \| paused \| closed \| archived` |
| `roleCategories` | [String] | ✅ | ≥ 1. Taxonomy-linked (PRD §8.4) |
| `specializations` | Object | | `{ subjects, tests, gradeBands, curricula, counselingAreas }` |
| `employmentTypes` | [String] | ✅ | full_time, part_time, contract, freelance, internship, substitute, seasonal, volunteer |
| `deliveryModes` | [String] | ✅ | on_site, remote, hybrid |
| `locations` | [Object] | | `{ country, region, city, timezones, relocationExpected }` |
| `experienceLevels` | [String] | | entry, early_career, experienced, senior_lead |
| `minYears` | Number | | Optional |
| `availability` | Object | | `{ type, targetStartMonth }` |
| `compensation` | Object | | `{ min, max, currency, period, visibility }` — optional (PRD §7.5) |
| `description` | String | | **Optional.** Enforcing this would violate PRD §7.5 |
| `interestQuestions` | [Object] | | **Max 3** (PRD §7.5, §8.7) |
| `closedAt`, `closedReason` | mixed | | |

**Indexes**
```js
{ companyId: 1, status: 1 }                              // REC-16
{ status: 1, roleCategories: 1 }                         // discovery
{ status: 1, "specializations.subjects": 1, deliveryModes: 1 }
```

**Constraints**
- `interestQuestions.length <= 3` — a hard product rule, not a suggestion.
- Only `status: 'active'` accepts new role-specific interest (PRD §21.5); a closed intent must
  return an informative alternative rather than a bare error.
- Closing an intent **preserves** its pipeline entries and analytics (PRD §11.4).

---

## 8. Candidate collections — M3

Split across collections per **ADR-008**. Full field specification lands with M3; the
structure and the reasons behind it are fixed now.

### `candidateProfiles` — **built**

Core identity, work preferences, and visibility state, plus the structured answers CAN-02 writes.
Search filters on these fields directly, because an answer document cannot be indexed usefully.

```js
targetRoles: [String], subjects: [String], learnerSegments: [String],
employmentTypes: [String], deliveryModes: [String], availability: String,
yearsExperience: Number, bankVersion: Number
```

#### Share link — **built 2026-08-21** (ADR-019)

```js
shareToken:           { type: String, select: false },   // 32 random bytes, base64url
shareEnabled:         { type: Boolean, default: false },
shareTokenCreatedAt:  Date
```

Three fields rather than one, and each shape is a containment decision:

- **`select: false`** — the secret is never returned by an ordinary query, so a handler that
  forgets to project cannot leak it. Even the owner's own share endpoint must ask for it by name.
- **`shareEnabled` separate from the token's existence** — turning sharing off is one write and
  cannot half-apply.
- **Revocation `$unset`s the token** rather than flagging it, so a rotated or disabled link becomes
  *unresolvable* rather than merely refused. There is no window in which a withdrawn link still
  identifies a profile.

Indexes **as built** (`candidates/candidateProfile.model.js`):
```js
{ userId: 1 }                       // unique — one profile per user (PRD §4.1, Appendix D)
{ status: 1, lastActiveAt: -1 }
{ shareToken: 1 }                   // unique, partialFilterExpression: { shareToken: { $type: 'string' } }
```

The share index is **partial, not sparse**. A sparse unique index still collides on repeated
`null` — which is exactly what a revoked token would write if revocation set `null` instead of
unsetting. The partial filter restricts uniqueness to documents where the field is actually a
string, so any number of profiles may have no link at all.

#### ⚠️ The `facets` subdocument was never built — REC-12 queries these fields directly

Earlier revisions of this document specified a denormalized `facets` subdocument as "the only
shape talent search queries", recomputed by `refreshCandidateFacets(candidateId)`.

**Neither exists in the codebase.** There is no `facets` field on `candidateProfiles` and no
`refreshCandidateFacets` function anywhere. `modules/search/search.service.js` matches the flat
fields above (`targetRoles`, `subjects`, `learnerSegments`, `employmentTypes`, `deliveryModes`,
`availability`, `yearsExperience`) and `$lookup`s `users` for `country`, `language` and `region`,
which live on the personal layer (§2).

Consequences, both real:

- **The drift risk that TD-04 and L-04 describe does not apply.** There is no derived copy to fall
  out of step with its source. Those entries are corrected in `14_PROGRESS_TRACKER.md` and
  `12_KNOWN_ISSUES.md` rather than left describing a phantom.
- **The indexes that would serve the real query shape are missing.** Search matches on
  `status` + facet fields and sorts on `publishedAt`/`createdAt`/`user.name`, none of which the two
  indexes above cover, so the sort runs in memory. Recorded as a live gap, not a resolved one.

### `experiences` · `educationEntries` · `credentials` · `evidenceItems` — **built (CAN-02)**

Four separate collections, one per entry kind, all keyed by `candidateId`. Defined together in
`candidates/profileEntry.model.js` and served by one route family (`/candidate-profile/entries/:kind`).

Per-item state is exactly why these are separate collections rather than embedded arrays (ADR-008):
each row carries its own `visibility` (`public` · `private`, from `CANDIDATE_VISIBILITY`) and its own
`verificationStatus`, and an embedded array element cannot be indexed or selectively hidden.

| Collection | Model | Kind | Distinct fields |
|---|---|---|---|
| `experiences` | `Experience` | `experience` | `role`, `organization`, `location`, `deliveryMode`, `startDate`, `endDate`, `current`, `description`, `outcome` |
| `educationEntries` | `EducationEntry` | `education` | `institution`, `qualification`, `fieldOfStudy`, `startDate`, `endDate`, `current`, `description` |
| `credentials` | `Credential` | `credential` | `name`, `credentialType`, `issuer`, `result`, `documentUrl`, `startDate`, `endDate`, `description` |
| `evidenceItems` | `EvidenceItem` | `media` | `title`, `url`, `prompt`, `description` |

Every row also carries `candidateId`, `visibility`, `verificationStatus`, `sortOrder`, `timestamps`.

Indexes, one per collection:
```js
{ candidateId: 1, sortOrder: 1, startDate: -1 }   // experiences, educationEntries, credentials
{ candidateId: 1, sortOrder: 1 }                  // evidenceItems (undated)
```

**`verificationStatus` is not client-writable.** It defaults to `unverified` from
`EVIDENCE_VERIFICATION` and is absent from every Zod body schema; `ENTRY_KINDS[kind].writable`
lists the permitted fields and `pickWritable()` in `profileEntry.service.js` drops everything else
before the document is built or assigned. A crafted body claiming `verificationStatus: 'verified'`
is therefore ignored rather than rejected. Nothing in the codebase writes any value other than
`unverified` yet — issuer verification is Phase 2 (PRD §20.3) — but the field exists so entries
created now do not need migrating.

**No file storage.** `credentials.documentUrl` accepts a link the candidate already hosts, and
`evidenceItems.url` is constrained to an allow-list of embed providers (`MEDIA_PROVIDERS`:
YouTube and Vimeo hosts only, resolved by `providerFor()`), because accepting any URL would let a
profile embed arbitrary third-party content into a recruiter's browser (PRD §16.3). There is no
upload endpoint and no blob store anywhere in the codebase.

### `references` — **not built**
The fifth ADR-008 evidence collection. PRD §20.3 defers reference collection to Phase 2; no model,
route or UI exists.

### `questionBanks` · `candidateAnswers` — **built (CAN-02)**

Versioned question configuration and structured answers (**ADR-007**).

`questionBanks` holds `{ version, active, publishedAt, sections[{ key, title, optional, order,
questions[] }] }`. Each question carries `key`, `type`, `target`, an optional `field`,
`requiredForPublish`, an `optionSet` key resolved from the shared taxonomy, and the two conditional
rules `onlyForRoles` (PRD §20.2) and `onlyForDeliveryModes` (Appendix C location conditionality).

**`target` is one of three** — `profile` (a field on `candidateProfiles`), **`user`** (a field on
`users`, for the personal layer: location and languages), or `answer` (`candidateAnswers`).
`field` accepts dot paths such as `location.country`. Splitting the targets rather than copying
personal data onto the candidate profile keeps one source of truth for a person's location.

Unique on `version`; exactly one `active`. Publishing a revision deactivates the previous one
rather than editing it — editing would rewrite the meaning of answers already given. **Current
version: 2** (v1 retained, inactive).

`candidateAnswers` stores `{ candidateId, questionKey, value, bankVersion }`, unique on
`{ candidateId, questionKey }`, so answers stay interpretable after a reword and a re-answer
updates in place. Only questions with **no** first-class profile field land here.

### `savedCompanies` — **built (CAN-06)**
`{ candidateId, companyId, note }`, unique on `{ candidateId, companyId }` so saving twice saves
once. A separate collection rather than an array on the profile, so a shortlist can grow without
rewriting the profile document on every toggle.

---

## 9. Marketplace collections — M4/M5

### `interests` (PRD §11.1)
`{ candidateId, companyId, hiringIntentIds[], source, candidateSnapshot, message, answers[],
consent, status, ownerId }`

**Critical index — this is what makes PRD §21.5 achievable:**
```js
{ candidateId: 1, companyId: 1, hiringIntentId: 1 }
   // unique, partialFilterExpression: { status: { $in: ACTIVE_STATES } }
```
A unique partial index is what guarantees *"the company receives interest exactly once even if
the user retries or refreshes."* Application-level checking alone races under concurrent
submits.

### `accessGrants` — **built (CAN-07)**
The mechanism by which a **private** candidate shares with a specific company without becoming
globally discoverable (PRD §4.3, §21.3). `{ candidateId, companyId, source, grantedAt,
withdrawnAt, scope }`. Read by authorization layer 4 (ADR-006 §6.2).

Created when interest is submitted and **withdrawn when the last active interest in that company
is withdrawn** — otherwise "withdrawn" would not actually withdraw anything. Pausing visibility
deliberately does *not* touch it (PRD §4.3: paused hides from *new* searches only).

### `pipelineEntries` — **built (REC-14)**

`pipeline/pipelineEntry.model.js`, collection `pipelineEntries`.

```js
{ companyId, candidateId, stage, ownerId, source, roleIntentIds: [ObjectId],
  stageHistory: [{ stage, changedBy, changedAt, note }],
  nextAction, nextActionAt, interviewAt, interviewMode, interviewNotes,
  rejectionReasonCode, rejectionNote, hiredRoleTitle, hiredAt,
  active: Boolean, timestamps }
```

**`stage`** — the fixed PRD §7.9 vocabulary from `@evallo/shared` (`PIPELINE_STAGES`):
`new_interest` · `sourced` · `reviewing` · `contacted` · `screening` · `interview` · `offer` ·
`hired` · `rejected`. `PIPELINE_STAGE_ORDER` fixes board order; `TERMINAL_PIPELINE_STAGES` is
`[hired, rejected]`.

**`source`** — `PIPELINE_SOURCES`: `interest` · `search` · `shortlist`.

**`rejectionReasonCode`** — `REJECTION_REASONS`: `experience_mismatch` · `subject_mismatch` ·
`location_mismatch` · `availability_mismatch` · `compensation_mismatch` · `credentials_missing` ·
`role_filled` · `no_response` · `candidate_withdrew` · `other`.

**`active`** is maintained by a `pre('save')` hook — false exactly when `stage` is terminal. It is
not a caller-supplied flag.

Indexes:
```js
{ companyId: 1, candidateId: 1 }  // UNIQUE, partialFilterExpression: { active: true }
{ companyId: 1, stage: 1, updatedAt: -1 }
{ companyId: 1, ownerId: 1 }
```

The partial unique index is what enforces PRD §4.1 (one active entry per candidate per company)
without a check-then-write race, **and** what permits PRD §21.4's re-add: once an entry goes
terminal it leaves the partial filter, so a new active row is admissible.

Service-level invariants (`pipeline.service.js`, not the schema): moving to `rejected` requires a
`rejectionReasonCode`; moving to `hired` requires `hiredRoleTitle`; `ownerId` must be an ACTIVE
member of the same company; every read and write first passes `resolveCandidateAccess`.

### `savedCandidates` — **built (shortlist, PRD §21.4)**

`pipeline/savedCandidate.model.js`, collection `savedCandidates`.
`{ companyId, candidateId, savedByUserId, note, timestamps }`, index
`{ companyId: 1, candidateId: 1 }` **unique** — so saving is idempotent.

A separate collection from `pipelineEntries` because saving is **silent to the candidate** while
entering a workflow is not (§21.4). Sharing one collection would make that distinction a field
every future query has to remember.

### `conversations` · `messages` — **built (CAN-09 + REC-15)**

`conversations`: `{ candidateId, companyId, interestId, lastMessageAt, lastMessagePreview,
candidateUnread, companyUnread, candidateState, candidateRespondedAt, mutedAt, reportedAt,
reportReason }`, unique on `{ candidateId, companyId }` so a reply continues the thread rather than
starting another.

`candidateState` is `pending | accepted | declined` — PRD §11.2's candidate-side actions. Declining
closes the thread to further candidate replies and sets `mutedAt`; it never deletes messages,
because the content is the record (§16.3).

A conversation is between a **candidate and a company**, never two users: the company side is a
context, so a recruiter leaving does not orphan the thread and their replacement inherits it
(PRD §21.6). Unread counts are per side.

Indexes:
```js
{ candidateId: 1, companyId: 1 }   // unique
{ candidateId: 1, lastMessageAt: -1 }
{ companyId: 1, lastMessageAt: -1 }
```

`messages`: `{ conversationId, senderType, senderUserId, body, attachments[], readAt }`, indexed
`{ conversationId: 1, createdAt: 1 }`. A separate collection because a thread grows unboundedly and
an embedded array would rewrite the whole document on every reply.

**`attachments` is reserved and always empty.** The field exists on the model and both serializers
emit `attachments: []`, but there is no upload endpoint, no storage backend and no validation for
it — file storage is undecided (TRD §14 Q2). The shape is forward-compatible; the capability is not
implemented.

Although a conversation belongs to the company, `senderUserId` is retained and resolved, so the
candidate sees **which individual recruiter** wrote each message rather than only the company name
(pinned by `joinRequests.test.js`).

### `notes` — **built (REC-14)**

`notes/note.model.js`, collection `notes`.
`{ companyId, candidateId, authorUserId, body, timestamps }`, index
`{ companyId: 1, candidateId: 1, createdAt: -1 }`.

A **separate collection from `messages`**, not a flag on it. PRD §11.2 and §21.4 require internal
notes to never reach candidates; separate collections make accidental exposure a structural
impossibility rather than a serialisation bug waiting to happen. Pinned by a test asserting a note
never appears on any candidate-facing surface. Only the author may delete; deletions are audited.

### `companyJoinRequests` — **built (REC-01 join requests)**

`memberships/joinRequest.model.js`, collection `companyJoinRequests`.
`{ companyId, userId, message, requestedRole, status, decidedByUserId, decidedAt, decisionNote,
timestamps }`.

`status` — `JOIN_REQUEST_STATUS`: `pending` · `approved` · `declined` · `withdrawn`.

Indexes:
```js
{ companyId: 1, userId: 1 }  // UNIQUE, partialFilterExpression: { status: 'pending' }
{ companyId: 1, status: 1, createdAt: -1 }
{ userId: 1, status: 1 }
```

The partial unique index makes asking twice idempotent while still allowing a fresh request after a
decline or withdrawal. **A request grants nothing.** Membership is created only on approval, with
the role the *approver* chose — `requestedRole` is a hint, and `GRANTABLE_ROLES` excludes `owner`,
so ownership cannot be obtained by asking for it.

### `savedSearches` — **not built**
Filter JSON, sort, alert preference, last run — company-scoped (PRD §10.1). No model or route
exists; REC-12 holds filter state in the URL instead (see `04_API_DOCUMENTATION.md`).

### `savedCompanies` — **built (CAN-06)**
See §8.

### `conversations` · `messages` — **built (CAN-09)**

`conversations`: `{ candidateId, companyId, interestId, lastMessageAt, lastMessagePreview,
candidateUnread, companyUnread, candidateState, candidateRespondedAt, mutedAt, reportedAt,
reportReason }`, unique on `{ candidateId, companyId }` so a reply continues the thread rather than
starting another.

`candidateState` is `pending | accepted | declined` — PRD §11.2's candidate-side actions. Declining
closes the thread to further candidate replies and sets `mutedAt`; it never deletes messages,
because the content is the record (§16.3).

A conversation is between a **candidate and a company**, never two users: the company side is a
context, so a recruiter leaving does not orphan the thread and their replacement inherits it
(PRD §21.6). Unread counts are per side.

`messages`: `{ conversationId, senderType, senderUserId, body, attachments[], readAt }`, indexed
`{ conversationId, createdAt }`. A separate collection because a thread grows unboundedly and an
embedded array would rewrite the whole document on every reply. `attachments` exists and stays
empty until file storage is decided (TRD §14 Q2), so the shape does not change later.

### `notes`
`notes` is a **separate collection from `messages`**, not a flag on it. PRD §11.2 and §21.4
require internal notes to never reach candidates; separate collections make accidental exposure
a structural impossibility rather than a serialisation bug waiting to happen.

### `savedSearches` · `savedCompanies`
Filter JSON, sort, alert preference, last run — company-scoped (PRD §10.1).

---

## 10. Cross-cutting collections

### `auditEvents` — **built (REC-13)** (PRD §14.3)

`audit/auditEvent.model.js`, collection `auditEvents`.
`{ actorUserId, actorCompanyId, action, targetType, targetId, metadata, ip, userAgent, createdAt }`

Append-only. Never updated, never deleted. Indexed on `{ targetType: 1, targetId: 1, createdAt: -1 }`
and `{ actorCompanyId: 1, createdAt: -1 }`. Written by services only.

PRD §7.10 and §16.1 make this mandatory for candidate profile views, evidence downloads,
contact reveals, and exports — it is a compliance requirement, not a debugging convenience.

`AUDIT_ACTIONS` as implemented:

| Domain | Actions |
|---|---|
| Candidate | `candidate_profile.viewed` · `candidate_contact.revealed` |
| Hiring intents | `hiring_intent.created` · `hiring_intent.updated` · `hiring_intent.status_changed` |
| Pipeline | `pipeline_entry.created` · `pipeline_entry.stage_changed` · `pipeline_entry.assigned` |
| Shortlist | `candidate.saved` · `candidate.unsaved` |
| Notes | `note.created` · `note.deleted` |

`AUDIT_TARGET_TYPES`: `candidateProfile` · `hiringIntent` · `pipelineEntry` · `note`.

Read back by `listCompanyAuditEvents(companyId, { page, pageSize = 25 })`, exposed at
`GET /api/companies/:companyId/audit` behind `company:settings`.

> ⚠️ **Writes are best-effort, not guaranteed.** `recordAuditEvent()` calls
> `AuditEvent.create(event).catch(...)` **without `await`** — a failed write is logged and
> swallowed, and the request succeeds regardless. The service header states the intent to become an
> `await` at the call site without changing shape. Until then the log is a strong signal but not a
> provable record, which matters because §16.1 treats it as a compliance artefact. Tracked in
> `12_KNOWN_ISSUES.md`.

### `notifications` (PRD §15) — **not built**
`{ userId, companyId, type, payload, readAt, channels, sentAt }`. Company-scoped notifications
must carry `companyId` so multi-company recruiters see the correct context (PRD §15.1).

No collection, model or route exists. SET-01 stores per-event **preferences** on `users`
(see §2) but nothing reads them, and the only emails the system sends are the two transactional
ones in `lib/email` (verification, password reset).

### `reports` (PRD §16.3) — **not built as a collection**
Moderation queue: `{ reporterId, targetType, targetId, reason, status, resolution, appealedAt }`.

No `reports` collection exists. CAN-09's report action
(`POST /api/me/conversations/:id/report`) records `reportedAt` and `reportReason` **on the
conversation**, so a report is captured but there is no queue, no status workflow and no appeal
path. `SettingsPrivacyPage` reads these conversation fields to list reports.

---

## 10a. `earlyAccessRequests` — M-M (marketing)

Pilot waitlist captured by the marketing landing page (MKT-01). **Not in PRD §14.1** — this
collection exists because the marketing page introduced a lead-capture surface the PRD does not
describe. See **ADR-014** for why this is deliberately not the `users` collection.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `email` | String | ✅ | Lowercased, trimmed. **Unique** |
| `name` | String | ✅ | Unicode permitted |
| `segment` | String | ✅ | `business \| educator`. **Marketing attribute only** |
| `status` | String | ✅ | `new \| contacted \| invited \| converted \| declined \| spam` |
| `source` | Object | | `{ referrer, utmSource, utmMedium, utmCampaign, landingPath }` — server-derived |
| `consentedAt` | Date | ✅ | Terms/privacy acknowledgement at submission |
| `submissionCount` | Number | ✅ | Incremented on repeat submission; default `1` |
| `lastSubmittedAt` | Date | ✅ | |
| `invitedUserId` | ObjectId → users | | Set when the lead converts to an account |
| `notes` | String | | Internal operator notes |
| `ip`, `userAgent` | String | | Abuse triage only; subject to retention policy |

**Indexes**
```js
{ email: 1 }                        // unique — the idempotency guarantee
{ status: 1, createdAt: -1 }        // operator triage queue
{ segment: 1, createdAt: -1 }       // funnel analytics (PRD §18.1 Acquisition)
```

**Constraints**
- `email` unique. This index — not application-level checking — is what makes the endpoint
  idempotent under concurrent submits.
- **`segment` must never be copied onto a `User` document.** It records what a lead *said* on a
  marketing form, not an account type. Writing it to `users` would reintroduce the role field
  ADR-001 exists to prevent.
- **No link to `users` until conversion.** A row here is not an account and grants nothing.

**Privacy**
- This is personal data collected before any account exists. It falls under the same deletion,
  export, and retention obligations as PRD §16.1.
- **A retention policy is required before pilot launch** — **drafted 2026-08-12 in
  `16_RETENTION_POLICY.md`, awaiting sign-off.** `candidateProfiles.deletedAt` was added in the
  same pass (additive, optional, no migration): account deletion empties the profile and marks it
  `archived` rather than removing the row, so interests, conversations and pipeline entries keep a
  valid reference and `candidateAccess.service` denies access through the rule that already exists — indefinitely retained marketing leads
  are a liability, not an asset. Tracked in `13_BACKLOG.md`.

**Sample**
```json
{
  "_id": "66aa22119d3e4b0012f8a2c7",
  "email": "priya@sevensquare.example",
  "name": "Priya Raman",
  "segment": "business",
  "status": "new",
  "source": { "referrer": "https://www.google.com/", "utmCampaign": "pilot-launch", "landingPath": "/" },
  "consentedAt": "2026-07-31T10:22:00.000Z",
  "submissionCount": 1,
  "lastSubmittedAt": "2026-07-31T10:22:00.000Z",
  "createdAt": "2026-07-31T10:22:00.000Z"
}
```

---

## 10b. `mediaAssets` — uploaded binary (ADR-020)

Profile photo bytes. **Not in PRD §14.1** — this collection exists because photo upload had to ship
before object storage was procured. **Read ADR-020 before extending it**, and in particular before
putting a document or a message attachment in it: the case for keeping bytes in MongoDB rests on
properties a profile photo has and a CV does not.

| Field | Type | Req | Notes |
|---|---|:--:|---|
| `ownerUserId` | ObjectId → users | ✅ | The person. Not a candidate id — recruiters have photos too |
| `kind` | String | ✅ | `profile_photo`. One value today; the field exists so a second needs no migration |
| `contentType` | String | ✅ | `image/webp \| image/jpeg \| image/png`. **Set from a magic-byte sniff, never from the request header** |
| `byteLength` | Number | ✅ | Max 2 MB (`MEDIA_MAX_BYTES`) |
| `data` | Buffer | ✅ | The bytes. **`select: false`** — only the streaming route asks for them |

**Indexes**
```js
{ ownerUserId: 1 }                        // the purge, and any per-user lookup
{ ownerUserId: 1, kind: 1 }  // unique — what bounds the collection's growth
```

**Constraints**
- `{ ownerUserId, kind }` unique. This is load-bearing, not hygiene: it makes an upload an
  **upsert**, so replacing a photo six times leaves one document. The entire argument for storing
  bytes here is that the collection grows with people rather than with uploads, and this index is
  what enforces it. Asserted by `profilePhoto.test.js` → *"replacing leaves exactly one document"*.
- `contentType` is whatever `sniffImageType()` returned. A client's `Content-Type` is
  attacker-controlled and is used only to decide whether to buffer the request at all.
- Typical stored size is **1–2 KB**: the browser centre-crops to a square, caps the longest edge at
  512px and re-encodes to WebP before uploading. The 2 MB cap is headroom, not the expectation.

**Lifecycle**
- Written by `media.service.js` (`storeProfilePhoto`) and by nothing else.
- `users.profilePicture` holds `‹api›/api/media/<id>?v=<updatedAt>`. The `?v=` is required: the id is
  stable across replacement, so without it a browser keeps showing the previous photo.
- Deleted outright by the account-deletion purge. The tombstone step `$unset`s the pointer; deleting
  the row is what removes the photograph itself.

---

## 11. Transactions

MongoDB multi-document transactions (requiring a replica set — **a deployment constraint worth
noting now**, per `03_TRD.md` §13) are required for:

| Operation | Documents | Why |
|---|---|---|
| Interest submission (§8.7) | `interests`, `accessGrants`, `pipelineEntries`, `notifications`, `auditEvents` | Partial failure grants profile access with no interest record — a privacy defect |
| Refresh rotation (ADR-005) | `authSessions` × 2 | Prevents a window where neither token is valid |
| Ownership transfer (§4.2) | `companyMembers` × 2 | Must never leave a company with zero owners |
| Company publish (§7.2) | `companies`, `hiringIntents`, `auditEvents` | Publishing must be atomic with intent activation |

A standalone `mongod` does not support transactions. If local development uses standalone, these
paths behave differently in development than in production — a class of bug worth avoiding by
running a single-node replica set locally. Covered in `08_SETUP_GUIDE.md`.
