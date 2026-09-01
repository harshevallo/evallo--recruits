# 15 — Data Processing Inventory

**Last updated:** 2026-08-27 (re-read out of the models; `mediaAssets` added — see the warning in §2)
**Status:** Engineering record of fact. **Not legal advice and not a Privacy Policy.**

---

## What this document is for

Two jobs, one analysis:

1. **The brief for whoever writes the Terms and Privacy Policy** (D-09). A drafter — counsel or a
   template service — needs to know exactly what personal data this system collects, why, who it
   reaches, and how long it is kept. Producing that list is normally the slow part of getting a
   policy written, and it is engineering work, not legal work.
2. **The input to the retention decision** (B-09, `12_KNOWN_ISSUES.md` I-17). The per-collection
   table below is the same table that has to be answered "delete / anonymise / retain" before the
   account-deletion purge can be built.

Everything here was read out of the models and services on 2026-08-27, not from the other
documents. Where the code and an older document disagree, the code is what runs.

---

## 1. What the founder must supply

None of this is derivable from the codebase, and a policy cannot be written without it.

| # | Needed | Notes |
|---|---|---|
| 1 | Legal entity name and registered address | The named controller in the policy |
| 2 | Jurisdictions claimed | India DPDP 2023, GDPR (any EU/UK users?), others. **This changes the retention answers** |
| 3 | Grievance / privacy contact | DPDP expects a named contact; GDPR may require a representative |
| 4 | Governing law and dispute venue | Terms |
| 5 | ~~Where the database physically lives~~ | **Largely determined 2026-08-12 — see §11.** Residual items: backup location, and confirmation of the exact region |
| 6 | Age floor for account holders | Nothing in the code enforces a minimum age; the product is education-sector but candidates are adults |
| 7 | Retention periods | See §7 — the open decision |

---

## 2. Roles

For candidate and company data the platform acts as the **controller** — it decides what is
collected and why. Recruiter notes and pipeline records are written *by companies about people*
through the platform, which is a shared arrangement worth naming explicitly in the policy; the
technical position is that the platform stores, serves and access-controls them.

**Sub-processors in use today:** SendGrid (transactional email), Google (Sign-In), and whoever
hosts the MongoDB instance. There is no analytics, no tag manager, no advertising pixel, no error
tracker, and no A/B tooling anywhere in `apps/web` — verified by search.

---

## 3. Personal data by collection

"Whose data" matters as much as "what": several collections hold one person's data written by
someone else.

### Identity and access

| Collection | Personal data | Whose | Purpose | Current retention |
|---|---|---|---|---|
| `users` | name, email, bcrypt password hash, `googleId`/`microsoftId`, profile picture URL, headline, **phone**, location (country/region/city/timezone), languages, notification preferences, `lastLoginAt`, failed-login counters | The account holder | Account identity, authentication, personal profile layer | **Indefinite.** `deletionRequestedAt` and `deletedAt` exist; nothing writes `deletedAt` |
| `authSessions` | user id, refresh-token **hash**, **IP address**, **user agent**, expiry, revocation reason | Account holder | Session management, reuse detection | Self-pruning — **TTL index on `expiresAt`** |
| `verificationTokens` | token hash, email, purpose | Account holder | Email verification, password reset | Self-pruning — **TTL index on `expiresAt`** |

Raw passwords are never stored, and refresh tokens are stored only as hashes. Google's ID token is
verified and discarded — only the stable `googleId` is kept.

### Candidate profile — written by the person about themselves

| Collection | Personal data | Purpose | Current retention |
|---|---|---|---|
| `candidateProfiles` | headline, summary, target roles, subjects, learner segments, employment types, delivery modes, availability, years of experience, visibility state, contact-visibility rule, blocked company ids | The professional profile recruiters search | Indefinite |
| `candidateAnswers` | free-form answers to question-bank items | Structured profile content | Indefinite |
| `experiences` | role, organisation, location, dates, description, outcome | Employment history | Indefinite |
| `educationEntries` | institution, qualification, field of study, dates | Education history | Indefinite |
| `credentials` | credential name, type, issuer, result/score, **`documentUrl` (an external link the candidate hosts)** | Evidence layer | Indefinite |
| `evidenceItems` | title, URL, provider, prompt | Teaching samples — YouTube/Vimeo embeds only | Indefinite |
| `savedCompanies` | candidate id, company id | The candidate's own shortlist | Indefinite |
| `mediaAssets` | **the bytes of a profile photograph**, content type, byte length, owner user id | Profile photo (ADR-020) | Until replaced or the account is purged |

> **⚠️ `mediaAssets` was missing from this inventory until 2026-08-27.** It was added to the codebase
> on 2026-08-26 by ADR-020, after this document's previous audit, and it is the **only** collection
> here that stores a photograph of a person's face. Anyone drafting the privacy policy from an
> earlier revision of this table was working from an incomplete list. It is the clearest example of
> why this document has to be re-read out of the models rather than maintained by memory.

**One kind of file upload now exists: profile photos** (ADR-020, 2026-08-26). The sentence that
stood here previously — *"No file uploads exist anywhere in the system"* — is no longer true and has
been corrected. The narrower statement still holds: there is **no object store**, and for everything
other than a profile photo the platform holds *links*, not documents — credential documents and
teaching samples are URLs the candidate hosts elsewhere. See §5, because embedding third-party media
has its own disclosure.

Retention note for B-09: the ADR-020 deletion purge **does** delete the asset row, not merely the
pointer — otherwise a photograph of a face would outlive the account, reachable by anyone still
holding the URL. That is already implemented in `accountDeletion.job.js`; it is the one part of the
purge that is not blocked on the retention decision.

### Data about a candidate, written or held by a company

This is the group that needs the most care, in both the policy and the deletion decision.

| Collection | Personal data | Whose | Written by | Current retention |
|---|---|---|---|---|
| `expressionsOfInterest` | candidate id, **contact name and email captured at submission**, message, consent record (`grantedAt`, `scope`), **IP**, **user agent** | Candidate | Candidate → company | Indefinite |
| `accessGrants` | candidate id, company id, `withdrawnAt` | Candidate | System | Indefinite |
| `conversations` | candidate id, company id, state, mute/report flags | Both | Both | Indefinite |
| `messages` | **message body (up to 5 000 chars)**, sender type, sender user id, read receipts | Both | Both | Indefinite |
| `notes` | **free-text recruiter notes about the candidate**, author user id | Candidate | Company staff | Indefinite |
| `pipelineEntries` | candidate id, stage, stage history, rejection reason code and note, owner | Candidate | Company staff | Indefinite |
| `savedCandidates` | candidate id, company id, saving user | Candidate | Company staff | Indefinite |
| `auditEvents` | actor user id, actor company id, action, target, metadata, **IP**, **user agent** | Both | System | Indefinite — **PRD §16.1 requires this trail to survive deletion** |

`notes` deserves a specific decision: it is one person's opinion about another, held by a third
party, and by design the candidate cannot see it. Whether it is disclosable on an access request,
and what happens to it when the subject deletes their account, are policy questions rather than
engineering ones.

### Collected before any account exists

| Collection | Personal data | Purpose | Current retention |
|---|---|---|---|
| `earlyAccessRequests` | name, email, segment, **IP**, **user agent**, referrer and UTM parameters, landing path, `consentedAt`, internal notes | Marketing waitlist | Indefinite unless `EARLY_ACCESS_RETENTION_DAYS` is set (proposed: 24 months). Still **no operator UI and no self-serve deletion** |

This is the sharpest exposure in the table: the marketing form collects identifiable data from the
public today, records that consent was given to Terms and a Privacy Policy **that do not exist**,
and a person who never created an account has no route to see, correct or delete it. Tracked as
TD-06 / ADR-014.

### Company records (not personal data, listed for completeness)

`companies`, `hiringIntents`, `questionBank`. `companyMembers` and `companyJoinRequests` link a
**user** to a company with role, status and timestamps, so they are personal data about employment
relationships.

---

## 4. Where IP addresses and user agents are stored

Four places, all for abuse triage or audit: `authSessions`, `auditEvents`,
`expressionsOfInterest`, `earlyAccessRequests`. Only the first two are self-pruning — and only
`authSessions` actually is. This is worth a deliberate retention answer of its own, because IP
addresses are personal data in most regimes and these are the records most easily minimised.

---

## 5. Third-party recipients

| Recipient | What reaches them | When | Why |
|---|---|---|---|
| **SendGrid** (Twilio) | Recipient email address, message content, verification/reset links | Every transactional email | Delivery. `MAIL_PROVIDER=sendgrid` |
| **Google** | Google ID token verified server-side; `sub`, email, name, picture URL returned | Google sign-in | Authentication |
| **Google (browser)** | The **GSI script loads on every page** — `GoogleOAuthProvider` wraps the whole app, not just the auth screens | Every page view | Sign-in button. Consider mounting it only on auth routes to narrow this |
| **Google / Vimeo (browser)** | Viewer's IP and player cookies when an embedded teaching sample renders | Viewing a profile with media | Evidence playback |
| **Google (browser)** | Viewer's IP when a Google-hosted profile picture loads | Anywhere an avatar renders | Google sign-in supplies a Google-hosted image URL |
| **Database host** | Everything | Always | Storage. **DigitalOcean, India — see §11** |

The last three are browser-side disclosures that a cookie/tracking notice normally has to name,
and they exist even though the product itself sets no tracking cookies.

---

## 6. Cookies

**One cookie: `evallo_rt`.** The refresh token — `httpOnly`, `Secure` in production, `SameSite`
resolved from the deployment topology, scoped to `path=/api/auth`. Strictly necessary for
authentication; not used for analytics or profiling. The access token is held in memory only, and
no token is ever written to `localStorage`.

Any additional cookies come from the embedded Google and video-provider content above, not from
this application.

---

## 7. Retention — the open decision

**Current state: nothing is deleted yet, but the mechanism now exists.** Account deletion sets
`deletion_pending`, revokes sessions, locks both sign-in paths, and emails a restore link. The
purge itself is implemented and tested against the proposed policy in `16_RETENTION_POLICY.md`,
and is held behind **two switches that are both off by default** — so the founder/legal decision,
not a code change, is what turns it on (I-17, B-09).

To close it, three answers are needed:

1. **Grace period** between request and processing — and, together with it, whether the user can
   cancel. Sign-in is currently blocked for `deletion_pending` accounts, so a grace period with no
   cancellation route is a trap rather than a safeguard.
2. **Per-collection disposition** — delete, anonymise, or retain — across the §3 tables. The
   candidate's own content is straightforward; `expressionsOfInterest`, `messages`, `notes` and
   `pipelineEntries` involve a company that legitimately received the data; `auditEvents` must
   survive by PRD §16.1.
3. **Separate periods** for `earlyAccessRequests` and for the IP/user-agent fields in §4.

**All three now have a drafted answer awaiting sign-off in `16_RETENTION_POLICY.md`** — 30-day
grace with an emailed restore path, a per-collection disposition table, and separate windows for
marketing leads (24 months) and audit network identifiers (12 months). Approve or amend it there;
the code already implements what it describes.

---

## 8. Data-subject rights — implemented versus claimed

| Right | Status |
|---|---|
| Access / portability | ✅ `GET /api/me/settings/export` — completed 2026-08-12 |
| Rectification | ✅ Profile builder, entries and account settings are all editable |
| Erasure | 🟡 Requested, locked out, reversible by emailed link, and **processed once the retention switches are set** (`16_RETENTION_POLICY.md`). Awaiting policy sign-off, so nothing is purged today |
| Restriction of processing | ✅ Visibility states (`draft`/`private`/`paused`/`archived`), contact-visibility rules, per-company blocking, per-item visibility on evidence |
| Objection | ✅ Blocking a company; withdrawing an interest revokes the access grant |
| Consent withdrawal | ✅ Interest withdrawal; visibility change applies prospectively |
| Automated decision-making | ✅ None exists — search ranks, it does not decide |

**The export gap was closed on 2026-08-12.** It previously returned only the account fields,
notification preferences, a *summary* of the candidate profile and company memberships — so a
portability request would have been answered with almost none of the person's own content. It now
also includes question-bank answers, experience, education, credentials, portfolio media, saved
companies, expressions of interest, and conversations with their messages, pinned by
`dataExport.test.js`.

Still deliberately excluded: **recruiter notes and pipeline records**. Those are the company's
records *about* the person rather than the person's own content, and PRD §11.2 keeps internal notes
structurally separate from every candidate-facing surface — a test asserts they never appear.
Whether an access request should nonetheless surface them is the open legal question in §10.

---

## 9. Security measures, as implemented

Factual list for the policy's security section — bcrypt password hashing; JWT access tokens held in
memory with short expiry plus rotating refresh tokens in an httpOnly cookie, with reuse detection;
per-account lockout and IP rate limiting on authentication; Helmet security headers; MongoDB
operator-injection sanitisation; exact-origin CORS with no wildcard; candidate visibility enforced
inside database queries rather than after ranking; a single authorisation authority
(`candidateAccess.service`) for who may see a candidate; recruiter notes stored in a separate
collection from messages so cross-exposure is structurally impossible; and audit logging of profile
views and contact reveals.

Known weaknesses to disclose honestly rather than paper over: audit writes are fire-and-forget
(I-08); rate limiting is in-memory and per-instance (I-11); the database is a standalone server, so
transactions are unavailable (I-03); and there is no CSP yet.

---

## 10. Summary of what blocks a policy being written

| # | Blocker | Owner |
|---|---|---|
| 1 | Items 1–4 and 6 in §1 — entity, jurisdictions, contact, governing law, age floor | Founder |
| 2 | Retention periods (§7) | Founder + legal |
| 3 | Whether recruiter notes are disclosable on an access request | Founder + legal |
| 4 | ~~Export completeness~~ — **done 2026-08-12** | ✅ |
| 5 | `earlyAccessRequests` — a retention window is now implemented (`EARLY_ACCESS_RETENTION_DAYS`, unset by default); there is still no *self-serve* deletion route for someone who never signed up | Engineering, once (2) is decided |
| 6 | Backup location and region confirmation (§11) | Infrastructure owner (`pushpendu@`) |

---

## 11. Database hosting — determination

Established 2026-08-12 by direct inspection, because `100.84.170.103` is a **Tailscale tailnet
address** (`100.64.0.0/10`, CGNAT space). Such an address is an overlay identity and carries **no
geographic meaning whatsoever** — it cannot be geolocated, and reading a region from it would be a
mistake.

### Evidence

| Fact | How established |
|---|---|
| Node `ev-ind-test-db.tailc0b39e.ts.net`, Linux, owned by tailnet user **`pushpendu@`** | `tailscale status` |
| Public endpoint **`139.59.91.127`**, reached directly (71 ms RTT, no relay) | `tailscale ping 100.84.170.103` |
| **DigitalOcean** — `139.59.80.0/20`, registrant `DIGITALOCEAN-AP`, **registry country `IN`** | APNIC RDAP lookup |
| Tailscale DERP home region **`blr`** (Bangalore) for the node | `tailscale status --json` → `Relay` |
| MongoDB **8.2.2**, standalone (not a replica set) | `buildInfo`; `hostInfo`/`serverStatus` return `Unauthorized` — the application user has no cluster-admin rights, which is correct |
| Port 27017 is **not reachable on the public IP**; open only over the tailnet | TCP connect to both addresses |

### Determination

The data resides on a **DigitalOcean droplet in India**, almost certainly the **BLR1 (Bangalore)**
region — the registry country, the lowest-latency DERP region, and the host's own name all agree.

**Two distinctions legal needs, not just "India":**

1. **Location is India; the processor is a US company.** DigitalOcean LLC is US-incorporated (the
   RDAP address is its Colorado corporate address, *not* the datacentre). Domestic storage does not
   by itself resolve foreign-legal-process exposure, and a DPDP or GDPR analysis usually turns on
   the processor's identity as well as the storage location.
2. **Backups are the usual thing that breaks an "in-India" claim.** DigitalOcean droplet backups
   and snapshots can be configured to a different region. That has not been established here and
   **cannot be established from this machine** — it needs the DigitalOcean console.

### Still needs the infrastructure owner (`pushpendu@`)

1. Confirm the droplet region in the DigitalOcean console (evidence is strong but indirect).
2. **Where backups and snapshots are stored, and whether replicated across regions.**
3. Whether any monitoring or management agent on the box ships data off-host.
4. Whether this host is intended to hold real personal data at all — see the caution below.

### Governance cautions raised by this determination

- **The host is named `-test-db`, but the database holds real records** — real user accounts and
  founder-created companies sit alongside seeded demo data. A test-tier box holding live personal
  data is a governance mismatch: either it is production and should be treated as such (documented
  backups, TLS, replica set, credential hygiene, access control), or the real data should not be
  there. This is the same shared database the integration suites run against.
- **Database credentials are weak and the connection string carries no TLS.** Transport is
  encrypted in practice because everything traverses Tailscale (WireGuard), and 27017 is not
  publicly exposed — so this is not an active breach. But credentials of this strength on a host
  holding real personal data should be rotated before pilot, and TLS enabled once the server is
  converted to a replica set (`08_SETUP_GUIDE.md` §1, `12_KNOWN_ISSUES.md` I-03).
- **No replica set means no transactions and, more importantly here, no documented backup story.**
