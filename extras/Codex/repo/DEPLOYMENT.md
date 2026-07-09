# Hosting at htxpunk.com/mvgen — status and runbook

Goal: host this app behind auth at `https://htxpunk.com/mvgen`, using the
existing `.env` API tokens (single-tenant, not per-user), reachable from a
phone. Not linked from the site — access by URL only.

This document is the handoff for finishing that, written because the work
below was done autonomously while unable to execute the final deploy step
(no Docker daemon, no `wrangler`/deploy credentials, no ability to
provision a real server from this sandbox).

## What's built and verified

- **Auth gate** (`backend/main.py`'s `basic_auth_gate`, `frontend/middleware.ts`):
  HTTP Basic Auth on both the API and the UI, active only when
  `AUTH_USERNAME`/`AUTH_PASSWORD` are set. Verified live against real
  running servers: no creds → 401, wrong creds → 401, correct creds → 200,
  and confirmed it's a true no-op when unset (local/Electron use unaffected).
- **Frontend reachability fix**: the frontend used to call an absolute
  `http://localhost:8000`, which only ever worked because the browser
  happened to be on the same machine as the backend. Now calls relative
  paths (`/api/...`, `/storage/...`) that `next.config.js`'s rewrites proxy
  to the backend — this is what makes a phone loading the hosted page
  actually able to reach the backend. Also fixed a FastAPI trailing-slash
  redirect that would have leaked an internal `127.0.0.1:8000` address to
  a real browser. Verified end-to-end against real servers (see git log
  for the exact test sequence).
- **Docker image** (`Dockerfile`, `docker-entrypoint.sh`): single container
  running both the FastAPI backend (:8000) and the Next.js frontend (:3000),
  supervised by a small script that forwards SIGTERM to both and exits
  promptly if either crashes. The dual-process supervision logic was
  tested with a simulation (signal propagation, exit code propagation) — I
  could not build or run the actual image since Docker's daemon isn't
  available in this sandbox (the `docker` CLI is present but has nothing
  to connect to).
- **Video pipeline** (separate from hosting, but relevant — see git log
  "Wire the real Modal video pipeline into the app"): the actual intended
  pipeline (Cloudflare images → Modal image-to-video → stitch → sync →
  Modal lip-sync) is now wired in behind `VIDEO_BACKEND=modal`, replacing
  the Ken Burns fallback. Lip-sync specifically is unverified on real
  hardware — flagged clearly in code comments.

## What's NOT done — and needs a human (or Local Claude) with real access

### 1. R2 storage credentials
`htxpunk-media` R2 bucket already exists on the account. The backend
already fully supports `STORAGE_BACKEND=r2` (`backend/utils/storage.py`) —
it just needs credentials, which I cannot generate via the Cloudflare MCP
connector (R2 API tokens are a separate, dashboard-only credential type
from account-level API access):

1. dash.cloudflare.com → R2 → Manage API Tokens → Create API Token
2. Scope it to the `htxpunk-media` bucket, Object Read & Write
3. Set in the deployment's env:
   ```
   STORAGE_BACKEND=r2
   R2_ACCOUNT_ID=<cloudflare account id>
   R2_ACCESS_KEY_ID=<from the token>
   R2_SECRET_ACCESS_KEY=<from the token>
   R2_BUCKET_NAME=htxpunk-media
   ```
   Without this, `LOCAL_STORAGE_PATH=/data/storage` (the Docker image's
   default) works too, but only if `/data` is a persistent volume —
   otherwise generated images/videos vanish on every container restart.

### 2. Pick where this actually runs
I have read-only access to the real Cloudflare account (confirmed: real
Workers `htxpunk-api`/`htxpunk-upload` exist, real R2 bucket exists) but no
tool to actually deploy a new Worker, Container, or provision a VPS. Two
real options, in order of how much I could pre-verify:

**Option A — Cloudflare Containers** (same account, same domain, no new
hosting account needed). Requires the `wrangler` CLI authenticated against
this account, run by whoever has that access:
```bash
wrangler login
wrangler deploy   # needs a wrangler.toml — not written yet, see below
```
I did not write the `wrangler.toml`/Container binding config because I
could not test it (this session's constraints don't extend to actually
running `wrangler`), and getting the Worker-to-Container routing config
wrong is exactly the kind of thing that fails silently. If this is the
chosen path, the next session should write and — critically — actually
test that config against the real account, not just write it from docs.

**Option B — any VPS/PaaS that runs Docker** (Fly.io, Railway, Render, a
DigitalOcean droplet, or whatever htxpunk.com's own hosting already is).
More proven path since it's just "run the Dockerfile somewhere," no new
Cloudflare product to learn. Needs:
```bash
docker build -t htxpunk-mvgen .
docker run -d -p 3000:3000 -p 8000:8000 \
  -v mvgen_data:/data \
  --env-file .env.hosted \
  htxpunk-mvgen
```
then a reverse proxy (could be Cloudflare itself, via a Worker or just a
DNS + Cloudflare Tunnel) routing `htxpunk.com/mvgen/*` to that container's
port 3000 (frontend) and `htxpunk.com/mvgen/api/*` + `/mvgen/storage/*` to
port 8000 — **or**, simpler: route everything under `/mvgen` to port 3000
only, and let the frontend's own rewrites (already proxying `/api/*` and
`/storage/*` internally) handle reaching the backend. That second approach
is probably right for this setup — it means the reverse proxy only needs
one rule, not three.

**Path prefix note**: neither the frontend nor backend currently know
about a `/mvgen` prefix — they assume they're mounted at the root of
whatever domain serves them. If the reverse proxy strips `/mvgen` before
forwarding (most reverse proxies can do this), no code changes are needed.
If it can't strip the prefix, Next.js's `basePath: '/mvgen'` config
option would need to be added, which likely also touches asset paths —
untested, flagging so it doesn't surprise whoever sets up the proxy.

### 3. Env vars for the hosted deployment
Same `.env` keys as the desktop app (`GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_API_TOKEN`, `IMAGE_BACKEND=cloudflare`) plus:
```
AUTH_USERNAME=<pick one>
AUTH_PASSWORD=<pick one>
CORS_EXTRA_ORIGINS=https://htxpunk.com
VIDEO_BACKEND=modal          # if using the real pipeline, not Ken Burns
MODAL_TOKEN_ID=...
MODAL_TOKEN_SECRET=...
STORAGE_BACKEND=r2           # see section 1
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=htxpunk-media
```
If using `VIDEO_BACKEND=modal`, the Modal app also needs to be deployed
once (not just `modal run`, which is ephemeral):
```bash
pip install modal && modal setup
modal deploy backend/services/modal_video_worker.py
```

## Suggested next session's order of operations

1. Generate R2 credentials (5 min, dashboard only).
2. Decide Option A vs B above — B is lower-risk given nothing about it is
   unproven; A is more "native" to the existing Cloudflare setup but needs
   real `wrangler` testing that hasn't happened yet.
3. Build the image, run it, confirm `/health` and the auth gate work from
   an actual external device (not just localhost) before wiring up the
   real domain/path.
4. Wire up the reverse proxy / DNS for `/mvgen`.
5. Only then flip on `VIDEO_BACKEND=modal` and test one real project
   end-to-end — that pipeline has its own unresolved risk (Layer 3
   lip-sync) independent of hosting.
