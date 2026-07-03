# 🎬 HTXpunk Productions — Music Video Generator

An AI-powered pipeline that turns song uploads into complete animated music videos with human approval gates for treatment, manifest, and storyboard stages.

Built by **HTXpunk Productions** · Runs locally · Upgrade path via `.env` settings.

---

## The Pipeline

```
Song Upload
↓
① Audio Analysis      — faster-whisper transcript + word timestamps + Groq mood/structure analysis
↓
② Visual Treatment    — Groq generates the creative direction
↓ [Human Approval]
③ Element Extraction  — visual registry (characters, locations, props, states)
↓
④ Image Generation    — Cloudflare / Gemini 2.5 Flash Image / placeholder backend
↓
⑤ Storyboard Build    — Pillow compositing + panel ordering
↓ [Human Approval]
⑥ Manifest Generation — production-guide/shot-manifest driven frame generation
↓ [Human Approval]
⑦ Video Assembly      — FFmpeg timed render (default), optional Remotion/Modal backends
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js + Tailwind | Dashboard + approval UI |
| Backend | FastAPI + Chimera Tower orchestrator | In-process pipeline orchestration (no Celery/Redis) |
| Database | SQLite + SQLAlchemy | Project and asset state |
| Storage | Local filesystem | Audio, images, and video output |
| Transcription | faster-whisper | Local CPU transcription |
| LLM | Groq (Llama 3.3) | Analysis, treatment, extraction |
| Image Generation | Cloudflare Workers AI / Gemini / placeholder | Render backgrounds and elements |
| Background Removal | rembg + onnxruntime | Element cutouts |
| Video Assembly | FFmpeg (default) | Timed video render with audio sync |

---

## Quick Start

**👉 See [SETUP.md](SETUP.md) for the complete setup flow.**

```bash
# 1) Configure environment
cp .env.example .env

# 2) Add required key
# GROQ_API_KEY=...

# 3) Choose image backend in .env:
# IMAGE_BACKEND=cloudflare  -> set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (default in .env.example)
# IMAGE_BACKEND=gemini      -> set GEMINI_API_KEY
# IMAGE_BACKEND=placeholder -> offline development mode

# 4) Start backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 5) Start frontend
cd ../frontend && npm install
npm run dev
```

- Frontend: http://localhost:3000  
- Backend health: http://localhost:8000/health

**More docs:** [SETUP.md](SETUP.md) · [CLAUDE.md](CLAUDE.md) · [DESKTOP_APP.md](DESKTOP_APP.md)

---

## License

Proprietary — © HTXpunk Productions. All rights reserved.
