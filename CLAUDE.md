# HTXpunk Productions — Music Video Generator

## Overview
This is a full-stack AI music video generator that transforms song uploads into complete animated music videos with:
- Automatic transcription & mood analysis
- AI-generated visual treatments (Groq/Llama 3.3)
- Background & character element generation (Cloudflare Workers AI — FLUX.1-schnell)
- Storyboard composition & video assembly (FFmpeg with Ken Burns)
- Human approval gates at treatment & storyboard stages

**Cost per video: $0.00** (all free tiers)

---

## Architecture

### Frontend (Next.js 15 + Tailwind)
- `/frontend/` — Next.js app with TypeScript
- Key routes:
  - `/` — Project list
  - `/projects/new` — Upload & create new project
  - `/projects/[id]` — Project dashboard with progress tracker
  - `/projects/[id]/treatment` — AI treatment review & approval
  - `/projects/[id]/elements` — Generated assets browser
  - `/projects/[id]/storyboard` — Panel review & reordering
  - `/projects/[id]/production` — Video assembly & playback

### Backend (FastAPI + Python)
- `/backend/main.py` — FastAPI app with lifespan management
- **Orchestrator** (`orchestrator.py`) — Chimera Tower system
  - Replaces Celery; runs as background thread in uvicorn
  - Polls projects table every 3s, dispatches workers for each stage
  - Prevents double-dispatch with in-flight tracking
  - Respects human approval gates (awaiting_*_approval stages)
- **Workers** (`workers/pipeline_worker.py`) — Stage executors
  - Each stage runs as a thread in the executor pool
  - Sets intermediate stages (e.g., "analyzing", "generating_images")
  - Never chains to next stage; orchestrator does that
- **Database** (`database.py`) — SQLite async via SQLAlchemy
  - Tables: `projects`, `assets`, `tasks`, `series`
  - Sync helpers for workers (sync context)
- **Services** (`services/`) — Task-specific libraries
  - `audio_analyzer.py` — Whisper transcription + Groq analysis
  - `treatment_generator.py` — Groq visual treatment from analysis
  - `element_extractor.py` — Groq visual registry
  - `image_generator.py` — dispatches to the configured image backend (cloudflare | gemini | placeholder)
  - `cloudflare_image_generator.py` — Cloudflare Workers AI (FLUX.1-schnell) client (free tier, the default backend)
  - `gemini_image_generator.py` — Gemini 2.5 Flash Image client (kept as an alternate backend; requires a billing-enabled Google Cloud project — not actually free)
  - `storyboard_builder.py` — Scene planning
  - `compositor.py` — Pillow compositing panels
  - `video_assembler.py` — FFmpeg video & audio sync

---

## Technology Stack

| Component | Tech | Notes |
|-----------|------|-------|
| Frontend | Next.js 15, React 18, TypeScript, Tailwind | Deployed on localhost:3000 |
| Backend API | FastAPI, Uvicorn, Python 3.11+ | Deployed on localhost:8000 |
| Database | SQLite + SQLAlchemy (async) | No server needed |
| LLM | Groq (Llama 3.3 70B) free tier | OpenAI-compatible API |
| Audio | Faster-Whisper (CPU int8 quantized) | ~140MB model |
| Image Gen | Cloudflare Workers AI (FLUX.1-schnell) | Free daily allowance, no credit card |
| Background Removal | rembg + onnxruntime | Local, no API needed |
| Video Assembly | FFmpeg (default) | Ken Burns motion, audio sync, per-shot timing |
| Video Assembly (opt-in) | Remotion (React) | Node-based; set VIDEO_BACKEND=remotion |
| Task Queue | In-memory orchestrator (no Celery/Redis) | Runs in main uvicorn process |

---

## Setup

### Desktop App (Recommended)
```bash
cd electron-app
npm install
npm run start
```
This launches the **setup wizard** on first run:
1. Enter Groq API key (required, 30 seconds to get from console.groq.com)
2. Enter Cloudflare Account ID + API Token (required, from dash.cloudflare.com — powers image generation via Workers AI)
   - Both validated with real API calls before accepting
   - Visual feedback: ✓ (valid) or ✗ (invalid)
3. Choose storage folder
4. On first run only, Python dependencies install automatically (a splash screen shows progress); backend + bundled frontend then start automatically
5. App opens showing the frontend UI (served on 127.0.0.1:3000 internally; the backend on :8000 serves only the API and generated media)

**Updating API keys later:**
- Click ⚙️ Settings in the app (or /settings in web)
- Add/update keys with live validation
- Restart the app to apply changes

### Building the Installer

The packaged app bundles both the Python backend and a self-contained Next.js
frontend server, so an installed user needs Python 3.11+ on their machine but
**not** Node.js/npm — Electron's own bundled Node runs the frontend.

```bash
cd electron-app
npm run dist:win   # or dist:mac / dist:linux
```

This automatically runs `predist:*` first, which builds the frontend
(`scripts/build-frontend.js`): `npm install` + `npm run build` in `frontend/`
(producing `.next/standalone/server.js` via `output: "standalone"` in
`next.config.js`), then copies `.next/static` and `public/` into the
standalone folder since Next intentionally omits them from that output.
electron-builder's `extraResources` config then copies the backend source
(`../backend`, minus `storage/`, `__pycache__/`, and `.db` files) and the
frontend's standalone build (`../frontend/.next/standalone`) into the
packaged app's `resources/backend` and `resources/frontend`.

At runtime (`main.js`), `getBackendPath()`/`getFrontendServerPath()` resolve
to those bundled locations when `app.isPackaged` (vs. the repo checkout in
dev). On first launch, `ensureBackendDependencies()` runs
`pip install --user -r requirements.txt` once (hashed against
requirements.txt, skipped on later launches unless it changes) before
spawning uvicorn — this is why a one-click install can take a few minutes
the first time. A splash screen (`splash.html`) shows progress throughout
this sequence so it doesn't look like the app hung.

The frontend is served on `127.0.0.1:3000` and the backend on `:8000`
(matching the backend's hardcoded CORS `allow_origins`); the main window
loads the frontend, not the backend, since the backend only serves `/health`
and `/storage`.

### Manual Setup (Web/CLI mode)

**1. Get Free API Keys** (both required)
- **Groq** (text/audio analysis): https://console.groq.com (no credit card, takes 30s)
- **Cloudflare** (image generation): https://dash.cloudflare.com (Account ID from the Workers & Pages sidebar; API Token from My Profile → API Tokens, with Account · Workers AI · Edit permission — free daily allowance, no credit card)

**2. Create `.env`**
```bash
cp .env.example .env
# Edit .env:
GROQ_API_KEY=gsk_...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
IMAGE_BACKEND=cloudflare  # Production mode (default). Use "placeholder" for dev-only offline mode.
```

**3. Backend**

System dependency: **espeak-ng** (or classic espeak) must be on PATH — it
drives lyric forced alignment (`aeneas`, used when a user supplies exact
lyrics instead of relying on Whisper transcription). Install it the same
way you'd install `ffmpeg`:
- macOS: `brew install espeak-ng`
- Debian/Ubuntu: `sudo apt-get install espeak-ng`
- Windows: install via the [espeak-ng releases page](https://github.com/espeak-ng/espeak-ng/releases) and ensure it's on PATH

```bash
cd backend
pip install -r requirements.txt
python scripts/prepare_aeneas_install.py
AENEAS_WITH_CEW=False AENEAS_WITH_CDTW=False AENEAS_WITH_CMFCC=False pip install --no-build-isolation -r requirements-aeneas.txt
uvicorn main:app --reload --port 8000
```
aeneas installs as a separate second step — see the comment at the top of
`requirements-aeneas.txt` for why (short version: its setup.py needs numpy,
just installed above, to be importable, which pip's isolated build
environment hides unless `--no-build-isolation` is passed, and also needs
`numpy.distutils`, which NumPy removed entirely on Python >= 3.12 —
`scripts/prepare_aeneas_install.py` shims that back in, a no-op on Python
< 3.12). The three `AENEAS_WITH_*` env vars are only needed for that one
step — they skip all of aeneas's optional C extensions, so installing it
never needs a C/C++ compiler (no Visual C++ Build Tools on Windows, no
Xcode Command Line Tools on Mac). Nothing here needs to be set when
running the server.

**4. Frontend**
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:3000
```

**Optional: Remotion composer** (for video preview/development)
```bash
cd remotion-composer
npm install
npx remotion studio
# Opens http://localhost:3030
```

---

## First-Run Onboarding

When the Electron app starts for the first time, it shows a **3-step setup wizard**:

### Step 1: API Keys Configuration
- **Groq API Key** (required): Takes 30 seconds to get from console.groq.com
  - Validator checks the key with a real API call
  - Gives instant visual feedback: ✓ (green) or ✗ (red)
- **Cloudflare Account ID + API Token** (required): from dash.cloudflare.com
  - Validator checks the credentials with a real API call
  - Free daily image generation allowance, no credit card needed
  - Gives instant visual feedback: ✓ (green) or ✗ (red)

### Step 2: Storage Configuration
- Choose where to store generated images and videos (recommended: 50GB+ free space)
- Set backend port (default 8000, usually fine)

### Step 3: Confirmation
- Review settings and click Finish
- A splash screen shows progress while Python dependencies install (first run only), then the backend and bundled frontend start automatically

### Settings After Install

Users can update/add API keys later without reinstalling:

1. Open the app → click ⚙️ Settings (or navigate to `/settings`)
2. Paste new API keys
3. Click Validate to check they work
4. Click Save Settings
5. Restart the app for changes to take effect

### Configuration Storage

The Electron app stores configuration in **`~/.htxpunk-mv-generator/`**:
- `config.json` — user settings (API keys, port, storage path)
- `.env` — generated from config, auto-injected into backend
- Logs, database, and generated videos stored in the user's chosen storage folder

---

## Development Workflow

### Adding a New Pipeline Stage

1. **Define in `orchestrator.py`:**
   - Add to `STAGE_WORKERS` dict mapping stage → worker function name
   - Add to `TRANSITIONAL_RESET` if the stage has intermediate steps

2. **Implement worker in `workers/pipeline_worker.py`:**
   ```python
   def run_my_stage(project_id: str):
       _set_stage(project_id, "my_stage_running")
       project = _get_project(project_id)
       # ... do work ...
       db_update_project(project_id, stage="next_stage")
   ```

3. **Frontend tracking** in `ProjectDetail.tsx`:
   - Add stage to `STAGE_LABELS` dict
   - Add to `STAGE_ORDER` array if visible in progress
   - Add stage transition logic if needed

### Fixing a Stuck Project

Projects can get stuck in transitional stages if the server crashes mid-flight. The orchestrator auto-resets these on startup (`_reset_stuck_projects`). To manually reset:

```bash
cd backend
sqlite3 htxpunk.db
UPDATE projects SET stage='analyzed' WHERE id='PROJECT_UUID_HERE';
.exit
# Orchestrator will re-pick it up
```

### Testing a Service

Each service can be tested independently:
```bash
cd backend
python -c "
from services.audio_analyzer import transcribe_audio
result = transcribe_audio('path/to/audio.mp3')
print(result)
"
```

---

## Configuration

### Environment Variables

**Required:**
- `GROQ_API_KEY` — from https://console.groq.com (takes 30 seconds, no credit card)
- `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` — from https://dash.cloudflare.com (free daily image generation allowance, no credit card)

**Optional (development only):**
- `IMAGE_BACKEND` — "cloudflare" (production, default) | "gemini" (requires a billing-enabled Google Cloud project) | "placeholder" (dev-only offline, no API)

**Other Optional:**
- `WHISPER_MODEL` — tiny | base (default) | small | medium
- `VIDEO_BACKEND` — ffmpeg (default) | runway (experimental)
- `DATABASE_URL` — sqlite+aiosqlite:/// (default) or postgresql+asyncpg://
- `STORAGE_BACKEND` — local (default) | r2

### Upgrade Paths (all via `.env` only, no code changes):

| Now (Free) | Later (Faster/Better) |
|---|---|
| Groq / Llama 3.3 | Ollama (local GPU) or OpenAI GPT-4o |
| Cloudflare Workers AI (FLUX.1-schnell, free) | OpenAI DALL-E 3, Replicate, local FLUX (GPU) |
| Offline placeholder frames | Real images from Cloudflare, Gemini, or other providers |
| Local storage | Cloudflare R2, S3 |
| SQLite | Supabase / PostgreSQL |
| FFmpeg Ken Burns | Wan2.1 or Remotion (GPU render, faster) |

---

## Frontend Architecture

### Component Hierarchy
```
layout.tsx (metadata, Tailwind setup)
├── page.tsx (project list, auto-refresh)
├── projects/new/page.tsx (upload form)
└── projects/[id]/
    ├── page.tsx (route wrapper)
    ├── ProjectDetail.tsx (dashboard, progress tracker)
    ├── treatment/
    │   ├── page.tsx (route wrapper)
    │   └── TreatmentDetail.tsx (review & approve treatment)
    ├── manifest/
    │   ├── page.tsx (route wrapper)
    │   └── ManifestDetail.tsx (shot manifest table, approval/rejection)
    ├── elements/
    │   ├── page.tsx (route wrapper)
    │   └── ElementsList.tsx (asset gallery with regenerate)
    ├── storyboard/
    │   ├── page.tsx (route wrapper)
    │   └── StoryboardView.tsx (panel review, reordering, approve)
    └── production/
        ├── page.tsx (route wrapper)
        └── ProductionView.tsx (video assembly progress & playback)
```

### API Client (`lib/api.ts`)
- Axios-based with 2-minute timeout for uploads
- Auto-logs network errors with backend URL hint
- Methods grouped by resource:
  - `api.projects.{list, get, uploadAudio, addReferences}`
  - `api.pipeline.{approveTreatment, reviseTreatment, getShotManifests, approveManifests, reviseManifests, importProductionGuide, approveStoryboard, regenerateImage}`
  - `api.assets.list`
  - `api.series.{list, get, create}`

### State Management
- React hooks (`useState`, `useEffect`)
- React Query not yet integrated (consider for refactor)
- Auto-refresh intervals vary by stage (5s while in progress, 30s when complete)

---

## Backend Architecture

### Database Schema

**projects**
- id (UUID)
- title, artist, series_id (optional)
- stage (pipeline stage enum)
- audio_url, video_url
- analysis, treatment, elements (JSON)
- panel_order (JSON list of asset IDs, set by user during storyboard review)
- revision_notes (feedback from user)
- error_message (if stage='error')
- created_at, updated_at

**assets**
- id (UUID)
- project_id (FK)
- asset_type (background | element | storyboard_panel | clip | final_video)
- label, url, prompt
- metadata (JSON, flattened into asset dict)

**tasks** (audit log)
- id, project_id, task_type, status (running | completed | failed), error, timestamps

**series** (for recurring characters/style)
- id, name, artist
- style_prompt, characters (JSON), color_palette (JSON), continuity_bible (JSON)

**shot_manifests** (production guide structure)
- id (UUID)
- project_id (FK)
- shot_number, start_time, end_time, audio_cue
- location, characters (JSON), camera, action, mood
- continuity_rules (JSON), negative_constraints (JSON)
- status (draft | reviewing | approved | locked | rejected)
- locked_prompts (JSON, frozen after approval), asset_refs (JSON)

---

## Shot Manifest System

The shot manifest layer provides production-grade structure for video generation:

### Using Production Guides

Import a production guide Excel file (e.g., shot sheet with timecodes, characters, continuity rules):

```bash
# From the frontend: upload file via UI
POST /api/pipeline/{project_id}/import-production-guide

# The API parses the file and creates shot manifests
# Project transitions to awaiting_manifest_approval for human review
```

### Seeding the WOW OH! Demo

The canonical demo ships embedded — **no external file needed**:

```bash
cd backend
python seed_wow_oh.py
# Optional: import from an Excel shot sheet instead
python seed_wow_oh.py /path/to/WOW_OH_Production_Shot_Sheet.xlsx
```

This creates:
- A "WOW OH!" series with locked characters + continuity bible (`services/wow_oh_data.py`)
- A demo project with 30 shot manifests parked at `awaiting_manifest_approval`

Approve the plan in the UI (or via the API) and the pipeline renders a full
video. With no `HF_TOKEN`, frames render as offline placeholders
(`IMAGE_BACKEND=placeholder`) so you get a complete preview video at $0.

### Manifest-driven generation

Once manifests are approved (`manifest_approved` stage), `run_manifest_generation`
turns **each shot into a full-frame image**: it builds the prompt from the shot
(characters + action + location + camera + mood) plus the series continuity
bible (palette, motion style), and a negative prompt from the shot's
`negative_constraints` + the bible's `banned_mistakes`. Each frame becomes a
storyboard panel carrying its shot duration, then the project pauses at
`awaiting_storyboard_approval`. Approving assembles the video (ffmpeg) using the
per-shot timecodes. See `services/shot_prompt.py`.

### Workflow

1. **Import / seed**: production guide (Excel) or embedded data → shot manifests (draft)
2. **Review**: human reviews shot manifests for accuracy and continuity
3. **Approve**: locks the plan → `manifest_approved` → per-shot frame generation
4. **Reject**: request changes → regenerates treatment with feedback
5. **Generate**: locked manifests drive image generation with frozen prompts + constraints
6. **Render**: approve storyboard → ffmpeg assembles the timed Ken Burns video

---

## Common Issues & Fixes

### Backend won't start
**Error:** `ModuleNotFoundError: No module named 'groq'`
- **Fix:** `pip install -r requirements.txt` in `/backend`

**Error:** `FileNotFoundError: ./htxpunk.db`
- **Normal** — DB is created on first startup. Check logs: `[Orchestrator] Chimera Tower online`

**Error:** `GROQ_API_KEY not set`
- **Fix:** Ensure `.env` is in project root with valid `GROQ_API_KEY=gsk_...`

### Frontend can't reach backend
**Error:** `Network error: [...] Failed to fetch from http://localhost:8000`
- **Fix:** Ensure backend is running on `:8000` with `uvicorn main:app --port 8000`
- Check CORS: frontend on `:3000` should be allowed by backend (it is by default)

### Image generation fails
**Error:** `RuntimeError: Missing required API keys` or backend won't start
- **Fix:** Ensure both are set in `.env`:
  - `GROQ_API_KEY=gsk_...` from https://console.groq.com
  - `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` from https://dash.cloudflare.com
- **Dev mode only:** Set `IMAGE_BACKEND=placeholder` to run offline (no API keys needed, images are non-functional placeholders)

**Error:** `401 Unauthorized` / `403 Forbidden` from Cloudflare
- **Fix:** Check that `CLOUDFLARE_ACCOUNT_ID` is correct and the API token has **Account · Workers AI · Edit** permission
- Verify the token hasn't been revoked or expired
- Update via Settings (/settings) in the app

**Error:** Rate limited (daily Workers AI allowance exceeded)
- **Immediate:** Generation fails with clear error (system does not degrade gracefully)
- **Fix:** Wait until the daily allowance resets, or upgrade to a paid Workers AI plan

### Video assembly hangs
**Error:** Progress stuck at "Assembling…" for >30 min
- **Likely:** FFmpeg or audio sync issue. Check orchestrator logs.
- **Fix:** Manually reset: `UPDATE projects SET stage='storyboard_approved' WHERE id='...'`

### Storyboard images not showing
**Issue:** Elements appear as gray boxes
- **Likely:** Background removal (rembg) timed out or failed
- **Fix:** Regenerate image from Elements page, check error logs

### Lyric alignment fails
**Error:** `Lyric alignment requires espeak-ng (or espeak) and/or ffprobe on PATH`
- **Fix:** Install `espeak-ng` (see Manual Setup step 3) and make sure `ffprobe` is on PATH — the bundled `imageio-ffmpeg` binary only ships `ffmpeg`, not `ffprobe`, so a system-wide FFmpeg install is required for this feature specifically.

**Error:** `pip install` fails on `aeneas` with `[ERRO] You must install numpy before installing aeneas` even though numpy is installed
- **Cause:** aeneas's setup.py needs `numpy.distutils`, which NumPy removed entirely on **Python >= 3.12** — no numpy version restores it there, and aeneas's own error message is misleading (it's not actually about numpy being missing).
- **Fix:** run `python scripts/prepare_aeneas_install.py` (from `backend/`) before installing `requirements-aeneas.txt` — see Manual Setup step 3. `run.py` and the packaged Electron app already do this automatically.

**Error:** `pip install` fails on `aeneas` with `AttributeError: install_layout`, `Cannot import 'setuptools.build_meta'`, or `Microsoft Visual C++ 14.0 or greater is required` (building `aeneas.cdtw.cdtw` or similar)
- **Cause:** without `AENEAS_WITH_CDTW`/`AENEAS_WITH_CMFCC` set, aeneas tries to compile its C extensions, which needs a C/C++ compiler most machines don't have — hit for real on a Windows machine without Visual C++ Build Tools installed (GitHub's CI runner ships one preinstalled, which is why this didn't show up in CI).
- **Fix:** Install `requirements.txt` first, then run `python scripts/prepare_aeneas_install.py`, then `AENEAS_WITH_CEW=False AENEAS_WITH_CDTW=False AENEAS_WITH_CMFCC=False pip install --no-build-isolation -r requirements-aeneas.txt` (see Manual Setup step 3) — `run.py` and the packaged Electron app already do all of this automatically, so a compiler is never required. Do **not** set `SETUPTOOLS_USE_DISTUTILS=stdlib` — that was needed on an older setuptools version and now actively breaks the install on Python >= 3.12 (it points at the stdlib `distutils` module, which no longer exists there).

---

## Performance Tuning

### Audio Analysis
- Whisper model size: `tiny` (fastest) → `medium` (most accurate, ~60s on CPU)
- Default is `base` (15-25s on CPU, good accuracy)

### Image Generation
- Cloudflare Workers AI (FLUX.1-schnell): a few seconds per shot, well within the free daily allowance for typical use
- Upgrade to Replicate or local FLUX (GPU) for higher volume: <1 min with GPU

### Video Assembly
- FFmpeg Ken Burns: 15-25 min for typical 4-min song (CPU bound)
- GPU upgrade (Remotion/Wan2.1) would reduce to <2 min

### Database
- SQLite is fine for <500 videos; switch to PostgreSQL for scale
- No indexing needed yet (low data volume)

---

## Troubleshooting Checklist

- [ ] Backend running: `curl http://localhost:8000/health`
- [ ] Frontend running: `http://localhost:3000` loads
- [ ] `.env` has `GROQ_API_KEY` (required)
- [ ] `.env` has `GEMINI_API_KEY` (required)
- [ ] Storage directory created: `ls backend/storage/`
- [ ] Database created: `ls backend/htxpunk.db`
- [ ] Orchestrator started: check backend logs for "Chimera Tower online"
- [ ] No stuck projects: `sqlite3 backend/htxpunk.db "SELECT stage, COUNT(*) FROM projects GROUP BY stage"`

---

## Next Steps / Future Work

- [ ] Add auth/user accounts
- [ ] Integrate with Supabase for multi-user
- [ ] GPU image generation (local FLUX or Replicate)
- [ ] Local GPU video rendering (Wan2.1)
- [ ] Remotion studio integration for real-time preview
- [ ] Series management UI (view/edit recurring characters)
- [ ] Template library for common video styles
- [ ] Batch processing (queue multiple songs)
- [ ] Export options (other resolutions, frame rates)
- [ ] Analytics (timing breakdowns, cost per video)
