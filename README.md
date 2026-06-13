# 🎬 VoodooHut Music Video Generator

An AI-powered pipeline for creating full-length animated music videos —
from song upload to final render — with visual continuity maintained throughout.

Built for [TheVoodooHut.tv](https://thevoodoohut.tv)

---

## The Pipeline

```
Song Upload
    ↓
① Audio Analysis      Whisper (transcript + timestamps) + GPT-4o (meaning + structure)
    ↓
② Visual Treatment    GPT-4o generates a creative direction proposal
    ↓  [Human Approval]
③ Element Extraction  AI creates the registry: characters, locations, props, states
    ↓
④ Background Gen      FLUX.1 generates each location (static bg layer only)
    ↓
⑤ Element Gen         FLUX.1 generates each element on transparent bg, all states
    ↓
⑥ Storyboard Build    Elements composited onto backgrounds; each panel = clip frame
    ↓  [Human Review]
⑦ Clip Generation     RunwayML Gen-4 animates image pairs into 5-second clips
    ↓
⑧ Final Assembly      FFmpeg stitches clips + syncs audio into the finished video
```

---

## Tech Stack

| Layer              | Technology              | Purpose                          |
|--------------------|-------------------------|----------------------------------|
| Frontend           | Next.js 14 + Tailwind   | Dashboard + approval UI          |
| Backend            | FastAPI (Python)        | Pipeline orchestration           |
| Queue              | Celery + Redis          | Async job processing             |
| Database           | Supabase (PostgreSQL)   | Project state + metadata         |
| File Storage       | Cloudflare R2           | Audio, images, video assets      |
| Transcription      | OpenAI Whisper API      | Lyric extraction + timestamps    |
| Song Analysis      | GPT-4o                  | Meaning, mood, narrative arc     |
| Image Generation   | FLUX.1-dev (Replicate)  | Backgrounds + character elements |
| Background Removal | REMBG (open source)     | Element isolation to PNG         |
| Video Generation   | RunwayML Gen-4 API      | 5-second animated clips          |
| Video Assembly     | FFmpeg                  | Final stitch + audio sync        |

### Cost Per Video (3-minute song, ~36 clips)

| Step                        | Approx Cost |
|-----------------------------|-------------|
| Whisper transcription       | $0.10       |
| GPT-4o analysis + treatment | $0.15       |
| FLUX.1 images (~25 images)  | $0.08       |
| RunwayML 5-sec clips (x36)  | $1.80       |
| **Total**                   | **~$2.15**  |

---

## Quick Start

### 1. Configure
```bash
cp .env.example .env
# Fill in your API keys
```

### 2. Start Redis
```bash
docker-compose up -d
```

### 3. Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# In a second terminal:
celery -A workers.pipeline_worker worker --loglevel=info
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

---

## Continuity Bible

Every project generates a `BIBLE.md` that tracks all named elements, approved
appearances, asset paths, storyboard order, and color palette. This ensures
visual consistency even if work is paused and resumed across sessions.

See `bible_template/BIBLE.md` for the full structure.

---

## License

Proprietary — © TheVoodooHut. All rights reserved.
