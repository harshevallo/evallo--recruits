# 09 — Deployment Guide

> **Status: deployment target deliberately deferred by the CTO.** No provider has been chosen.
>
> This document records the **architectural constraints any deployment must satisfy**. These are
> already fixed by decisions made in `10_DECISION_LOG.md`, and knowing them now prevents choosing
> a target that cannot host the application. Concrete steps are written once the target is chosen.

---

## 1. Constraints the target must satisfy

| # | Constraint | Source | Consequence if violated |
|---|---|---|---|
| 1 | **Node 18+ with ESM support** | ADR-012 | The API will not start |
| 2 | Two independent builds from one repository | ADR-003 | CI must scope builds per workspace |
| 3 | **API and web should share a registrable domain** — e.g. `app.evallo.in` and `api.evallo.in` | ADR-005 | Cross-site refresh cookie needs `SameSite=None`, weakening CSRF posture |
| 4 | **MongoDB must be a replica set** | `05_DATABASE_SCHEMA.md` §11 | Transactions fail; interest submission cannot be made atomic |
| 5 | **Public routes served by Express, not a static host** | ADR-004 | SEO metadata injection and `/sitemap.xml` become impossible |
| 6 | Private file storage with time-limited signed URLs | PRD §16.4 | Candidate documents become publicly reachable — a privacy breach |
| 7 | HTTPS with HSTS | PRD §16.4 | `Secure` cookies will not be set |

**Constraint 3 is the one worth deciding early.** It is free to arrange now and awkward to change
after auth ships.

**Constraint 5 rules out a common MERN shortcut:** serving `apps/web` from a static CDN with the
API elsewhere. Public company pages must be served by Express so it can inject per-company
`<title>`, meta description, canonical, OG tags, and JSON-LD before responding. Authenticated
routes may still be served statically.

---

## 2. Production environment variables

Same variables as `08_SETUP_GUIDE.md` §3, with these differences:

| Variable | Production requirement |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_CLOUD` | Replica set with authentication and TLS, targeting the `evallo-recruit` database |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Distinct, ≥ 48 random bytes, from a secret manager — **never** from a repository file |
| `CLIENT_ORIGIN` | Exact production origin. **No wildcard** — incompatible with `credentials: true` |
| `APP_URL` | Production web origin — verification and reset links are built from it |
| `MAIL_PROVIDER` | `sendgrid` (or `smtp`). **`console` in production silently sends nothing** — verification links would only appear in server logs |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASS` | From a secret manager. For SendGrid: host `smtp.sendgrid.net`, user the literal `apikey`, pass the API key |
| `GOOGLE_CLIENT_ID` | Must also list the production origin as an authorised JavaScript origin in the Google Cloud console, or the button cannot render |
| `VITE_API_BASE_URL` | Baked in at build time — a rebuild is required to change it |

There is **no `COOKIE_DOMAIN` variable**; the refresh cookie is host-scoped — it is set by the API
host and sent back to the API host, which is where the refresh request goes.

### The refresh cookie is now configured, not assumed

`SameSite` is no longer hard-coded to `Lax`. It is resolved at boot from the topology you configure
(`src/lib/cookies.js`), and `GET /api/health` reports the answer:

| Variable | Purpose |
|---|---|
| `API_PUBLIC_URL` | The origin the **browser** uses to reach the API, e.g. `https://api.evallo.in`. Optional; without it the cookie keeps `SameSite=Lax` |
| `COOKIE_SAMESITE` | `auto` (default) \| `lax` \| `none` \| `strict`. An explicit value always wins |
| `COOKIE_SECURE` | Override; defaults to `true` in production |

Under `auto`:

| CLIENT_ORIGIN vs API_PUBLIC_URL | Resolved | Why |
|---|---|---|
| Same registrable domain (`app.evallo.in` → `api.evallo.in`) | `SameSite=Lax; Secure` | Same-site, so Lax is sent — the stronger CSRF posture, and the arrangement constraint 3 recommends |
| Different sites (`x.vercel.app` → `y.onrender.com`) | `SameSite=None; Secure` | Lax would never be sent cross-site; the session would die 15 minutes after sign-in |
| `API_PUBLIC_URL` unset | `SameSite=Lax` + a boot warning | The historical default, correct only for a same-site deployment |

**Production refuses to boot** if this resolves to `SameSite=None` without an `https` API origin —
browsers discard such a cookie, so the alternative is an application that starts happily and cannot
keep anyone signed in. `httpOnly` is unconditional in every mode; the refresh token is never
readable by JavaScript and is never placed in `localStorage`.

`CLIENT_ORIGIN` accepts a comma-separated list (apex + `www`, or a preview domain). Every entry is
matched **exactly** — the wildcard rejection at boot is unchanged.

**After deploying, check `GET /api/health` → `auth.refreshCookie` before anything else.** A
cross-site deployment reporting `"sameSite": "lax"` is misconfigured, and the symptom (users
silently signed out a quarter of an hour later) looks nothing like the cause.

### Background jobs

`src/jobs/` runs in the API process (`JOBS_ENABLED`, default on; always off under `NODE_ENV=test`).
Today it holds one job, `account-deletion-review`, which **reports** the `deletion_pending` queue
every six hours and deletes nothing — the retention policy is still an open decision (B-09).
`ACCOUNT_DELETION_RETENTION_DAYS` is intentionally unset. On a multi-instance deployment the job
would run once per instance; that is harmless while it is read-only, and must be revisited before
any purge pass is implemented.

Rotating `JWT_REFRESH_SECRET` invalidates every session and signs all users out. Treat it as a
planned action, not a routine one.

---

## 3. Build

```bash
npm ci
```
```bash
npm run build --workspace=apps/web
```

`apps/api` requires no build step — it runs ESM directly (ADR-012).

### Vercel — why there are TWO `vercel.json` files

Vercel reads **exactly one** `vercel.json`: the one at the project's configured **Root Directory**.
Anything deeper is ignored. This repo therefore ships one for each of the two ways the project can
be configured, and they describe the same deployment from their own vantage point:

| Root Directory | File Vercel reads | `outputDirectory` |
|---|---|---|
| repo root (blank / `./`) | `vercel.json` | `apps/web/dist` |
| `apps/web` | `apps/web/vercel.json` | `dist` |

Both carry the SPA catch-all rewrite, which client-side routing needs — without it a deep link like
`/me/portfolio` or a share link `/p/<token>` 404s on refresh. Static files still win over the
rewrite, so `/robots.txt` and `/assets/*` are served as real files.

**The failure this prevents**

> `No Output Directory named "dist" found after the Build completed.`

`dist` is the **Vite** preset default. The root `package.json` has no Vite dependency — it only
delegates (`npm run build --workspace=apps/web`) — so Vercel scanning the repo root cannot detect
Vite; it would look for `public`. Naming `dist` proves Vercel was looking at **`apps/web`**, and so
never read the root `vercel.json` that points at `apps/web/dist`.

Read the error the same way next time: **which directory Vercel names tells you which directory it
thinks is the root.**

**Preferred configuration:** Root Directory blank (the repo root). It is the correct shape for an
npm-workspaces monorepo — one config file, and the install covers every workspace, which matters
because `apps/web` imports `@evallo/shared` and Vite aliases `@shared` to `packages/shared/src`.
Both paths live outside `apps/web`, so an `apps/web` root additionally requires Vercel's *"Include
source files outside of the Root Directory"* setting to be on.

---

## 4. Deployment checklist

**Configuration**
- [ ] All required env vars set; secrets from a secret manager, not files
- [ ] `NODE_ENV=production`
- [ ] `CLIENT_ORIGIN` exact, no wildcard
- [ ] `APP_URL` is the production web origin
- [ ] `MAIL_PROVIDER` is **not** `console`, and a test email actually arrives
- [ ] Web and API share a registrable domain so the refresh cookie is sent — or, if they genuinely
      do not, `API_PUBLIC_URL` is set so the cookie resolves to `SameSite=None; Secure`
- [ ] `GET /api/health` → `auth.refreshCookie` matches the deployment you actually built
- [ ] Sign in, wait for the access token to expire (or force a refresh), and confirm the session
      survives — this is the check that catches a wrong `SameSite`, and nothing else does
- [ ] Production origin registered in the Google Cloud console (if Google sign-in is enabled)

**Database**
- [ ] Replica set confirmed (`rs.status()`)
- [ ] Authentication and TLS enabled
- [ ] **All indexes from `05_DATABASE_SCHEMA.md` created** — especially the unique partial index on
      `interests`, without which duplicate submissions are possible under concurrency
- [ ] Automated backups configured **and a restore actually tested** (PRD §16.4 requires restore
      testing, not just backups)

**Security**
- [ ] HTTPS enforced; HSTS enabled
- [ ] Helmet headers active
- [ ] Rate limiting active on auth, verification resend, reset, and messaging
- [ ] File storage private; only signed time-limited URLs issued
- [ ] `npm audit` clean of high/critical
- [ ] Verify `/api/public/*` returns no candidate data (PRD §21.2) — test this explicitly

**SEO** *(when PUB-02 ships — ADR-004)*
- [ ] `/robots.txt` blocks candidate, search, message, pipeline, and account routes
- [ ] `/sitemap.xml` lists published companies only
- [ ] Draft/paused/archived/restricted pages emit `noindex`
- [ ] A published page's served HTML contains title, description, canonical, OG tags, and JSON-LD
- [ ] Search Console verified, sitemap submitted, **and an owner named for the ADR-004 exit
      criteria** — otherwise the Stage 2 trigger is never checked (TD-02)

**Verification**
- [ ] `/api/health` reports the database connected
- [ ] Sign-up → verify → password → sign-in works end to end
- [ ] A session survives a page refresh (refresh cookie works cross-origin)
- [ ] Logout invalidates the refresh cookie — a subsequent `POST /api/auth/refresh` is `401`
- [ ] A published company page loads without authentication
- [ ] A draft company page is **not** publicly accessible
- [ ] `/terms` and `/privacy` load. **They are structurally real but state that the approved text is
      pending (D-09).** Sign-up claims consent to both, so shipping to real users with the text
      still unpublished is a legal decision, not a technical one

---

## 5. Open decisions

| # | Decision | Needed by |
|---|---|---|
| D1 | Hosting target for `apps/api` | Before first deploy |
| D2 | Hosting for `apps/web` — must respect constraint 5 for public routes | Before PUB-02 |
| D3 | MongoDB Atlas or self-managed (determines Atlas Search availability — ADR-010) | Before REC-12 |
| D4 | Transactional email provider | **Before M1** — blocks email verification |
| D5 | File storage provider | Before M3 |
| D6 | CI/CD pipeline | Before first deploy |
| D7 | Error tracking and log aggregation (PRD §19 Observability) | Before pilot |
