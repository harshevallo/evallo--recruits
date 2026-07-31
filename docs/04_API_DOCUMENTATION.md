# 04 — API Documentation

**Base URL:** `/api` · **Format:** JSON · **Auth:** Bearer access token (ADR-005)

> **Status: no endpoints implemented yet.** This document defines the conventions every endpoint
> must follow, and the template each entry uses. It is updated **in the same commit** as the
> endpoint it documents — an undocumented endpoint is an incomplete endpoint.

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

## 4. Endpoints

*None implemented. First entries land with M1 (authentication).*
