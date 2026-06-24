# Developer Guide

This guide covers extending the HTXpunk music video generator with new features, debugging, and deployment.

---

## Architecture Quick Reference

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Next.js 15 on :3000)                     │
│  - Project list, upload, dashboard, approval UI     │
│  - Uses React hooks + Axios for backend calls       │
└────────────────┬────────────────────────────────────┘
                 │ /api/projects, /api/pipeline, /api/assets
                 ↓
┌─────────────────────────────────────────────────────┐
│  Backend (FastAPI on :8000)                         │
│  - REST API endpoints (/api/...)                    │
│  - Chimera Tower Orchestrator (background thread)   │
│  - SQLite database (./htxpunk.db)                   │
│  - Worker pool (ThreadPoolExecutor, 4 threads)      │
└────────────┬────────────────────────────────────────┘
             │ Dispatches workers
             ↓
┌─────────────────────────────────────────────────────┐
│  Workers (Pipeline stages)                          │
│  1. Audio Analysis (Whisper + Groq)                 │
│  2. Treatment Generation (Groq)                     │
│  3. Element Extraction (Groq)                       │
│  4. Image Generation (HuggingFace FLUX)             │
│  5. Storyboard Build (Pillow)                       │
│  6. Video Assembly (Remotion + FFmpeg)              │
└─────────────────────────────────────────────────────┘
```

---

## Adding a New Pipeline Stage

### Example: Adding a "Color Grade" stage after storyboard approval

**1. Define the orchestrator mapping**  
Edit `backend/orchestrator.py`:
```python
STAGE_WORKERS = {
    # ... existing stages ...
    "storyboard_approved": "run_video_assembly",
    # Add this:
    "awaiting_color_grade": "run_color_grading",  # New human gate
}

TRANSITIONAL_RESET = {
    # ... existing stages ...
    "color_grading": "awaiting_color_grade",  # If server crashes during this stage
}
```

**2. Implement the worker**  
Edit `backend/workers/pipeline_worker.py`:
```python
def run_color_grading(project_id: str):
    """Apply color grading to storyboard panels."""
    _set_stage(project_id, "color_grading")
    project = _get_project(project_id)
    
    panels = db_get_assets(project_id, asset_type="storyboard_panel")
    for panel in panels:
        # ... color grading logic ...
        pass
    
    db_update_project(project_id, stage="awaiting_color_grade_approval")
```

**3. Add frontend UI**  
Edit `frontend/app/projects/[id]/ProjectDetail.tsx`:
```tsx
const STAGE_LABELS: Record<string, string> = {
    // ... existing stages ...
    awaiting_color_grade_approval: "✋ Review color grade",
    color_grading: "🎨 Applying color grade…",
}

const STAGE_ORDER = [
    // ... existing stages ...
    "storyboard_approved",
    "color_grading",
    "awaiting_color_grade_approval",
    "assembling",
    "complete",
]
```

**4. Create approval endpoint** (optional)  
Edit `backend/api/pipeline.py`:
```python
@router.post("/{project_id}/approve-color-grade")
async def approve_color_grade(project_id: str):
    project = db_get_project(project_id)
    if not project:
        raise HTTPException(status_code=404)
    db_update_project(project_id, stage="storyboard_approved")  # Resume
    return {"message": "Color grade approved"}
```

---

## Debugging

### Enable verbose logging
```python
# In backend/main.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Check orchestrator status
```bash
# View running tasks
sqlite3 backend/htxpunk.db
> SELECT * FROM tasks WHERE status='running';

# View stuck projects
> SELECT id, stage FROM projects WHERE stage LIKE '%pending%' OR stage LIKE '%analyzing%';
```

### Test a service in isolation
```bash
cd backend
python -c "
from services.audio_analyzer import transcribe_audio
from pathlib import Path

audio_path = 'path/to/song.mp3'
result = transcribe_audio(audio_path)
print('Language:', result['language'])
print('Duration:', len(result['segments']), 'segments')
"
```

### Monitor orchestrator in real-time
```bash
# Terminal 1: Start backend
cd backend
python -c "
import logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
import uvicorn
uvicorn.run('main:app', host='localhost', port=8000, reload=False)
"

# Terminal 2: Watch database changes
watch -n 1 'sqlite3 backend/htxpunk.db \"SELECT stage, COUNT(*) FROM projects GROUP BY stage;\"'
```

---

## Testing

### Unit test a service
```python
# backend/test_audio_analyzer.py
from services.audio_analyzer import transcribe_audio

def test_transcribe():
    result = transcribe_audio("fixtures/sample.mp3")
    assert "segments" in result
    assert len(result["segments"]) > 0
    assert "text" in result

if __name__ == "__main__":
    test_transcribe()
    print("✓ Audio analysis working")
```

### Integration test the pipeline
```bash
# backend/test_pipeline.py
import uuid
from database import db_create_project, db_update_project

project_id = str(uuid.uuid4())
db_create_project(project_id, "Test Song", "Test Artist")
db_update_project(project_id, audio_url="path/to/test.mp3", stage="uploaded")

# Orchestrator will pick it up automatically
# Check status with:
sqlite3 htxpunk.db "SELECT stage FROM projects WHERE id='$project_id';"
```

---

## Performance Tuning

### Audio Analysis
- **Whisper model size**: `tiny` (10s) < `base` (20s) < `small` (50s) < `medium` (100s)
- Default is `base` — good balance of speed & accuracy
- Switch to `small` if you need higher accuracy on CPU
- Use `tiny` on weak machines

### Image Generation
- HuggingFace FLUX free tier: ~60 images/hour (2s rate limit)
- Each video needs ~4 backgrounds + 8-12 character states = 50-60 images
- Total time: ~50 min → ~10 min with commercial FLUX
- Upgrade path: `HuggingFace FLUX` → `Local FLUX` (GPU) or `Replicate`

### Video Assembly
- FFmpeg Ken Burns: CPU-bound, single-threaded
- Typical 4-min song: 15-25 min on modern CPU
- Upgrade path: `FFmpeg` → `Remotion` (GPU via Wan2.1) → Custom CUDA

### Database
- SQLite works fine for <1000 projects
- Switch to PostgreSQL after that for better concurrency

---

## Deployment

### Docker (coming soon)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment variables for production
```bash
# Database (use PostgreSQL)
DATABASE_URL=postgresql+asyncpg://user:pass@db.host:5432/mvgen

# Storage (use Cloudflare R2)
STORAGE_BACKEND=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# LLM (use OpenAI for higher quality)
GROQ_API_KEY=...  # or switch to OpenAI
GROQ_MODEL=llama-3.3-70b-versatile

# Image generation (use commercial API for speed)
HF_TOKEN=...  # or Replicate API key
```

### Security checklist
- [ ] Disable debug mode
- [ ] Use HTTPS only
- [ ] Add authentication (JWT, OAuth)
- [ ] Rate limit API endpoints
- [ ] Sanitize file uploads
- [ ] Add CORS restrictions
- [ ] Use environment variables for secrets (never commit keys)
- [ ] Enable database encryption at rest
- [ ] Set up monitoring/alerting

---

## Common Issues & Solutions

### Memory leak in audio processing
**Symptom:** Process grows to 8GB+ RAM after 10 videos  
**Cause:** Whisper model not garbage collected  
**Fix:** 
```python
# In services/audio_analyzer.py
_whisper_model = None  # Global cache

def _get_whisper():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel(...)
    return _whisper_model

# Add this to orchestrator.py after each task:
import gc
gc.collect()  # Force garbage collection
```

### Image generation rate limit
**Symptom:** `429 Too Many Requests` from HuggingFace  
**Cause:** Hitting 2s per-call rate limit  
**Fix:** Add exponential backoff retry:
```python
import time
for attempt in range(5):
    try:
        image = generate_element(...)
        return image
    except RateLimitError:
        wait_time = 2 ** attempt
        logger.warning(f"Rate limited, waiting {wait_time}s")
        time.sleep(wait_time)
```

### Video assembly fails with "segment mismatch"
**Symptom:** FFmpeg exit code 1, audio/video length mismatch  
**Cause:** Storyboard panels don't align with audio duration  
**Fix:** Update panel duration calculation:
```python
total_duration = sum(p["duration"] for p in panels)
if total_duration != audio_duration:
    # Scale panels to fit audio
    scale = audio_duration / total_duration
    for p in panels:
        p["duration"] *= scale
```

---

## IDE Setup

### VS Code
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend (FastAPI)",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/backend/main.py",
      "console": "integratedTerminal",
      "env": {"PYTHONPATH": "${workspaceFolder}/backend"}
    },
    {
      "name": "Frontend (Next.js)",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/frontend/node_modules/.bin/next",
      "args": ["dev"],
      "cwd": "${workspaceFolder}/frontend",
      "console": "integratedTerminal"
    }
  ]
}
```

### PyCharm
- Mark `/backend` as "Sources Root"
- Set Python interpreter to venv
- Enable FastAPI framework support
- Set run config: `Module: uvicorn` → `main:app --reload`

---

## Contributing

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commit messages**: `Brief description + why (50 char limit)`
3. **PR template**:
   ```
   ## What this does
   Brief description of changes
   
   ## Testing
   How to verify it works
   
   ## Deployment notes
   Any env var changes, migrations, etc.
   ```

---

## Resources

- **Remotion docs**: https://www.remotion.dev/docs
- **FastAPI**: https://fastapi.tiangolo.com/
- **Groq API**: https://console.groq.com/docs
- **HuggingFace Inference**: https://huggingface.co/docs/hub/inference-api
- **FFmpeg**: https://ffmpeg.org/ffmpeg.html

---

**Last updated:** June 2026  
**Maintainer:** HTXpunk Productions
