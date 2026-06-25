# HTXpunk Productions — Music Video Generator

## Overview
This is a full-stack AI music video generator that transforms song uploads into complete animated music videos with:
- Automatic transcription & mood analysis
- AI-generated visual treatments (Groq/Llama 3.3)
- Background & character element generation (HuggingFace FLUX)
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
  - `image_generator.py` — HuggingFace FLUX background/element gen
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
| Image Gen | HuggingFace FLUX.1-schnell free API | 2s rate limit |
| Background Removal | rembg + onnxruntime | Local, no API needed |
| Video Composition | Remotion (React) | Node.js based video rendering |
| Video Assembly | FFmpeg | Ken Burns motion, audio sync |
| Task Queue | In-memory orchestrator (no Celery/Redis) | Runs in main uvicorn process |

---

## Setup

### 1. Get Free API Keys
- **Groq**: https://console.groq.com (no credit card)
- **HuggingFace**: https://huggingface.co → Settings → Access Tokens → New token (read)

### 2. Create `.env` from template
```bash
cp .env.example .env
# Edit .env and add GROQ_API_KEY and HF_TOKEN
```

### 3. Backend
```bash
cd backend
pip install -r requirements.txt
# Terminal 1: API server
uvicorn main:app --reload --port 8000

# Terminal 2: (optional diagnostics)
python -c "from config import settings; settings.validate_settings()"
```

### 4. Frontend
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
- `GROQ_API_KEY` — from https://console.groq.com
- `HF_TOKEN` — from https://huggingface.co

**Optional:**
- `WHISPER_MODEL` — tiny | base (default) | small | medium
- `VIDEO_BACKEND` — ffmpeg (default) | runway (experimental)
- `DATABASE_URL` — sqlite+aiosqlite:/// (default) or postgresql+asyncpg://
- `STORAGE_BACKEND` — local (default) | r2

### Upgrade Paths (all via `.env` only, no code changes):

| Now (Free) | Later (GPU/Cloud) |
|---|---|
| Groq / Llama 3.3 | Ollama (local GPU) or OpenAI GPT-4o |
| HuggingFace FLUX | Local FLUX (GPU) or Replicate |
| Local storage | Cloudflare R2 |
| SQLite | Supabase / PostgreSQL |
| Remotion | Local GPU render or commercial |

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
  - `api.projects.{list, get, uploadAudio}`
  - `api.pipeline.{approveTreatment, reviseTreatment, approveStoryboard, regenerateImage}`
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
- style_prompt, characters (JSON), color_palette (JSON)

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
**Error:** `ValueError: HF_TOKEN not set` or `401 Unauthorized`
- **Fix:** Ensure `HF_TOKEN` in `.env` matches your HuggingFace read token
- Token must have "Read access to contents of all public gated repos and private repos you can access"

**Error:** `NameResolutionError` / `getaddrinfo failed` for `api-inference.huggingface.co`
- **Cause:** HuggingFace retired the old serverless endpoint. That hostname no
  longer resolves anywhere — it is not a local network problem.
- **Fix:** Upgrade the client so it uses the new Inference Providers router:
  `pip install -U huggingface_hub` (needs >=0.28), then restart the backend.
  Routing is controlled by `HF_PROVIDER` in `.env` (default `auto`).
- **Note:** Inference Providers usage is billed against your HF account; free
  accounts get a small monthly credit. Pin a provider via `HF_PROVIDER`
  (e.g. `fal-ai`, `replicate`, `nebius`) if `auto` can't serve the model.

### Video assembly hangs
**Error:** Progress stuck at "Assembling…" for >30 min
- **Likely:** FFmpeg or audio sync issue. Check orchestrator logs.
- **Fix:** Manually reset: `UPDATE projects SET stage='storyboard_approved' WHERE id='...'`

### Storyboard images not showing
**Issue:** Elements appear as gray boxes
- **Likely:** Background removal (rembg) timed out or failed
- **Fix:** Regenerate image from Elements page, check error logs

---

## Performance Tuning

### Audio Analysis
- Whisper model size: `tiny` (fastest) → `medium` (most accurate, ~60s on CPU)
- Default is `base` (15-25s on CPU, good accuracy)

### Image Generation
- HuggingFace free API has 2s rate limit between calls
- Total time: ~5-10 min for 4 backgrounds + 8-12 character states
- GPU upgrade would reduce to <1 min

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
- [ ] `.env` has `GROQ_API_KEY` and `HF_TOKEN`
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
