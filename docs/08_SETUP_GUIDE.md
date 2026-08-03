# 08 — Setup Guide

> **Status:** current as of 2026-08-02. Every command below has been run on Windows 11 with
> Node v22.17.0 and npm 10.2.0, and verified working.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | **18 LTS or newer** | ESM is used throughout with no transpiler (ADR-012). Node 16 and below will not run this project |
| npm | 9+ | Workspaces (ADR-003). Ships with Node 18 |
| MongoDB | 6.0+ | Local, Docker, or Atlas |
| Git | any recent | |

Check:
```bash
node --version && npm --version
```

### MongoDB — a standalone works for M0, but you need a replica set from M1

`05_DATABASE_SCHEMA.md` §11 lists four operations that require multi-document transactions:
**refresh-token rotation (M1)**, ownership transfer (M2), company publish (M2), and interest
submission (M4). A standalone `mongod` silently does not support them, so those paths behave
differently in development than in production — and only under concurrency, which is the worst
way to discover it.

**`GET /api/health` reports `database.supportsTransactions`, so this is never a silent problem.**

M0 runs fine on a standalone. Convert before starting M1.

#### Option A — Docker (cleanest)
```bash
docker run -d --name evallo-mongo -p 27017:27017 mongo:7 --replSet rs0
```
```bash
docker exec -it evallo-mongo mongosh --eval "rs.initiate()"
```

#### Option B — convert an existing Windows MongoDB service
If MongoDB is installed as a Windows service (the default installer path), edit
`C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg` and add:

```yaml
replication:
  replSetName: rs0
```

Then, in an **Administrator** PowerShell:
```powershell
Restart-Service MongoDB
```
```powershell
mongosh --eval "rs.initiate()"
```

Confirm with `rs.status()`, then switch `MONGODB_CLOUD` in `apps/api/.env` to the
`?replicaSet=rs0` form shown in `.env.example`.

> A single-node replica set is fully supported and behaves like production for transaction
> purposes. You do not need three nodes locally.

#### Option C — MongoDB Atlas
Atlas is a replica set by default. No extra step.

---

## 2. Install

```bash
git clone <repository-url>
cd evallo-recruit
npm install
```

One `npm install` at the root installs all three workspaces (ADR-003). Do **not** run `npm
install` inside `apps/web` or `apps/api` — it creates nested `node_modules` and breaks workspace
resolution.

---

## 3. Environment variables

Two files, both created from committed `.env.example` templates. **Neither `.env` is ever
committed.**

### `apps/api/.env`
| Variable | Required | Notes |
|---|:--:|---|
| `NODE_ENV` | | `development` (default) / `test` / `production` |
| `PORT` | | Default `5000`; this project currently runs the API on **`8081`** |
| `MONGODB_CLOUD` | ✅ | Must target the **`evallo-recruit`** database. See the warning below |
| `CLIENT_ORIGIN` | ✅ | Exact web origin for CORS — currently `http://localhost:3001`. A wildcard is rejected at boot: it is incompatible with `credentials: true` (ADR-005) |
| `APP_URL` | | Public URL of the web app; used to build verification and reset links. Currently `http://localhost:3001` |
| `JWT_ACCESS_SECRET` | prod only | Long random string. **Must differ from the refresh secret.** Development falls back to a fixed dev secret |
| `JWT_REFRESH_SECRET` | prod only | As above. Production **refuses to boot** without both |
| `ACCESS_TOKEN_TTL` | | Default `15m` (ADR-005) |
| `REFRESH_TOKEN_TTL_DAYS` | | Default `30` |
| `MAIL_PROVIDER` | | `console` (default) · `smtp` · `sendgrid` |
| `MAIL_FROM` / `EMAIL_SENDER` | | From address. `EMAIL_SENDER` wins when both are set |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` / `EMAIL_PASS` / `EMAIL_SECURE` | for SMTP | `SMTP_*` is accepted as an alias. `EMAIL_SECURE` is inferred from port `465` when unset |
| `GOOGLE_CLIENT_ID` | | Google sign-in. Unset ⇒ button renders disabled, email auth unaffected |
| `GOOGLE_CLIENT_SECRET` | | Accepted but **not used** — verifying an ID token needs only the client id and Google's public keys |

> **`MONGODB_CLOUD` must point at `evallo-recruit`.** The `evallo` database belongs to the main
> Evallo platform and is out of scope for this project — never read from or write to it.
> `authSource=evallo` in the connection string only selects where credentials are checked; it does
> **not** change where application data is stored.

There is no `COOKIE_DOMAIN`, `MICROSOFT_*`, or `STORAGE_*` variable yet — those arrive with their
milestones. Anything not in the table above is not read by the API.

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The API **validates every required variable at boot and exits on a missing one** rather than
failing later at an unrelated call site (`03_TRD.md` §10).

### `apps/web/.env`
| Variable | Required | Notes |
|---|:--:|---|
| `VITE_API_BASE_URL` | ✅ | Currently `http://localhost:8081/api` |
| `VITE_GOOGLE_CLIENT_ID` | | Public Google client id. Must match `GOOGLE_CLIENT_ID` in `apps/api/.env`. Blank ⇒ Google button disabled |

Only `VITE_`-prefixed variables reach the browser. **Never put a secret in `apps/web/.env`** —
everything there is shipped in the bundle and readable by anyone.

---

## 4. Running

```bash
npm run dev
```
Starts both apps. Individually:

```bash
npm run dev --workspace=apps/api
```
```bash
npm run dev --workspace=apps/web
```

**Current ports: web `3001`, api `8081`.** The web port is pinned in `apps/web/vite.config.js`
(`strictPort: true`, so a clash fails loudly instead of drifting to another port); the API port
comes from `PORT` in `apps/api/.env`. Changing either means changing `CLIENT_ORIGIN`, `APP_URL`,
and `VITE_API_BASE_URL` to match.

**Verify the stack end-to-end:**
```bash
curl http://localhost:8081/api/health
```
Expect a database status of `connected` and `"database": "evallo-recruit"`. If it reports
`disconnected`, the API is running but MongoDB is not reachable — check `MONGODB_CLOUD` and that
the host is up. The response also reports `integrations.mail` and `integrations.googleSignIn`, so
it doubles as a configuration check.

Then open **http://localhost:3001** for the marketing landing page (MKT-01).

### Tests

```bash
npm run test --workspace=apps/api
```

The suites talk to the **real** database in `MONGODB_CLOUD`, so `NODE_ENV=test` matters — the
package script sets it. It does two things that are not cosmetic: it forces the console mail
transport (so tests never send real email, and never hang on a pooled SMTP connection) and it
disables the rate limiters.

Run one suite:
```bash
npm run test --workspace=apps/api -- tests/integration/auth.test.js
```

> **Suites must currently be run one file at a time.** They share one remote database and clear
> collections in `beforeEach`, so running two files concurrently makes them clobber each other.
> See `12_KNOWN_ISSUES.md`.

Lint everything from the root:
```bash
npm run lint
```

---

## 5. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_REQUIRE_ESM` / `Cannot use import outside a module` | Node < 18, or a missing `"type": "module"` | Upgrade Node; confirm `"type": "module"` in the package |
| `MongooseServerSelectionError` | MongoDB unreachable or wrong URI | Verify `MONGODB_CLOUD` and that the host accepts TCP on 27017 |
| API exits at boot with "Invalid environment configuration" | A required variable is missing or malformed | Read the listed keys; a **blank** `KEY=` is treated as unset, not as an error |
| Verification email never arrives | `MAIL_PROVIDER=console` | The message and link are printed to the API console — that is the intended dev default. Set `smtp`/`sendgrid` plus `EMAIL_*` to send for real |
| Google button renders disabled | `GOOGLE_CLIENT_ID` unset, or the origin is not authorised in Google Cloud | Check `GET /api/auth/config`. Google returns 403 for origins not on its allowlist, and the button cannot render |
| `Transaction numbers are only allowed on a replica set` | Standalone `mongod` | Restart with `--replSet rs0` and run `rs.initiate()` — see §1 |
| CORS error mentioning credentials | `CLIENT_ORIGIN` wrong, or a wildcard origin | Set the exact origin. Wildcards cannot be combined with `credentials: true` (ADR-005) |
| Logged out on every refresh | Refresh cookie not sent | Check `COOKIE_DOMAIN`, that Axios sets `withCredentials: true`, and that web/api share a registrable domain (`03_TRD.md` §13) |
| Import of `packages/shared` fails | `npm install` run inside a workspace | Delete nested `node_modules`, reinstall from the root |
| `__dirname is not defined` | ESM has no `__dirname` | Use `import.meta.url` (ADR-012) |
| Vite env var is `undefined` | Missing `VITE_` prefix | Rename; restart the dev server — env changes are not hot-reloaded |

---

## 6. Verifying a working setup

- [ ] `npm run dev` starts both apps without errors
- [ ] `http://localhost:3001` renders the marketing landing page
- [ ] `http://localhost:8081/api/health` reports `"database": "evallo-recruit"` and `connected`
- [ ] The browser can reach the API without CORS errors
- [ ] `npm run lint` is clean
- [ ] Sign-up at `/signup` reaches "Check your email", and the API console prints the verification
      link (with `MAIL_PROVIDER=console`)
- [ ] Opening that link lands on Set password → name → first-action router → `/home`
- [ ] Editing a file in `packages/shared` is picked up by both apps
