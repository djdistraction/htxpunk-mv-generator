# Pipeline test run — 2026-07-10

Context: full end-to-end run of the music video generator pipeline (audio -> treatment -> elements -> shot manifest -> storyboard -> base video -> optional lip sync -> final export), post PR #35 (aeneas fix, not yet merged, tested manually on branch `claude/fix-aeneas-install-check`).

## Log

### 1. UI look and feel
Interface doesn't match desired aesthetic. User wanted "classic Windows basic but sturdy and trustworthy" look. Current UI doesn't read that way. **Needs design pass** — no severity/blocker, but worth a dedicated design review.

### 2. New Project flow — Production Workbook confusion
After creating a project (song title, audio upload, lyrics paste, "cinematic music video" path), landed on Production Workbook with unclear UX:

- **"Project Setup [locked]"**: Lists required inputs (title, production path, artist, creative direction) with no visible way to input/edit them in this section. Turned out these are auto-populated from the audio file's ID3 tags (confirmed via API: `section_statuses.project_setup.status = "generated"`, message "Metadata was read and is ready for setup review"). The UI needs to make clear these are auto-filled + reviewable, not blank required fields with no input path — reads as broken when it isn't.
- **"Song File [Generated]"**: Copy is confusing/self-contradictory — says "original audio file required" and lists "isolated vocal stem" as also required, which reads as an oxymoron. Approve/Reject/"Replace from new-project flow" affordances aren't self-explanatory — unclear what's being approved or what Replace does.
- **Rhythm/Key analysis**: Ran fine — returned BPM 95, Key C# major, user manually verified accurate. Clicked Approve — button visually depressed but gave no confirmation feedback. **Turned out this DID work** (confirmed via API: `section_statuses.rhythm_key.status = "generated"`) — this is a missing-feedback UI bug, not a functional bug. Needs a visible success state (toast, checkmark, status change) on approve.

### 3. BLOCKER — Lyric transcription trips a server hang, not just a UI error
Clicking "start lyric transcription" led to a "Project not found" page. Console showed repeated 500s on `GET /api/projects/{id}` and `POST /api/projects/{id}/guided/isolate-vocals`, alongside frequent Next.js Fast Refresh rebuild cycles.

**Root cause identified (reproduced directly against the backend):**
- The actual failing step is `guided_isolate_vocals` (backend/api/projects.py) — before transcription can run, it isolates vocals via the `audio-separator` library (ONNX `Kim_Vocal_2` model), running **CPU-only** (no GPU acceleration detected: `PyTorch 2.12.1+cpu`, "No hardware acceleration could be configured, running in CPU mode").
- This is a long-running, blocking, synchronous call made directly inside an `async def` FastAPI route handler.
- **Confirmed the entire backend process is blocked while it runs** — a plain `GET /health` request timed out after 20s while vocal separation was in progress, on a totally separate connection. This isn't just one slow request; the whole single-process server stops answering anything (including trivial requests) until the job finishes.
- This means: the frontend's fetch (and any reasonable proxy/browser timeout) gives up long before the job completes, the UI shows a hard error / "not found", but the backend is often still silently working in the background. Confusing and looks catastrophic when it may not be.
- Likely affects other long CPU-bound steps too (transcription/Whisper, video render) if they follow the same pattern — worth auditing all `guided/*` and generation routes for the same issue.

**Fix direction (not yet implemented):** offload long CPU-bound work (vocal separation, transcription, video render) to a background worker/thread pool (e.g. `run_in_executor`, Celery/RQ, or a proper job queue) instead of running it inline in the request handler, and have the frontend poll job status rather than waiting on a single long request. Also worth checking if a GPU-enabled ONNX runtime is available/expected here, since CPU-only inference is what makes this so slow in the first place.

Restarted the backend under a monitored process to capture this — original process (PID 14268) was left in this same hung state after the user's attempt; a fresh restart was needed to get clean logs. Verified the specific project's DB state was never actually lost (`GET /api/projects/{id}` returns full project + all approved data once the server responds) — "Project not found" is a symptom of the timeout, not actual data loss.


