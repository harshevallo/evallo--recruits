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
  └──1:N── companyMembers ──N:1── companies ──1:N── hiringIntents
                                          │       ──1:N── interests
                                          │       ──1:N── pipelineEntries
                                          │       ──1:N── conversations ──1:N── messages
                                          │       ──1:N── savedSearches
                                          │       ──1:N── notes
                                          └──1:N── companyRevisions

auditEvents · notifications · reports    (cross-cutting, reference many collections)
```

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
| `authMethods` | ⏳ | [Object] | | Multi-provider linking. Superseded for now by `provider` + `googleId`/`microsoftId`; needed for AUTH-13 |
| `notificationPrefs` | ⏳ | Object | | PRD §15, arrives with M6 |

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
| `website`, `foundingYear`, `sizeRange` | mixed | | |
| `verifiedDomains` | [Object] | | `{ domain, verifiedAt, method }` (PRD §16.2) |
| `logoUrl`, `coverImageUrl`, `tagline` | String | | Logo or generated initials required to publish |
| `description` | Object | | `{ short, full, mission, values, culture, philosophy }` |
| `location` | Object | ✅ | Headquarters `{ country, region, city, timezone }` |
| `locations` | [Object] | | Additional offices |
| `serviceRegions`, `deliveryModes` | [String] | | |
| `educationServices` | [String] | ✅ | ≥ 1 required to publish (PRD §7.3) |
| `subjects`, `tests`, `curricula`, `gradeBands`, `learnerPopulations` | [String] | | Taxonomy-linked, drives discovery |
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

### `candidateProfiles`
Core identity, work preferences, visibility state, and the denormalized `facets` subdocument.

`facets` is the **only** shape talent search queries (ADR-010). It is derived, never
authored — recomputed exclusively by `refreshCandidateFacets(candidateId)`, called from every
mutating path. This is tracked as **TD-04 (High)** in `14_PROGRESS_TRACKER.md`: any code path
that writes candidate data without triggering the refresh silently corrupts search results.

```js
facets: {
  roleFamilies: [String], roles: [String], subjects: [String], tests: [String],
  gradeBands: [String], curricula: [String], learnerPopulations: [String],
  teachingFormats: [String], languages: [String], countries: [String],
  timezones: [String], deliveryModes: [String], employmentTypes: [String],
  yearsExperience: Number, evidenceCounts: { credentials, assessments, videos, references },
  verificationFlags: [String], lastActiveAt: Date, profileCompleteness: Number
}
```

Anticipated indexes (validated against real query shapes at M5):
```js
{ status: 1, "facets.roleFamilies": 1, "facets.subjects": 1 }
{ status: 1, "facets.countries": 1, "facets.deliveryModes": 1 }
{ status: 1, "facets.lastActiveAt": -1 }
{ userId: 1 }   // unique — one active profile per user (PRD §4.1, Appendix D)
```

### `candidateProfiles` — as built

Beyond the identity and visibility fields, the profile now carries the structured answers CAN-02
writes, because talent search will filter on them and an answer document cannot be indexed
usefully:

```js
targetRoles: [String], subjects: [String], learnerSegments: [String],
employmentTypes: [String], deliveryModes: [String], availability: String,
yearsExperience: Number, bankVersion: Number
```

`facets` is still to come (M5) — it is derived from these, not a replacement for them.

### `experiences` · `educationEntries` · `credentials` · `evidenceItems` · `references`
All keyed by `candidateId`, each carrying its own `visibility` and — where applicable — its own
`verificationStatus` (`unverified → pending → verified/rejected → expired`, PRD §14.2). Per-item
state is exactly why these are separate collections rather than embedded arrays (ADR-008).

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

### `pipelineEntries` (PRD §7.9)
`{ companyId, candidateId, stage, ownerId, source, roleIntentIds[], stageHistory[], nextAction }`.
Unique on `{ companyId, candidateId }` among active entries — PRD §4.1: one active entry per
candidate per company.

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

### `auditEvents` (PRD §14.3)
`{ actorUserId, actorCompanyId, action, targetType, targetId, metadata, ip, userAgent, createdAt }`

Append-only. Never updated, never deleted. Indexed on `{ targetType, targetId, createdAt: -1 }`
and `{ actorCompanyId, createdAt: -1 }`. Written by services only.

PRD §7.10 and §16.1 make this mandatory for candidate profile views, evidence downloads,
contact reveals, and exports — it is a compliance requirement, not a debugging convenience.

### `notifications` (PRD §15)
`{ userId, companyId, type, payload, readAt, channels, sentAt }`. Company-scoped notifications
must carry `companyId` so multi-company recruiters see the correct context (PRD §15.1).

### `reports` (PRD §16.3)
Moderation queue: `{ reporterId, targetType, targetId, reason, status, resolution, appealedAt }`.

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
- **A retention policy is required before pilot launch** — indefinitely retained marketing leads
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
