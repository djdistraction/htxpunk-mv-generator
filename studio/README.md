# HTXpunk Studio v2

Greenfield music video **production desk** (job-based, foundation-first).

## Run (dev)

```powershell
# Terminal 1 — API (port 8010)
cd studio/backend
py -3 -m pip install -r requirements.txt
py -3 -m uvicorn main:app --reload --port 8010 --app-dir .

# Terminal 2 — UI (port 3010)
cd studio/frontend
npm install
npm run dev
```

Or from repo root:

```powershell
py run-studio.py
```

Open http://localhost:3010

## Phases

- **Phase 1 (this scaffold):** jobs + foundation upload/rhythm/vocals/lyrics  
- **Optional pre-isolated vocal stem** on create or on the Vocals step — skips CPU isolation when provided  

- **Phase 2:** lyric video render  
- **Phase 3–6:** treatment → element images (visual lock) → storyboard → linked clips → Modal lip sync  

Does not replace the legacy app until cutover; lives beside `frontend/` + `backend/`.
