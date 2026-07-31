# 08 — Setup Guide

> **Status:** the repository is not yet scaffolded. Prerequisites and the intended workflow are
> below; exact commands are confirmed and corrected the moment M0 lands. **Anything unverified
> is marked as such** — this guide is worthless if it contains commands nobody has run.

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

### MongoDB — run a single-node replica set, not standalone

**This matters.** `05_DATABASE_SCHEMA.md` §11 lists four operations that require multi-document
transactions — interest submission, refresh-token rotation, ownership transfer, and company
publish. A standalone `mongod` silently does not support transactions, so those paths would
behave differently in development than in production. Use a replica set locally even for a
single node.

Docker:
```bash
docker run -d --name evallo-mongo -p 27017:27017 mongo:7 --replSet rs0
```
Then initiate the set once:
```bash
docker exec -it evallo-mongo mongosh --eval "rs.initiate()"
```

MongoDB Atlas is a replica set by default, so no extra step is needed there.

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
| `NODE_ENV` | ✅ | `development` / `production` |
| `PORT` | ✅ | Default `5000` |
| `MONGODB_URI` | ✅ | e.g. `mongodb://localhost:27017/evallo_recruit?replicaSet=rs0` |
| `JWT_ACCESS_SECRET` | ✅ | Long random string. **Distinct from the refresh secret** |
| `JWT_REFRESH_SECRET` | ✅ | Long random string |
| `ACCESS_TOKEN_TTL` | | Default `15m` (ADR-005) |
| `REFRESH_TOKEN_TTL` | | Default `30d` |
| `CLIENT_ORIGIN` | ✅ | Exact origin for CORS. Wildcards are incompatible with `credentials: true` |
| `COOKIE_DOMAIN` | ✅ | Refresh-cookie domain (`03_TRD.md` §13) |
| `MAIL_*` | ✅ (M1) | Provider undecided — `03_TRD.md` Q3 |
| `STORAGE_*` | ✅ (M3) | Provider undecided — Q2 |
| `GOOGLE_CLIENT_ID` / `SECRET` | | SSO, M1+ |
| `MICROSOFT_CLIENT_ID` / `SECRET` | | SSO, M1+ |

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The API **validates every required variable at boot and exits on a missing one** rather than
failing later at an unrelated call site (`03_TRD.md` §10).

### `apps/web/.env`
| Variable | Required | Notes |
|---|:--:|---|
| `VITE_API_BASE_URL` | ✅ | e.g. `http://localhost:5000/api` |

Only `VITE_`-prefixed variables reach the browser. **Never put a secret in `apps/web/.env`** —
everything there is shipped in the bundle and readable by anyone.

---

## 4. Running

*Commands below are the intended scripts; confirm against the root `package.json` once M0 lands.*

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

Default ports: web `5173` (Vite), api `5000`.

**Verify the stack end-to-end** — this is M0's definition of done:
```bash
curl http://localhost:5000/api/health
```
Expect a database status of `connected`. If it reports `disconnected`, the API is running but
MongoDB is not reachable — check `MONGODB_URI` and that the container is up.

---

## 5. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_REQUIRE_ESM` / `Cannot use import outside a module` | Node < 18, or a missing `"type": "module"` | Upgrade Node; confirm `"type": "module"` in the package |
| `MongooseServerSelectionError` | MongoDB not running or wrong URI | Start the container; verify `MONGODB_URI` |
| `Transaction numbers are only allowed on a replica set` | Standalone `mongod` | Restart with `--replSet rs0` and run `rs.initiate()` — see §1 |
| CORS error mentioning credentials | `CLIENT_ORIGIN` wrong, or a wildcard origin | Set the exact origin. Wildcards cannot be combined with `credentials: true` (ADR-005) |
| Logged out on every refresh | Refresh cookie not sent | Check `COOKIE_DOMAIN`, that Axios sets `withCredentials: true`, and that web/api share a registrable domain (`03_TRD.md` §13) |
| Import of `packages/shared` fails | `npm install` run inside a workspace | Delete nested `node_modules`, reinstall from the root |
| `__dirname is not defined` | ESM has no `__dirname` | Use `import.meta.url` (ADR-012) |
| Vite env var is `undefined` | Missing `VITE_` prefix | Rename; restart the dev server — env changes are not hot-reloaded |

---

## 6. Verifying a working setup

- [ ] `npm run dev` starts both apps without errors
- [ ] `http://localhost:5173` renders the app shell
- [ ] `http://localhost:5000/api/health` reports the database as connected
- [ ] The browser can reach the API without CORS errors
- [ ] Editing a file in `packages/shared` is picked up by both apps
