# 04 — API Documentation

**Base URL:** `/api` · **Format:** JSON · **Auth:** Bearer access token (ADR-005)

> **Status: M1 (auth + current user) and the public/company surface used by M2 are implemented.**
> This document defines the conventions every endpoint must follow, and is updated **in the same
> commit** as the endpoint it documents — an undocumented endpoint is an incomplete endpoint.

---

## 1. Conventions

### Response envelope
Every response — success or failure — passes through one envelope. No route hand-rolls a shape.

```jsonc
// Success
{ "success": true,
  "data": { },
  "meta": { "page": 1, "limit": 20, "total": 143 } }   // meta only on collections

// Error
{ "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": { "email": "Enter a valid email address" }   // keyed by form field
  } }
```

`details` is keyed by field name so the client maps errors to inputs directly, satisfying
PRD §19.1 (inline, specific, accessible, no layout shift).

### Status codes
| Code | Meaning |
|---|---|
| `200` | Success (including idempotent replay) |
| `201` | Created |
| `400` | Validation failure — `details` populated |
| `401` | Missing/invalid/expired access token |
| `403` | Authenticated but not permitted |
| `404` | Not found **or deliberately masked** — see below |
| `409` | Conflict (duplicate, state violation) |
| `429` | Rate limited |
| `500` | Server error — never leaks internals |

**`404` rather than `403` for candidate resources.** Returning `403` for a candidate a recruiter
may not view confirms that candidate exists, which leaks information under PRD §16.1. Candidate
resources outside the requester's visibility return `404`.

### Error codes
`VALIDATION_ERROR` · `UNAUTHENTICATED` · `TOKEN_EXPIRED` · `FORBIDDEN` · `NOT_FOUND` ·
`CONFLICT` · `RATE_LIMITED` · `EMAIL_NOT_VERIFIED` · `MEMBERSHIP_REQUIRED` ·
`CANDIDATE_NOT_VISIBLE` · `INTENT_CLOSED` · `SERVER_ERROR`

### Authentication
- Access token: `Authorization: Bearer <jwt>`, 15-minute lifetime, memory-only on the client.
- Refresh: `httpOnly` cookie, sent automatically to `/api/auth/refresh`. Never in a body or header.
- Requests requiring a verified email return `403 EMAIL_NOT_VERIFIED` when unverified.

### Company scoping
Company-scoped resources nest under `/api/companies/:companyId/...`. Membership and permission
are re-verified server-side on **every** request (ADR-006). A client may not pass a role,
permission, or company context that the server trusts.

### Pagination
Cursor-based for large or frequently-changing collections (search, messages):
`?cursor=<opaque>&limit=20`. Offset pagination only where a stable total is required.

### Idempotency
Interest submission, invitation acceptance, and email verification are idempotent (PRD §19).
A retry returns `200` with the existing record — never a duplicate, never a `409`.

---

## 2. Entry template

Every endpoint is documented in exactly this form:

````markdown
### `POST /api/auth/login`

**Purpose** — One sentence. Reference the PRD section and screen ID.

**Authentication** — None | Bearer | Bearer + company membership + `<permission>`

**Request**
```json
{ "email": "user@example.com", "password": "…" }
```
| Field | Type | Required | Rules |
|---|---|:--:|---|
| `email` | string | ✅ | Valid email, lowercased |
| `password` | string | ✅ | Non-empty |

**Response — `200`**
```json
{ "success": true, "data": { "accessToken": "…", "user": { } } }
```
Sets the refresh cookie.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed input |
| 401 | `UNAUTHENTICATED` | Wrong credentials — message must not reveal which field |
| 403 | `EMAIL_NOT_VERIFIED` | Email unverified; resend offered |
| 429 | `RATE_LIMITED` | Brute-force protection |

**Collections** — `users`, `sessions`, `auditEvents`

**Notes** — Non-obvious behaviour, idempotency, side effects, audit events emitted.
````

---

## 3. Planned surface

Endpoints are added below as they are built. This list is the intended shape, not a contract.

| Group | Base path | Milestone |
|---|---|---|
| Auth | `/api/auth/*` | M1 |
| Current user | `/api/me/*` | M1 |
| Public (unauthenticated) | `/api/public/*` | M2 |
| Companies | `/api/companies/*` | M2 |
| Memberships | `/api/companies/:id/members/*` | M2 |
| Hiring intents | `/api/companies/:id/hiring-intents/*` | M2 |
| Candidate profile | `/api/me/candidate-profile/*` | M3 |
| Evidence | `/api/me/candidate-profile/evidence/*` | M3 |
| Question bank | `/api/question-bank/*` | M3 |
| Interests | `/api/me/interests/*`, `/api/companies/:id/interests/*` | M4 |
| Search | `/api/companies/:id/search/candidates` | M5 |
| Pipeline | `/api/companies/:id/pipeline/*` | M5 |
| Messaging | `/api/conversations/*` | M5 |
| Notifications | `/api/me/notifications/*` | M6 |

**`/api/public/*` is a hard boundary.** It is served by `modules/public`, which may read only
published company data and can never reach a candidate collection (PRD §21.2).

---

## 4. Implemented surface at a glance

| Method | Path | Auth | Screen |
|---|---|---|---|
| `GET` | `/api/health` | None | ops diagnostic |
| `GET` | `/api/auth/config` | None | reports whether Google sign-in is configured |
| `POST` | `/api/auth/signup` | None | AUTH-01 |
| `POST` | `/api/auth/verify-email` | None | AUTH-03 (link target) |
| `POST` | `/api/auth/set-password` | Setup token | AUTH-03 |
| `POST` | `/api/auth/resend-verification` | None | AUTH-02 |
| `POST` | `/api/auth/change-email` | None | AUTH-02 |
| `POST` | `/api/auth/login` | None | AUTH-10 |
| `POST` | `/api/auth/google` | None | AUTH-01 / AUTH-10 |
| `POST` | `/api/auth/refresh` | Refresh cookie | session |
| `POST` | `/api/auth/logout` | Refresh cookie | session |
| `POST` | `/api/auth/forgot-password` | None | AUTH-11 |
| `POST` | `/api/auth/reset-password` | Reset token | AUTH-12 |
| `GET` | `/api/me` | Bearer | HOME-01 |
| `PATCH` | `/api/me` | Bearer | AUTH-04 |
| `POST` | `/api/me/complete-onboarding` | Bearer | AUTH-05 |
| `GET` | `/api/me/candidate-profile` | Bearer | CAN-01 |
| `POST` | `/api/me/candidate-profile` | Bearer | HOME-01 |
| `GET` | `/api/me/candidate-profile/builder` | Bearer | CAN-02 |
| `PATCH` | `/api/me/candidate-profile/sections/:sectionKey` | Bearer | CAN-02 |
| `GET` | `/api/me/candidate-profile/preview` | Bearer | CAN-03 |
| `POST` | `/api/me/candidate-profile/publish` | Bearer | CAN-03 |
| `GET` | `/api/me/candidate-profile/visibility` | Bearer | CAN-04 |
| `PATCH` | `/api/me/candidate-profile/visibility` | Bearer | CAN-04 |
| `POST` | `/api/me/candidate-profile/blocked-companies` | Bearer | CAN-04 |
| `DELETE` | `/api/me/candidate-profile/blocked-companies/:companyId` | Bearer | CAN-04 |
| `GET` | `/api/me/companies/:slug/relationship` | Bearer | CAN-06 |
| `PUT` | `/api/me/companies/:slug/saved` | Bearer | CAN-06 |
| `DELETE` | `/api/me/companies/:slug/saved` | Bearer | CAN-06 |
| `GET` | `/api/me/interests/consent-disclosure` | Bearer | CAN-07 |
| `POST` | `/api/me/companies/:slug/interest` | Bearer | CAN-07 |
| `GET` | `/api/me/interests` | Bearer | CAN-08 |
| `POST` | `/api/me/interests/:interestId/withdraw` | Bearer | CAN-08 |
| `GET` | `/api/me/conversations` | Bearer | CAN-09 |
| `GET` | `/api/me/conversations/:conversationId` | Bearer | CAN-09 |
| `POST` | `/api/me/conversations/:conversationId/messages` | Bearer | CAN-09 |
| `POST` | `/api/me/conversations/:conversationId/respond` | Bearer | CAN-09 |
| `PUT` | `/api/me/conversations/:conversationId/mute` | Bearer | CAN-09 |
| `POST` | `/api/me/conversations/:conversationId/report` | Bearer | CAN-09 |
| `POST` | `/api/companies` | Bearer | REC-01 / HOME-01 |
| `GET` | `/api/me/invitations` | Bearer | REC-01 |
| `POST` | `/api/me/invitations/:invitationId/accept` | Bearer | REC-01 |
| `POST` | `/api/me/invitations/:invitationId/decline` | Bearer | REC-01 |
| `GET` | `/api/companies/:companyId/editor` | Bearer + `company:edit` | REC-02 |
| `PATCH` | `/api/companies/:companyId/steps/:stepKey` | Bearer + `company:edit` | REC-02 |
| `GET` | `/api/companies/:companyId/preview` | Bearer + `company:edit` | REC-06 |
| `POST` | `/api/companies/:companyId/publish` | Bearer + `company:edit` | REC-06 |
| `POST` | `/api/companies/:companyId/unpublish` | Bearer + `company:edit` | REC-06 |
| `GET` | `/api/companies/:companyId/members` | Bearer + `member:manage` | REC-18 |
| `PATCH` | `/api/companies/:companyId/members/:memberId` | Bearer + `member:manage` | REC-18 |
| `DELETE` | `/api/companies/:companyId/members/:memberId` | Bearer + `member:manage` | REC-18 |
| `POST` | `/api/companies/:companyId/members/:memberId/transfer-ownership` | Bearer + `member:manage` | REC-18 |
| `GET` | `/api/companies/:companyId/invitations` | Bearer + `member:manage` | REC-07 |
| `POST` | `/api/companies/:companyId/invitations` | Bearer + `member:manage` | REC-07 |
| `POST` | `/api/companies/:companyId/invitations/:invitationId/resend` | Bearer + `member:manage` | REC-07 |
| `POST` | `/api/companies/:companyId/invitations/:invitationId/cancel` | Bearer + `member:manage` | REC-07 |
| `GET` | `/api/companies/:companyId/dashboard` | Bearer + membership | REC-10 |
| `GET` | `/api/companies/:companyId/interests` | Bearer + `interest:view` | REC-11 |
| `PATCH` | `/api/companies/:companyId/interests/:interestId` | Bearer + `interest:view` | REC-11 |
| `POST` | `/api/companies/:companyId/interests/:interestId/viewed` | Bearer + `interest:view` | REC-11 |
| `GET` | `/api/companies/:companyId/search/candidates` | Bearer + `candidate:search` | REC-12 |
| `POST` | `/api/public/early-access` | None | MKT-01 |
| `GET` | `/api/public/companies` | None | PUB-01 |
| `GET` | `/api/public/companies/facets` | None | PUB-01 |
| `GET` | `/api/public/companies/:slug` | None | PUB-02 |
| `POST` | `/api/public/companies/:slug/interest` | None | PUB-02 |

`authLimiter` rate-limits every `/api/auth` write. All limiters are skipped when `NODE_ENV=test`.

---

## 5. Endpoints — authentication

The sign-up chain is **email → verify → password → name → router**. A password is never accepted
before the email is proven (PRD §6.1, §21.1), and signup never issues a session.

### `POST /api/auth/signup`

**Purpose** — AUTH-01. Create an unverified account from an email address and send the
verification link.

**Authentication** — None.

**Request**
```json
{ "email": "sarah@example.com" }
```
| Field | Type | Required | Rules |
|---|---|:--:|---|
| `email` | string | ✅ | Valid email, lowercased. **The only accepted field** |

A client that also sends `password` or `name` has them stripped by the schema — they cannot be
smuggled in.

**Response — `201`**
```json
{ "success": true,
  "data": { "user": { "id": "…", "email": "…", "emailVerified": false },
            "emailVerificationRequired": true } }
```

**No token, no cookie, no session.** The account cannot be used until the email is verified and a
password is set.

**Errors** — `400 VALIDATION_ERROR` · `409 CONFLICT` (email already registered) · `429 RATE_LIMITED`

**Collections** — `users`, `verificationTokens`

---

### `POST /api/auth/verify-email`

**Purpose** — AUTH-03. Consume the emailed token, mark the address verified, and hand back a
single-use **setup token** when the account has no credential yet.

**Authentication** — None; the token in the body is the proof.

**Request** — `{ "token": "<raw token from the link>" }`

**Response — `200`**
```json
{ "success": true,
  "data": { "verified": true, "email": "sarah@example.com",
            "needsPassword": true, "setupToken": "…" } }
```
`needsPassword: false` (and no `setupToken`) when the account already has a password — the client
sends that user to sign-in instead.

**Errors** — `400 VERIFICATION_TOKEN_INVALID` · `410 VERIFICATION_TOKEN_EXPIRED` (24-hour window) ·
`409 ALREADY_VERIFIED`

**Notes** — Verification does **not** authenticate. Consuming a token invalidates every other
outstanding verification token for that account.

---

### `POST /api/auth/set-password`

**Purpose** — AUTH-03. First point at which a credential exists for the account. Establishes the
session that carries onboarding through AUTH-04 and AUTH-05.

**Authentication** — The single-use setup token from `verify-email` (30-minute lifetime).

**Request**
```json
{ "token": "…", "password": "…", "confirmPassword": "…" }
```
| Field | Type | Required | Rules |
|---|---|:--:|---|
| `token` | string | ✅ | Setup token, single use |
| `password` | string | ✅ | Min 8 chars; bcrypt cost 12 at rest |
| `confirmPassword` | string | ✅ | Must equal `password` |

**Response — `200`** — `{ "accessToken": "…", "user": { … } }`, sets a persistent refresh cookie.

**Errors** — `400 VALIDATION_ERROR` (weak password, mismatch, spent/unknown token) · `429 RATE_LIMITED`

---

### `POST /api/auth/resend-verification` · `POST /api/auth/change-email`

**Purpose** — AUTH-02. Resend the link, or correct a mistyped address before verification.

**Authentication** — None **by design**: after signup the user has no session, so the account is
identified by email. Both are rate limited and privacy-safe — the response is identical whether or
not the account exists, so neither is an enumeration oracle.

**Notes** — A 60-second resend cooldown is enforced server-side; the client mirrors it as a
countdown.

---

### `POST /api/auth/login`

**Purpose** — AUTH-10. Global sign-in for one account across every personal and company context.

**Request**
```json
{ "email": "sarah@example.com", "password": "…", "rememberMe": true }
```
| Field | Type | Required | Rules |
|---|---|:--:|---|
| `rememberMe` | boolean | | Default `false`. Unticked → session cookie (no `Max-Age`) and a 1-day server session; ticked → persistent cookie and the full `REFRESH_TOKEN_TTL_DAYS` |

**Response — `200`** — `{ "accessToken": "…", "user": { … } }`, sets the refresh cookie.

**Errors**
| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` | Wrong credentials — the message never reveals which field |
| 403 | `EMAIL_NOT_VERIFIED` | Verified **after** the password check, so it is not a verification oracle |
| 429 | `ACCOUNT_LOCKED` | 10 failed attempts locks the account for 15 minutes, per account (not per IP) |

**Notes** — A successful sign-in clears the failure counter and the lock.

---

### `POST /api/auth/google`

**Purpose** — Google sign-in. Verifies the Google **ID token** with `google-auth-library`, then
issues our own JWT. Google's token is never used for API authorization and is discarded after
verification. Links to an existing account by verified email rather than creating a duplicate.

**Request** — `{ "credential": "<Google ID token>" }`

**Notes** — Optional feature. With `GOOGLE_CLIENT_ID` unset, `GET /api/auth/config` reports
`googleEnabled: false` and the client renders the button disabled; email auth is unaffected.

---

### `POST /api/auth/refresh` · `POST /api/auth/logout`

**Purpose** — Rotate the refresh token / revoke the session.

**Authentication** — The `evallo_rt` httpOnly cookie. Never a body or header.

**Response — `200`** — refresh returns a new `accessToken` and sets a rotated cookie; logout
returns `{ "ok": true }`.

**Notes** — **Rotation with reuse detection (ADR-005).** Every session belongs to a `familyId`.
Presenting an already-rotated token revokes that entire family — a stolen token cannot outlive one
use. Revocation is family-scoped, so unrelated sessions on other devices survive. The cookie
lifetime is inherited across rotations, so a "remember me: no" session is never silently upgraded.

---

### `POST /api/auth/forgot-password` · `POST /api/auth/reset-password`

**Purpose** — AUTH-11 / AUTH-12.

**Notes** — `forgot-password` returns an **identical** response whether or not the account exists
(PRD §6.3). Issuing a new reset token invalidates all prior unconsumed ones. A completed reset
verifies the email and **revokes every existing session**.

---

## 6. Endpoints — current user

### `GET /api/me`

**Purpose** — The authenticated user plus their **derived** capabilities. This single call renders
HOME-01 in full, including the context switcher.

**Authentication** — Bearer.

**Response — `200`**
```json
{ "success": true,
  "data": {
    "user": { "id": "…", "email": "…", "emailVerified": true, "name": "Sarah Jenkins",
              "profilePicture": null, "provider": "password", "platformRole": "member",
              "headline": null, "location": null,
              "onboardingCompletedAt": "2026-08-02T09:00:58.400Z", "createdAt": "…" },
    "capabilities": {
      "hasCandidateProfile": false,
      "candidateProfile": null,
      "companies": [
        { "companyId": "…", "name": "Northwind Academy", "slug": "northwind-academy",
          "logoUrl": null, "initials": "NA", "status": "published",
          "role": "owner", "permissions": ["company:edit", "…"] }
      ],
      "isRecruiterAnywhere": true
    } } }
```

**Notes**
- `capabilities` is **recomputed on every request** from `CandidateProfile` and active
  `CompanyMember` rows. It is never stored on the user, so a revoked membership disappears on the
  next call (ADR-001, ADR-006).
- `role` is per company. There is no global role on `user` — and never will be.
- `permissions` is resolved server-side from the shared matrix so the client never re-implements it.

---

### `PATCH /api/me`

**Purpose** — AUTH-04 and later personal profile edits.

**Request** — any of `name`, `headline`, `profilePicture`, `location`, `languages`.

**Notes** — Allowlisted. `email`, `password`, `provider`, `platformRole`, `status`, and
`onboardingCompletedAt` are **not** settable here.

---

### `POST /api/me/complete-onboarding`

**Purpose** — AUTH-05. Records that the first-action router has been seen, so it never shows again.

**Authentication** — Bearer. No request body.

**Response — `200`** — the same envelope as `GET /api/me`, with `user.onboardingCompletedAt` set.

**Notes**
- **Creates nothing.** No candidate profile, no company, no role — the user's choice on AUTH-05 is
  a redirect, not a capability (PRD §21.1, ADR-001).
- **Idempotent**: the first stamp wins, so a second call or a second tab never moves the timestamp.
- A dedicated endpoint rather than a field on `PATCH /api/me` so the client can only stamp "now",
  never an arbitrary value, and can never un-set it.

---

### `GET` / `POST /api/me/candidate-profile`

**Purpose** — CAN-01. `GET` returns the profile plus derived `completeness` (by section) and
`nextSteps`. `POST` creates the profile — the only thing that makes a user a candidate.

**Notes** — One profile per user, enforced by a unique index. `POST` is idempotent: `201` the
first time, `200` thereafter. Creation is always explicit — no screen creates a profile as a side
effect. Completeness is **derived on read**, never stored, so it cannot drift from the profile.

---

## 6a. Endpoints — candidate profile builder (CAN-02)

### `GET /api/me/candidate-profile/builder`

Returns the active question bank resolved against this candidate: ordered sections, the questions
visible for their chosen roles, current values, per-section `answered`/`total`/`complete`, and
`publishBlockers`.

Sections and questions are **database configuration** (ADR-007), so adding a question is a bank
revision, not a deploy. Two conditional rules apply (Appendix C):

- `onlyForRoles` — shown once the candidate selects a matching target role (PRD §20.2 limits
  role-specific depth to the pilot priority roles).
- `onlyForDeliveryModes` — location conditionality: the on-site question appears only for a
  candidate who selected on-site or hybrid, so remote-only candidates are never asked commuting
  questions.

**Answer targets.** Each question declares where its answer lives: `profile` (a field on
`candidateProfiles`, what talent search will filter on), **`user`** (a field on `users` — the
personal layer that holds location and languages per `05_DATABASE_SCHEMA.md` §2), or `answer`
(`candidateAnswers`, keyed by question). `field` accepts dot paths, so `location.country`
addresses a nested field directly. A person has one location whether or not they are also a
candidate, which is why it is never duplicated onto the candidate profile.

### `PATCH /api/me/candidate-profile/sections/:sectionKey`

**Request** — `{ "values": { "<questionKey>": <value>, … } }`

Saves one section. A **partial section is a valid save** (PRD §8.3 lets candidates skip and return
later); only malformed answers are rejected, with `details` keyed by question. A section never
half-saves — everything is validated before anything is written. Answers whose question is backed
by a profile field land on `candidateProfiles` (search reads those); the rest go to
`candidateAnswers` with the `bankVersion` they were given under.

Returns the refreshed builder state, because answering `targetRoles` can reveal new questions.

---

## 6b. Endpoints — preview and visibility (CAN-03, CAN-04)

### `GET /api/me/candidate-profile/preview`

The **exact** recruiter rendering (PRD §8.8), produced by the same `toRecruiterView` serialiser a
recruiter will read — one code path, because two would drift and the drift would be a privacy
defect. Also returns `privateFields` (what is withheld and *why*) and `publish`
(`canPublish`, `blockers`, `isPublished`).

`header` carries the full §8.8 set: `photoUrl`, `name`, `headline`, `location`
(`{ country, region, city, timezone }`), `languages`, `status`, `targetRoles`, `yearsExperience`,
`availability`, `deliveryModes`, `employmentTypes`. Photo, location and languages come from the
`users` document and are passed into the serialiser rather than duplicated onto the profile.

### `POST /api/me/candidate-profile/publish`

**Request** — `{ "status": "discoverable" | "private" }` (defaults to `discoverable`).

Refuses with `400` and names the gaps when PRD §8.5 publication requirements are unmet.

### `GET` / `PATCH /api/me/candidate-profile/visibility`

Reads or sets `status` (`draft | private | discoverable | paused | archived`) and
`contactVisibility` (`hidden | authorized_recruiters | after_interest | on_request`).

**Notes** — Leaving `draft` is publication and carries the same requirements. Moving to `paused`
deliberately does **not** revoke existing access: PRD §4.3 defines paused as hidden from *new*
searches only.

### `POST` / `DELETE /api/me/candidate-profile/blocked-companies[/:companyId]`

A block overrides every permission the company holds, checked before and independently of the role
matrix (ADR-006).

---

## 6c. Endpoints — company, interest, messages (CAN-06 … CAN-09)

### `GET /api/me/companies/:slug/relationship` · `PUT`/`DELETE .../saved`

The candidate's own relationship to a company: `saved`, and any active `interest`. Company
*content* still comes from `/api/public/companies/:slug`, so the signed-in and anonymous views can
never disagree. Saving is idempotent by unique index.

### `GET /api/me/interests/consent-disclosure`

PRD §8.7 step 6 — exactly what a company will receive, built from the candidate's own visibility
settings rather than hard-coded copy that could drift from reality.

### `POST /api/me/companies/:slug/interest`

**Request** — `{ "hiringIntentId": "…", "message": "…", "consent": true }`

Creates the interest **and** the `accessGrant` (PRD §8.7 step 7). `consent` must be literally
`true`. Idempotent by the same unique partial index the public path uses — a retry returns `200`
`already_submitted`, never a duplicate. A profile without a headline and at least one target role
is refused with the gaps named (step 3). A closed hiring intent returns `INTENT_CLOSED` with the
general-interest alternative.

### `GET /api/me/interests` · `POST /api/me/interests/:interestId/withdraw`

Company, role, date, status, and withdraw. **Withdrawing also withdraws the access grant** unless
another active interest in the same company still justifies it — otherwise "withdrawn" would not
actually withdraw anything.

> Statuses beyond `submitted` are set by the recruiter's interest inbox (REC-11), which is not
> built. Records therefore stay at "Submitted" — that is the accurate current state.

### `GET /api/me/conversations` · `GET /api/me/conversations/:id` · `POST .../messages` · `POST .../respond` · `PUT .../mute` · `POST .../report`

Thread list, thread with messages, reply, and the PRD §11.2 candidate actions.

**`POST .../respond`** — `{ "accepted": true | false }`. Accepting records the state; **declining
closes the thread to further candidate replies and mutes it, without deleting anything** — the
messages are the record a moderation or audit review would need (§16.3). Accepting again reopens
replies. Replying to a `pending` thread accepts it implicitly, since asking someone to click
"accept" before a message they have already written would be ceremony.

**`PUT .../mute`** — `{ "muted": true | false }`. Idempotent. A muted thread stays fully listed and
readable; only notifications stop, so nothing is hidden from the candidate.

**Block** is deliberately not here: PRD §8.2 assigns company blocking to CAN-04, and a block is
company-wide rather than per-thread.

Both endpoints return `404` for a thread the caller does not own — never `403`.

**A candidate may only reply inside a thread a company opened.** Unsolicited candidate-to-company
messaging is not a missing feature — it would make the platform a cold-outreach channel, which PRD
§11.2 does not describe. Until REC-15 ships, the inbox is legitimately empty. Opening a thread
clears the candidate's unread count only; read state is per side. Reporting flags a thread for
moderation without deleting it, because the content is the evidence.

---

## 7. Endpoints — companies

### `POST /api/companies`

**Purpose** — Create a company. The creator becomes its `owner` via a `CompanyMember` row.

**Authentication** — Bearer. Any authenticated user may create one: it grants a **membership**,
not a new identity.

**Request** — `{ "name": "…", "organizationType": "tutoring_center", "country": "IN" }`

**Notes** — The slug is derived from the name and must be unique.

## 7a. Endpoints — company workspace (REC-01 … REC-12)

### `GET /api/me/invitations` · `POST .../accept` · `POST .../decline`

REC-01 join. An invitation **is** a `CompanyMember` row with status `invited` — the same record
that becomes the membership on acceptance, so there is no second table to reconcile. Accepting
flips it to `active`, which is the entire permission change: ADR-001 derives the recruiter
capability from an active membership.

These live on the personal surface because the invitee is not yet a member, so
`resolveCompanyContext` could never authorise them. Every query is scoped to the caller, and an
invitation addressed to somebody else returns **404, never 403**.

Creating invitations is REC-07, documented below.

### `GET /api/companies/:companyId/editor` · `PATCH .../steps/:stepKey`

REC-02 wizard. Returns the editable company, per-step progress, and the publish checklist. Accepts
an id **or a slug**.

Steps are `basics`, `brand`, `footprint` — covering exactly the fields PRD §7.3 marks required for
publication. **A step may only write its own fields**, so a crafted body cannot reach another
step's data. A partial step is a valid save: the wizard is draft-first (§7.2), and requirements
are enforced at publish time.

### `GET /api/companies/:companyId/preview`

REC-06. Returns `{ preview, publish, status, publishedAt, publicUrl }`, where `preview` comes from
**`serialisePublicCompany` — the same serialiser PUB-02 uses**. What a recruiter reviews is what
gets published; only reachability differs.

### `POST /api/companies/:companyId/publish` · `POST .../unpublish`

Publishing enforces the §7.3 requirements server-side and is the only transition that makes a
company anonymously readable. Unpublishing returns it to `draft`, withdrawing it from the
directory and public profile while preserving the record and its slug (§9.3 treats archiving as a
separate, heavier state). `publishedAt` records the *first* publication and is not rewritten by a
republish.

### `GET /api/companies/:companyId/invitations` · `POST` · `.../resend` · `.../cancel`

REC-07. `member:manage` throughout — the permission §4.2 gives owners and admins only. Reading the
list is gated as tightly as sending, because the list is a roster of people's email addresses.

An invitee need not have an account: the invitation binds to the address and is claimed by whoever
**verifies** it (§6.4). No shell user is created — `signup` refuses an address that already exists,
so creating one would lock the invitee out of registering.

`member:manage` is not the whole answer. Inviting someone as `owner` additionally requires
`company:transfer`, so an admin cannot mint a second owner and reach ownership sideways.
Duplicates are impossible by index rather than by check: a partial unique index on
`{companyId, invitedEmail}` filtered to `status: 'invited'`. Resending is rate-limited per
invitation (60s), so the button cannot be used to mail-bomb whoever was invited. Cancelling marks
the row `removed` and retains it (§21.6).

### `GET /api/companies/:companyId/members` · `PATCH .../:memberId` · `DELETE .../:memberId`

REC-18 (team and permissions). `member:manage` gates all three. Anything touching an OWNER — promoting to one, changing
one's role, removing one — additionally requires `company:transfer`, checked in the service beside
the last-owner guard it works with.

Two invariants: a company can **never be left without an owner** (§21.2), and nobody may change or
remove their own membership. Removal writes `status: 'removed'`, never a delete. A role change
takes effect on the target's very next request, because permissions are re-read per request
(ADR-006) rather than baked into a token.

### `POST /api/companies/:companyId/members/:memberId/transfer-ownership`

REC-18. Owner-only. Promotes the successor and demotes the caller to **admin** — a transfer, not a
resignation — then asserts exactly one active owner remains before returning.

Deliberately not "promote, then demote": that sequence passes through a two-owner state and would
stay there if the second write failed. With no transactions available on a standalone MongoDB
(I-03) the order is chosen to fail safe — promote first, so a crash between the writes leaves two
owners, which is recoverable, rather than none, which is not.

### `GET /api/companies/:companyId/dashboard`

REC-10 company home. Open to any ACTIVE member with **no** `requirePermission`: this is where a
member lands after switching company, so gating the whole page would leave a viewer with nowhere
to go. Sections are withheld individually instead, and a count the caller may not see comes back
as `null` rather than `0` — "withheld" and "none" are different facts.

Owns no data. The publish checklist is `buildPublishChecklist`, the same function REC-06 refuses
to publish against, so the dashboard cannot invite someone to publish a page the publish endpoint
would reject.

### `GET /api/companies/:companyId/interests` · `PATCH .../:interestId` · `POST .../viewed`

REC-11 interest inbox. `interest:view`, which §4.2 grants to every company role. Reads the **same**
`expressionsOfInterest` rows CAN-07 writes and CAN-08 shows the candidate — there is no
recruiter-side interest model.

Every row passes through `resolveCandidateAccess` before its profile summary is attached, so a
candidate who blocked this company, or paused after writing to it, is not rendered from stale
data. Contact details follow the CANDIDATE's rule and never the recruiter's role: an owner sees
nothing a viewer would not.

A recruiter may set `viewed`, `contacted`, `progressed`, `closed`. **`withdrawn` is not settable**
— §21.5 gives withdrawal to the candidate alone, and a withdrawn interest cannot be reopened by
the company. `POST .../viewed` only ever moves `submitted → viewed`, so opening one a colleague has
already progressed changes nothing.

Filters: `status` (multi), `hiringIntentId`, `generalOnly`, `q`, `sort`, `page`, `limit`. Offset
paging, because the inbox shows per-status counts that need a stable total. Those counts ignore
the active filter, so the tabs stay still while a recruiter narrows down.

### `GET /api/companies/:companyId/search/candidates`

REC-12 talent search. `candidate:search` — owner, admin and recruiter; withheld from hiring manager
and viewer (§21.4). All query construction lives in `modules/search/search.service.js` per
**ADR-010**; no other module builds a search query.

Blocks and visibility are the FIRST `$match`, before the join, the facets, the count and the
paging. §21.4 requires them applied "before results are displayed, not after ranking", and a
post-filter would let an excluded candidate leave a hole in a page. Only `discoverable` profiles
appear: `private` and `paused` are reachable through a grant but are excluded from search by §4.3,
grant or no grant.

Facets: `role`, `subject`, `learnerSegment`, `employmentType`, `deliveryMode`, `availability`,
`country`, `language` — OR within a facet, AND between facets (§21.4). Plus `region`, `minYears`,
`maxYears`, and `q` across headline, summary, subjects, roles and name. Country, region and
language live on `users`, so the pipeline joins the personal layer rather than pretending they sit
on the profile.

Each result carries `matchedOn`: which of the caller's own criteria it satisfied (§21.4, "show why
each candidate matches"). It is an explanation, never a score — nothing is summed or weighted, and
**there is no relevance sort**. §10.3 forbids implying objective quality ranking, and with no
relevance signal in the data a "best match" option would be an arbitrary order wearing an
authoritative name. Sorts are `recent`, `newest`, `name`.

Cards are built from `toRecruiterView()` — the one recruiter representation, shared with CAN-03 —
then stripped of evidence and contact. This screen is discovery: a card is a reason to open a
profile, not a substitute for opening one.

---

## 8. Endpoints — public (unauthenticated)

`GET /api/public/companies` (directory, filtered/paginated) · `GET /api/public/companies/facets`
(filter counts) · `GET /api/public/companies/:slug` (published profile) ·
`POST /api/public/companies/:slug/interest` (expression of interest).

**These serve published company data only and can never reach a candidate collection** (PRD §21.2).

---

## 9. Endpoints — marketing

### `POST /api/public/early-access`

**Purpose** — Capture an early-access / pilot waitlist request from the marketing landing page
(MKT-01). **Does not create a user account** — see ADR-014 for why these are deliberately
separate.

**Authentication** — None. Public endpoint.

**Request**
```json
{
  "segment": "business",
  "name": "Priya Raman",
  "email": "priya@sevensquare.example"
}
```
| Field | Type | Required | Rules |
|---|---|:--:|---|
| `segment` | string | ✅ | `business` \| `educator`. **Marketing segmentation only — never written to `users`** (ADR-001) |
| `name` | string | ✅ | 1–120 chars, trimmed, Unicode permitted (PRD §19 i18n) |
| `email` | string | ✅ | Valid email, lowercased and trimmed by the schema before storage |

Validated by `earlyAccessRequestSchema` in `packages/shared` — the same schema the React form
uses (ADR-009).

**Optional request header**
| Header | Purpose |
|---|---|
| `x-landing-path` | Page the form was submitted from. Must be listed in the CORS `allowedHeaders` allowlist, or the browser blocks the request after a successful preflight |

**Server-derived fields** — never accepted from the client body:
`consentedAt` (submission time), `source.referrer`, `source.utm*`, `source.landingPath`,
`ip`, `userAgent`, `status`, `submissionCount`.

**Response — `201`**
```json
{ "success": true, "data": { "status": "received" } }
```

**Response — `200`** (idempotent replay — same email already on the list)
```json
{ "success": true, "data": { "status": "already_registered" } }
```

Both responses render the identical confirmation in the UI. The distinction exists for
analytics, not for the user — see Notes.

**Errors**
| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed input; `details` keyed by field |
| 429 | `RATE_LIMITED` | Per-IP and per-email limits (PRD §16.4) |

**Collections** — `earlyAccessRequests`

**Notes**
- **Idempotent** by unique index on `email`. A resubmission updates `name`, `segment`,
  `lastSubmittedAt`, and increments `submissionCount`; it never creates a duplicate and never
  returns `409`. A concurrent duplicate that loses the race on the unique index is caught and
  returned as `already_registered` rather than surfacing as an error.
- **Operator-managed fields survive resubmission.** `status` and `notes` are never overwritten,
  so triage work is not lost when a lead submits the form again.
- **The response must not reveal whether an email is already on the list.** Both outcomes return
  success and the UI renders an identical confirmation. Returning a distinguishable error would
  make this endpoint an email-enumeration oracle — the same reasoning that governs password reset
  in PRD §6.3 (AUTH-11).
- Rate limited via `publicWriteLimiter` (5 per hour per IP). Skipped when `NODE_ENV=test`.
- No email is sent to the submitter in MVP; onboarding is operator-initiated (ADR-014).

**Tests** — `apps/api/tests/integration/earlyAccess.test.js` (9 cases): storage, email
normalisation, idempotency, non-enumeration, operator-field preservation, and four validation
cases including rejection of client-supplied server-owned fields.
