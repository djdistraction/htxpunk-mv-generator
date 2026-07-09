# 🚀 Quick Start Guide

Complete setup takes **5-10 minutes** if you already have API keys.

## Step 1: Get Free API Keys (2 min)

### Groq API Key (required)
1. Go to https://console.groq.com
2. Click "Sign in" or "Sign up" (no credit card needed)
3. Go to Keys → Create New Key
4. Copy your API key (starts with `gsk_`)

### HuggingFace Token (required)
1. Go to https://huggingface.co
2. Sign in or create an account (free)
3. Click your avatar → Settings → Access Tokens
4. Create new token with "Read" access
5. Copy your token (starts with `hf_`)

## Step 2: Configure Environment

```bash
# In the project root (/home/user/htxpunk-mv-generator):
cp .env.example .env

# Edit .env and replace:
# GROQ_API_KEY=gsk_YOUR_KEY_HERE → paste your Groq key
# HF_TOKEN=hf_YOUR_TOKEN_HERE → paste your HuggingFace token
```

## Step 3: Install Remotion (required for video rendering)

```bash
cd remotion-composer
npm install

# This may take 2-3 minutes on first run
```

## Step 4: Install & Start Backend

```bash
cd backend
pip install -r requirements.txt

# Terminal 1 — API Server
uvicorn main:app --reload --port 8000

# Wait for "Chimera Tower online" message, then move to Step 5
```

## Step 5: Install & Start Frontend

**In a new terminal:**

```bash
cd frontend
npm install
npm run dev

# Opens http://localhost:3000
```

## Step 6: Upload Your First Song

1. Open http://localhost:3000
2. Click "+ New Video"
3. Fill in Song Title & Artist
4. Upload an MP3 (1-4 minutes recommended)
5. Click "Upload & Start Pipeline"
6. Watch the progress tracker update

**Total time: ~45 minutes** (1 min analysis + 5-10 min image gen + 15-25 min video assembly)

---

## Troubleshooting

### Backend won't start
```bash
# Check Python version (need 3.11+)
python --version

# Try installing dependencies again
pip install --upgrade -r requirements.txt

# Check for auth errors in .env
grep GROQ_API_KEY .env
grep HF_TOKEN .env
```

### Frontend can't reach backend
```bash
# Check backend is running
curl http://localhost:8000/health

# Should return JSON with status="ok"
# If not, backend not running or wrong port
```

### Image generation fails
```bash
# Check your HuggingFace token is correct
# Token must have "Read" permission
# Go to https://huggingface.co/settings/tokens to verify
```

### Everything looks stuck
```bash
# Check orchestrator is running
# In backend terminal, look for "Chimera Tower online"

# Check database isn't corrupted
sqlite3 backend/htxpunk.db "SELECT COUNT(*) FROM projects;"

# If stuck, manually reset project:
# sqlite3 backend/htxpunk.db
# UPDATE projects SET stage='analyzed' WHERE id='PROJECT_UUID';
# .exit
```

---

## Next: Read CLAUDE.md

For full architecture, advanced config, and development info, see **CLAUDE.md**.

---

## Common Commands

### Check backend health
```bash
curl http://localhost:8000/health | jq
```

### View database
```bash
sqlite3 backend/htxpunk.db
> SELECT id, title, stage FROM projects;
> .exit
```

### View storage files
```bash
ls -la backend/storage/
```

### Clear all projects & start fresh
```bash
rm backend/htxpunk.db
# Backend will recreate on next start
```

### Frontend development
```bash
cd frontend
npm run clean-dev  # Clear cache & restart
npm run lint       # Check for errors
```

---

## CPU Performance Estimates

- **Audio analysis:** 1-2 min (CPU)
- **Image generation:** 5-10 min (API rate-limited, not CPU bound)
- **Video assembly:** 15-25 min (CPU bound, single-threaded)

**Total:** ~45 min for a 3-4 min song

GPU upgrades reduce video assembly to <2 min, but audio analysis and image gen remain the bottleneck for free tiers.

---

## Getting Help

1. Check **CLAUDE.md** for architecture & troubleshooting
2. Check backend logs for detailed errors: `tail -f backend/storage/logs.txt` (if enabled)
3. Enable debug mode:
   ```bash
   # In .env, add:
   DEBUG=true
   LOG_LEVEL=DEBUG
   ```

---

**Happy video making! 🎬**
