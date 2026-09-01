# 16 — Retention & Deletion Policy

**Status: 🟡 PROPOSED — awaiting founder/legal sign-off.**
**Last updated:** 2026-08-27 (adds `mediaAssets` — profile photographs — which was absent from both this policy and `15_DATA_INVENTORY.md` until this audit)

> This is an engineering proposal, not approved policy and not legal advice. It exists so the open
> decision in `12_KNOWN_ISSUES.md` I-17 / backlog B-09 has something concrete to approve or amend
> rather than a blank page.
>
> **The code implements this table, but does not run it.** Two independent switches must both be
> set before anything is destroyed — see §5. Until they are, the deletion job reports and deletes
> nothing, exactly as before.

Source of facts: `15_DATA_INVENTORY.md`.

> **⚠️ 2026-08-27 — a collection was missing from both documents.** `mediaAssets` (ADR-020,
> 2026-08-26) stores the **bytes of profile photographs** and appeared in neither the data inventory
> nor this table. It has been added to both. Anyone who reviewed an earlier revision of this policy
> was reviewing a list that omitted the most sensitive category of personal data in the system.
> Re-read the inventory out of the models before sign-off rather than trusting either document.

---

## 1. Principles applied

1. **PRD §16.1 requires an audit trail that survives deletion.** So this is anonymisation-first,
   not erasure-first, wherever a record is evidence of what happened.
2. **A record with two parties is not solely the candidate's to erase.** An interest a company
   legitimately received, and correspondence the company was part of, are that company's business
   records too. The candidate's *identity* is removed from them; the record survives.
3. **Referential integrity is preserved by tombstoning, not by cascade-deleting.** The candidate
   profile row is retained and emptied rather than removed, so every existing foreign key stays
   valid — and, critically, `candidateAccess.service` already denies `archived` profiles, so the
   privacy outcome comes from the authority that already exists rather than from new logic.
4. **Irreversible actions get two switches and a dry run.**

---

## 2. Grace period — PROPOSED: 30 days

`ACCOUNT_DELETION_RETENTION_DAYS = 30`, measured from `deletionRequestedAt`.

Thirty days is the common choice because it covers the two realistic failure modes — a change of
mind, and an account takeover where the attacker requests deletion to lock the owner out.

**A grace period is only meaningful with a way back, and there wasn't one.** Sign-in is refused for
`deletion_pending` accounts (correctly — that gate was hardened in the same pass). So a
**restore-by-email** path is implemented alongside this policy: requesting deletion sends a signed,
single-use restore link valid for the whole grace window. It reverses the request without ever
creating a session, so the lock-out and the recovery path do not conflict.

---

## 3. Account deletion — per-collection disposition

Applied when a `deletion_pending` account passes the grace period.

### Hard delete — the person's own content, referenced by nothing

`candidateAnswers` · `experiences` · `educationEntries` · `credentials` · `evidenceItems` ·
`savedCompanies` · `savedCandidates` (other companies' shortlist rows pointing at them) ·
`accessGrants` · `authSessions` · `verificationTokens` · `companyJoinRequests` (pending/withdrawn)

### Anonymise in place — identity removed, row retained

| Collection | Cleared | Retained | Why |
|---|---|---|---|
| `users` | name, email (→ unique tombstone), password hash, `googleId`/`microsoftId`, profile picture, headline, phone, location, languages, notification preferences | `_id`, `createdAt`, `status: deleted`, `deletedAt` | Every audit event and company record references this `_id`. Removing the row would orphan the §16.1 trail |
| `candidateProfiles` | headline, summary, all taxonomy arrays, availability, years of experience, blocked-company list | `_id`, `userId`, `status: archived`, `deletedAt` | Tombstone. Keeps interests, conversations and pipeline entries referentially valid; `archived` already denies every recruiter path |
| `expressionsOfInterest` | `contact.name`, `contact.email`, `ip`, `userAgent` | the row, its status, its consent record, **and `message`** | The company received this legitimately; the consent record is itself evidence |
| `companyMembers` | — | row, set `status: removed`, `removedAt` | Employment-relationship history the company relies on |
| `mediaAssets` | **the entire row, including the image bytes** | nothing | A photograph of the person's face. There is no tombstone need — nothing references it but `users.profilePicture`, which is cleared in the same pass — and no legitimate reason to keep a face after deletion. **Already implemented** (ADR-020, `accountDeletion.job.js`): this is the one deletion in this table that does not wait on the approval below, because a photo that outlived the account would stay reachable by anyone still holding its URL |

### Retained unchanged

| Collection | Why | ⚠️ |
|---|---|---|
| `auditEvents` | **Mandated by PRD §16.1.** Actor id becomes a pseudonymous key once `users` is anonymised | |
| `conversations`, `messages` | Correspondence the company is also a party to | Decision point |
| `notes`, `pipelineEntries` | The company's internal hiring records | **Sharpest decision point** |

**The two flagged rows are where legal input matters most.** `notes` in particular is one person's
free-text opinion about another, invisible to the subject by design. Retaining it is defensible as
the company's own record; deleting it is defensible as data about a person who asked to be
forgotten. **This proposal retains both, and the implementation makes either choice a one-line
change** (`RETAIN_COMPANY_RECORDS` in `accountDeletion.job.js`).

---

## 4. Other retention periods

| Data | PROPOSED | Rationale |
|---|---|---|
| `earlyAccessRequests` | **24 months** from last submission | Closes TD-06. Marketing leads collected before any account exists, currently kept forever with no deletion route |
| `ip` / `userAgent` on `auditEvents` | **scrub at 12 months**, keep the event | The event is the audit obligation; the network identifiers are abuse-triage data with a much shorter useful life |
| `authSessions`, `verificationTokens` | unchanged — already TTL-pruned | Self-expiring by index |

---

## 5. How this is switched on — deliberately awkward

| Variable | Default | Effect |
|---|---|---|
| `ACCOUNT_DELETION_RETENTION_DAYS` | **unset** | Unset ⇒ nothing is ever eligible. Reporting only |
| `ACCOUNT_DELETION_PURGE_ENABLED` | **false** | Even with a period set, `false` ⇒ the job still only reports |
| `EARLY_ACCESS_RETENTION_DAYS` | unset | As above, for the marketing table |
| `AUDIT_IP_RETENTION_DAYS` | unset | As above, for the IP/UA scrub |

**Both account switches must be set** before a single document is modified. Recommended rollout:
set the period first and read the job's report for a cycle or two to see exactly which accounts
would be affected; only then enable the purge.

---

## 6. Sign-off

| Item | Decision | Approved by | Date |
|---|---|---|---|
| 30-day grace period | ☐ | | |
| Restore-by-email path | ☐ | | |
| Per-collection table (§3) | ☐ | | |
| `notes` retained vs deleted | ☐ | | |
| `messages` retained | ☐ | | |
| `earlyAccessRequests` 24 months | ☐ | | |
| Audit IP/UA scrub at 12 months | ☐ | | |
| Jurisdictions this must satisfy | ☐ | | |
