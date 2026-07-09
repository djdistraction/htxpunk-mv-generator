# HTXpunk MV Generator — Working Development Setup

This is the recommended local setup for Windows development. Use the launcher first. It keeps the backend, frontend, and optional Electron shell in one controlled process tree so you do not have to juggle three terminals.

## Prerequisites

1. **Python 3.11+**
   - Install from python.org.
   - Verify in PowerShell:
     ```powershell
     py --version
     ```

2. **Node.js / npm**
   - Install from nodejs.org.
   - Verify:
     ```powershell
     node --version
     npm --version
     ```

3. **API credentials**
   - Groq API key for text analysis: https://console.groq.com
   - Cloudflare Workers AI Account ID and API token for image generation.
   - If you do not have Cloudflare credentials yet, the launcher can use `IMAGE_BACKEND=placeholder` so the app can start for a local smoke test.

## Recommended Start Command

From the project root:

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator"
py run.py --electron
```

The launcher will:

1. Check Python and Node.
2. Create or update `.env`.
3. Install Python, frontend, and Electron dependencies when needed.
4. Free ports `8000` and `3000` from old stuck runs.
5. Start the FastAPI backend.
6. Start the Next.js frontend.
7. Open the Electron desktop window.

Leave that PowerShell window open while using the app. Press **Ctrl+C** in that same window to shut everything down cleanly.

## Browser-Only Mode

To run without Electron:

```powershell
py run.py
```

Then open:

```text
http://localhost:3000
```

## Faster Restarts

After dependencies are already installed:

```powershell
py run.py --electron --no-install
```

## Expected Success Output

The backend should become healthy here:

```text
http://127.0.0.1:8000/health
```

The frontend should be reachable here:

```text
http://localhost:3000
```

The Electron app should show the same dashboard as the browser UI.

## Smoke Test

1. Start the app with `py run.py --electron`.
2. Confirm `http://127.0.0.1:8000/health` returns JSON.
3. Confirm `http://localhost:3000` loads the dashboard.
4. Click **+ New Video**.
5. Upload a short MP3, ideally 30-60 seconds for the first test.
6. Confirm the project appears and the pipeline begins.

If you used `IMAGE_BACKEND=placeholder`, the app can start and exercise the workflow, but generated imagery will be placeholder/test output rather than final AI imagery.

## Manual Three-Terminal Mode

Only use this if you are deliberately debugging one service at a time.

### Terminal 1: Backend

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\backend"
py -m uvicorn main:app --port 8000 --host 127.0.0.1 --reload
```

### Terminal 2: Frontend

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\frontend"
npm run dev
```

### Terminal 3: Electron Shell

Because the backend and frontend are already running, tell Electron not to spawn its own backend:

```powershell
cd "C:\Users\booki\HTXpunk LLC\htxpunk-mv-generator\electron-app"
$env:HTXPUNK_SKIP_BACKEND="1"
npm start
```

Without `HTXPUNK_SKIP_BACKEND=1`, Electron may try to start another backend on port `8000`, causing a port conflict.

## Troubleshooting

### Backend does not start

Check the health endpoint:

```powershell
curl http://127.0.0.1:8000/health
```

If the backend exits with configuration errors, open `.env` and verify:

```text
GROQ_API_KEY=...
IMAGE_BACKEND=cloudflare
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

For a local smoke test without Cloudflare:

```text
IMAGE_BACKEND=placeholder
```

### Port 8000 or 3000 already in use

The launcher tries to free those ports automatically. If manual cleanup is needed:

```powershell
taskkill /IM python.exe /F
taskkill /IM node.exe /F
```

### Frontend does not load

Restart through the launcher:

```powershell
py run.py --electron --no-install
```

### Electron opens but cannot connect

Use the launcher or set this before `npm start` in manual mode:

```powershell
$env:HTXPUNK_SKIP_BACKEND="1"
```

## Success Checklist

- [ ] `.env` exists in the project root.
- [ ] Backend health endpoint returns JSON.
- [ ] Frontend dashboard loads.
- [ ] Electron window opens when using `--electron`.
- [ ] A short MP3 can be uploaded.
- [ ] The project pipeline begins.

Once this passes, the next step is packaging the app into a true one-click Windows installer.
