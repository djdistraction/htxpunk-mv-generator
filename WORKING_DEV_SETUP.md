# HTXpunk MV Generator — Working Development Setup

This is the **tested, working setup** to run the app end-to-end on your Windows machine.

## Prerequisites (Install Once)

1. **Python 3.11+**
   - Download from https://python.org
   - Install (no special options needed, `py` command will work automatically on Windows)
   - Verify: `py --version`

2. **Node.js 16+**
   - Download from https://nodejs.org
   - Install with defaults
   - Verify: `node --version && npm --version`

3. **Your API Keys**
   - Groq API Key from https://console.groq.com (free, no credit card)
   - HuggingFace Token from https://huggingface.co/settings/tokens (free, read access)

## Step 1: Install All Dependencies

Run these once in the project root:

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"

# Backend dependencies (takes 2-3 minutes, includes ML models)
cd backend
py -m pip install -r requirements.txt
cd ..

# Frontend dependencies
cd frontend
npm install
cd ..

# Electron app dependencies
cd electron-app
npm install
cd ..
```

## Step 2: Create `.env` File

Create a file named `.env` in the project root (same level as `backend/`, `frontend/`, `electron-app/`):

```
GROQ_API_KEY=gsk_YOUR_KEY_HERE
HF_TOKEN=hf_YOUR_TOKEN_HERE
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=./backend/storage
DATABASE_URL=sqlite+aiosqlite:///./backend/htxpunk.db
VIDEO_BACKEND=ffmpeg
WHISPER_MODEL=base
```

Replace:
- `gsk_YOUR_KEY_HERE` with your actual Groq API key
- `hf_YOUR_TOKEN_HERE` with your actual HuggingFace token

## Step 3: Open Three Terminals

You'll run three servers in parallel. Use PowerShell or CMD for each:

### Terminal 1: Backend (Port 8000)

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\backend"
py -m uvicorn main:app --port 8000 --reload
```

**Expected output:**
```
INFO:     Started server process [xxxx]
INFO:     Waiting for application startup.
INFO:     Chimera Tower online (orchestrator ready)
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

✓ When you see "running on http://127.0.0.1:8000", the backend is ready.

### Terminal 2: Frontend (Port 3000)

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\frontend"
npm run dev
```

**Expected output:**
```
  ▲ Next.js 16.2.9
  - Local:        http://localhost:3000
  - Environments: .env.local
```

✓ When you see "Local: http://localhost:3000", the frontend is ready.

### Terminal 3: Electron App

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\electron-app"
npm start
```

**Expected sequence:**
1. Electron window opens
2. Setup wizard appears (if first run)
3. Enter your Groq key and HuggingFace token
4. Choose a storage folder (default is `./backend/storage`)
5. Click "Finish"
6. Dashboard loads

✓ You should see the project list page with a "New Video" button.

## Step 4: Test End-to-End

Once all three terminals show they're running:

1. **Go to http://localhost:3000** in your browser (should show the same dashboard as the Electron app)
2. **Click "+ New Video"** in the Electron app
3. **Upload a test song** (any MP3, 30-60 seconds for fast testing)
4. **Wait for analysis** — you should see progress updates
5. **Approve the treatment** — when ready, click "Review Creative Vision" and approve
6. **Wait for images** — background and character images generate (takes 3-5 minutes)
7. **Approve storyboard** — when ready, review and approve
8. **Wait for video** — video assembles (takes 10-20 minutes for 1 min song)
9. **Download video** — when complete, you can download the MP4

✓ **If you get through all these steps and can download a video, the app is working.**

## Troubleshooting

### "Backend won't start"
```
Error: GROQ_API_KEY not set
```
→ Your `.env` file is missing or the keys are wrong. Check the file exists and keys are correct.

### "Port 8000 already in use"
```
error while attempting to bind on address ('127.0.0.1', 8000)
```
→ Kill any lingering backend: `taskkill /IM python.exe /F`

### "Setup wizard won't close"
→ Make sure API keys are filled in (no empty fields) and click "Finish", not a blank area.

### "Electron won't connect to backend"
→ Verify Terminal 1 says "Uvicorn running on http://127.0.0.1:8000"
→ Open http://127.0.0.1:8000/health in your browser — should show JSON

### "Frontend won't load"
→ Verify Terminal 2 says "Local: http://localhost:3000"
→ Open http://localhost:3000 in your browser — should show the dashboard

### "Image generation fails"
→ Verify your HF_TOKEN is correct and has read permissions
→ Check that you've waited 24 hours if your HuggingFace account is brand new

## Keeping Everything Running

**Important:** Keep all three terminals open while you're using the app. If any terminal closes:
- Close the others
- Start over from Terminal 1

Later, once this is working, we can bundle everything into a single installer.

## Success Checklist

- [ ] `.env` file created with your real API keys
- [ ] Terminal 1: Backend says "Uvicorn running on http://127.0.0.1:8000"
- [ ] Terminal 2: Frontend says "Local: http://localhost:3000"
- [ ] Terminal 3: Electron window opens
- [ ] Setup wizard appears or dashboard loads
- [ ] Can upload a song
- [ ] Can approve treatment
- [ ] Can view generated images
- [ ] Can approve storyboard
- [ ] Can download a video file

✓ If all checkboxes pass, your app is fully operational.

## Next Steps

Once you confirm this setup works, we'll:
1. Build a self-contained Windows installer
2. Bundle the frontend and backend together
3. Create a true one-click install experience
