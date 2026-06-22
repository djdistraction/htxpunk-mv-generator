# 🎬 HTXpunk Productions — Music Video Generator

An AI-powered pipeline that turns a song upload into a full-length animated music video — complete with ken burns motion, lyric overlays, crossfades, and particle effects — with visual continuity maintained throughout.

Built by **HTXpunk Productions** · Runs **100% free locally** · Upgrade path to GPU/cloud via env vars only.

---

## The Pipeline

```
Song Upload
↓
① Audio Analysis    — Whisper (local, free) → transcript + word timestamps
                      Groq / Llama 3.3 70B  → mood, structure, narrative arc
↓
② Visual Treatment  — Groq generates a full creative direction proposal
↓ [Human Approval]
③ Element Extraction — AI creates the registry: characters, locations, props, states
↓
④ Background Gen    — FLUX.1-schnell (HuggingFace free tier) → 1920×1080 backgrounds
↓
⑤ Element Gen       — FLUX.1-schnell → elements on transparent bg (rembg removes bg)
↓
⑥ Storyboard Build  — Pillow composites elements onto backgrounds; panels reviewed
↓ [Human Review]
⑦ Remotion Assembly — React/Remotion renders the full video in one pass:
                       • Ken Burns motion (zoom-in/out, pan-left/right)
                       • Crossfades between panels
                       • Whisper-synced lyric overlays
                       • Energy-level-driven particle effects
                       • Audio track sync
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15 + Tailwind | Dashboard + approval UI |
| Backend | FastAPI + Celery | Pipeline orchestration |
| Queue | Celery memory:// broker | Async jobs — no Redis needed |
| Database | SQLite + SQLAlchemy | Project state — no DB server needed |
| Storage | Local filesystem | Audio, images, video — no cloud needed |
| Transcription | OpenAI Whisper (local) | Free, runs on CPU, ~140MB model |
| LLM | Groq free tier (Llama 3.3 70B) | Analysis, treatment, extraction |
| Image Gen | HuggingFace FLUX.1-schnell | Free tier, 2s delay between calls |
| Background Removal | rembg + onnxruntime | Free, runs locally |
| Video Composition | Remotion (React) | Free, renders via Node.js |

**Cost per video: $0.00** (free tiers only)

---

## Upgrade Path

Everything upgrades via `.env` only — zero code changes:

| Now (free) | Later (upgrade) |
|---|---|
| Groq / Llama 3.3 | Ollama (local GPU) or GPT-4o |
| HuggingFace FLUX.1-schnell | Local FLUX (GPU) or Replicate |
| Local storage | Cloudflare R2 |
| SQLite | Supabase / PostgreSQL |
| Remotion | Wan2.1 local GPU (`VIDEO_BACKEND=wan2`) |

---

## Quick Start

### 1. Get free API keys
- **Groq**: https://console.groq.com → free, no credit card
- **HuggingFace**: https://huggingface.co → Settings → Access Tokens

### 2. Configure
```bash
cp .env.example .env
# Add GROQ_API_KEY and HF_TOKEN
```

### 3. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# In a second terminal (Windows needs --pool=solo):
celery -A workers.pipeline_worker worker --pool=solo --loglevel=info
```

### 4. Remotion (video composer)
```bash
cd remotion-composer
npm install
# Optional: preview in browser
npx remotion studio
```

### 5. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

---

## Continuity Bible

Every project generates a `BIBLE.md` tracking all named elements, approved appearances, asset paths, storyboard order, and color palette — ensuring visual consistency across sessions.

See [`bible_template/BIBLE.md`](bible_template/BIBLE.md) for the full structure.

---

## License

Proprietary — © HTXpunk Productions. All rights reserved.
