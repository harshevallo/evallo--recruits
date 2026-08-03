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

There is **no `COOKIE_DOMAIN` variable**; the refresh cookie is host-scoped. Web and API must
therefore share a registrable domain (or the API must be reachable on the same site) for the
cookie to be sent — see `03_TRD.md` §13.

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

---

## 4. Deployment checklist

**Configuration**
- [ ] All required env vars set; secrets from a secret manager, not files
- [ ] `NODE_ENV=production`
- [ ] `CLIENT_ORIGIN` exact, no wildcard
- [ ] `APP_URL` is the production web origin
- [ ] `MAIL_PROVIDER` is **not** `console`, and a test email actually arrives
- [ ] Web and API share a registrable domain so the refresh cookie is sent
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
- [ ] A published company page loads without authentication
- [ ] A draft company page is **not** publicly accessible

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
