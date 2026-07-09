# Desktop Application Guide

HTXpunk MV Generator is now available as a professional desktop application with an intuitive installer and launcher.

## What's New

### ✨ One-Click Installation
No more command-line setup! Just download, run the installer, and answer 3 simple questions.

### 🎨 Beautiful Setup Wizard
- Step 1: Get your free API keys
- Step 2: Choose where to store videos
- Step 3: Confirm and start making videos

### 🚀 Automatic Backend Management
- Backend starts automatically in the background
- Health checks ensure everything is ready
- Graceful shutdown when you close the app

### 🎛️ System Tray Launcher
- Minimize to system tray
- Quick access to storage folder
- Settings and about menu
- One-click startup/shutdown

### 🔐 Secure Configuration
- API keys saved locally (never sent anywhere)
- Stored in user home directory
- Easy to reset or update

---

## Installation

### Download Installers

Choose your operating system:

#### Windows
- **HTXpunk MV Generator Setup 1.0.0.exe** (recommended)
  - Full installer with uninstaller
  - Desktop shortcut
  - Start menu shortcut
  
- **HTXpunk MV Generator 1.0.0 portable.exe** (alternative)
  - No installation needed
  - Portable version
  - Can run from USB drive

**System Requirements:**
- Windows 7 or later
- 500MB free disk space
- Internet connection (for first setup)

**Installation Steps:**
1. Download `HTXpunk MV Generator Setup 1.0.0.exe`
2. Double-click to run installer
3. Click "Next" through the welcome screen
4. Choose installation folder (default: `C:\Users\{username}\AppData\Local\HTXpunk MV Generator`)
5. Click "Finish"
6. Setup wizard will launch automatically

---

#### macOS
- **HTXpunk MV Generator-1.0.0.dmg** (application bundle)
- **HTXpunk MV Generator-1.0.0.zip** (alternative)

**System Requirements:**
- macOS 10.13 (High Sierra) or later
- Intel or Apple Silicon (M1/M2/M3)
- 500MB free disk space
- Python 3.11+ (included or via Homebrew)

**Installation Steps:**
1. Download the `.dmg` file
2. Double-click to mount the disk image
3. Drag "HTXpunk MV Generator" to the Applications folder
4. Open Applications and click "HTXpunk MV Generator"
5. If you get a security warning, right-click and select "Open"
6. Setup wizard will launch

**If Python is missing:**
```bash
# Install via Homebrew
brew install python@3.11
```

---

#### Linux
- **HTXpunk-MV-Generator-1.0.0.AppImage** (recommended - no installation needed)
- **htxpunk-mv-generator-1.0.0.deb** (for Debian/Ubuntu)
- **HTXpunk-MV-Generator-1.0.0.x86_64.rpm** (for Fedora/RHEL)

**System Requirements:**
- glibc 2.29+ (available on most modern Linux distros)
- Python 3.11+
- FFmpeg
- 500MB free disk space

**AppImage (easiest):**
```bash
# Make executable
chmod +x HTXpunk-MV-Generator-1.0.0.AppImage

# Run
./HTXpunk-MV-Generator-1.0.0.AppImage
```

**Debian/Ubuntu:**
```bash
sudo apt-get update
sudo apt-get install python3.11 ffmpeg

# Install
sudo apt-get install ./htxpunk-mv-generator-1.0.0.deb

# Run from terminal or Applications menu
htxpunk-mv-generator
```

**Fedora/RHEL:**
```bash
sudo dnf install python3.11 ffmpeg

# Install
sudo dnf install HTXpunk-MV-Generator-1.0.0.x86_64.rpm

# Run
htxpunk-mv-generator
```

---

## Setup Wizard

When you first launch the app, you'll see the setup wizard:

### Step 1️⃣ : Get API Keys

You need two free API keys to power your videos. Both are completely free and don't require a credit card.

**Groq API Key:**
1. Go to https://console.groq.com
2. Click "Sign in" or "Sign up"
3. Verify your email
4. Click "Keys" in the left menu
5. Click "Create New Key"
6. Copy the key (starts with `gsk_`)
7. Paste in the setup wizard

**HuggingFace Token:**
1. Go to https://huggingface.co
2. Sign in or create account
3. Click your profile → Settings → Access Tokens
4. Click "Create new token"
5. Choose "Read" for permission level
6. Copy the token (starts with `hf_`)
7. Paste in the setup wizard

### Step 2️⃣: Choose Storage Location

This is where generated images and videos will be saved.

**Recommended:** 50GB+ free space (high-quality videos are large)

**Default:** `~/.htxpunk-mv-generator/storage/`

You can:
- Click "Browse" to choose a different folder
- Use a folder on a separate drive with more space
- Change backend port if 8000 is already in use

### Step 3️⃣: Confirm & Start

Review your settings:
- ✓ API keys will be securely saved
- ✓ Storage folder is configured
- ✓ Backend port is ready

Click "Finish" to start the app!

---

## First Launch

After setup, you'll see:

1. **Loading Screen** (10-15 seconds)
   - Backend is starting
   - Database is initializing
   - All systems check out

2. **Application Window**
   - HTXpunk dashboard loads
   - You're ready to upload songs!

---

## Using the App

### Upload a Song
1. Click "+ New Video"
2. Enter song title and artist
3. Upload MP3 file (1-4 minutes recommended)
4. Click "Upload & Start Pipeline"
5. Watch progress updates

### Approve Creative Treatment
1. When analysis is complete, click "Review Creative Vision"
2. Review the AI-generated treatment
3. Either "Approve" or request changes
4. Images start generating

### Review Storyboard
1. When storyboard is ready, click "Review Storyboard"
2. Reorder panels if needed (click arrows)
3. Click "Approve & Generate Video"
4. Video assembly begins

### Download Video
1. When complete, click "Production"
2. Click "Download MP4"
3. Video is saved to your Downloads folder

---

## System Tray

Right-click the HTXpunk icon in your system tray (bottom-right on Windows, top-right on Mac):

- **Show** - Open main window
- **Settings** - Access configuration
- **Open Storage Folder** - Browse generated videos
- **View Logs** - Check error logs
- **About** - App information
- **Quit** - Close the app

---

## Configuration

### Change API Keys
1. Right-click tray icon → Settings
2. Enter new API keys
3. Click Save
4. Backend will restart automatically

### Change Storage Path
1. Right-click tray icon → Settings
2. Click "Browse" to select new folder
3. Click Save
4. Videos will save to new location going forward

### Access Configuration Files

The app stores everything in your user directory:

- **Windows**: `C:\Users\{username}\AppData\Roaming\htxpunk-mv-generator\`
- **macOS**: `~/Library/Application Support/htxpunk-mv-generator/`
- **Linux**: `~/.htxpunk-mv-generator/`

Files:
- `config.json` - Your settings
- `.env` - Auto-generated environment file
- `storage/` - Generated videos and images

---

## Troubleshooting

### "Setup Wizard Won't Close"
- Make sure you completed all 3 steps
- Check that API key fields are not empty
- Try clicking Back then Next to validate

### "Backend Failed to Start"
**Windows:**
- Ensure Python 3.11+ is installed
- Run installer as Administrator
- Check if port 8000 is already in use

**macOS:**
- Install Python: `brew install python@3.11`
- Check if port 8000 is in use: `lsof -i :8000`

**Linux:**
- Install Python 3.11: `sudo apt-get install python3.11`
- Install FFmpeg: `sudo apt-get install ffmpeg`

### "Image Generation Fails"
- Verify HuggingFace token is correct
- Check internet connection
- Token must have "Read" permission
- Wait 24 hours if account is new

### "Video Assembly Hangs"
- Check system has at least 4GB free RAM
- Ensure stable internet (audio sync check)
- Try a shorter song (under 3 min) first
- Check FFmpeg is installed: `ffmpeg -version`

### "Storage Folder Permission Denied"
- Choose a different folder in settings
- On Windows, avoid system folders (Desktop works)
- On Mac, ensure you have write permission to chosen folder
- On Linux, use a folder you own, not /root or /var

---

## Tips & Tricks

### Speed Up Video Generation
- Use shorter songs (2-3 minutes)
- Request fewer image variations
- Approve treatments quickly
- Keep storyboard panels simple

### Better Quality Results
- Use high-quality MP3 files (320kbps recommended)
- Longer songs (3-4 minutes) allow more detail
- Specific treatment feedback gets better results
- Describe the mood in detail (dark, neon, abstract, etc.)

### Organize Videos
- Use descriptive names (Artist - Song - Style)
- Keep related videos in subfolders
- Build series for recurring characters
- Backup finished videos to external drive

### API Key Safety
- Keys are stored locally, never uploaded
- Each computer needs its own keys
- Can reset keys anytime on api provider websites
- If you share computer, set different key before handing over

---

## Advanced: Running Multiple Instances

Want to generate multiple videos at once?

```bash
# Terminal 1: First instance (default port 8000)
HTXpunk-MV-Generator

# Terminal 2: Second instance (different port)
PORT=8001 HTXpunk-MV-Generator

# Add another storage path for each instance
STORAGE_PATH=/different/path PORT=8002 HTXpunk-MV-Generator
```

Each will have separate queues and storage.

---

## Uninstalling

### Windows
- Open Settings → Apps → Apps & Features
- Find "HTXpunk MV Generator"
- Click "Uninstall"
- Follow prompts

### macOS
- Open Finder → Applications
- Right-click "HTXpunk MV Generator"
- Click "Move to Trash"
- Empty Trash

### Linux (AppImage)
- Just delete the `.AppImage` file
- Storage folder can be removed separately if desired

### Keep Your Videos
Configuration and videos are stored separately:
- **Windows**: `C:\Users\{username}\AppData\Roaming\htxpunk-mv-generator\`
- **macOS**: `~/Library/Application Support/htxpunk-mv-generator/`
- **Linux**: `~/.htxpunk-mv-generator/`

Backup this folder before uninstalling if you want to keep your videos.

---

## Getting Help

1. **Check the logs** - Right-click tray → View Logs
2. **Read error messages** - They usually tell you exactly what's wrong
3. **Check docs**:
   - [SETUP.md](SETUP.md) - Initial setup help
   - [CLAUDE.md](CLAUDE.md) - System architecture
   - [DEVELOPER.md](DEVELOPER.md) - Advanced topics

4. **Offline mode**:
   - If internet drops during video generation, it will retry
   - Some stages (image gen) need internet
   - Storage/storyboard can work offline

---

## What's Next?

Start making amazing AI-powered music videos! 🎬

**Quick Start:**
1. Upload a song
2. Approve the treatment
3. Approve the storyboard
4. Download your video

**Tips:**
- Start with a test song to learn the system
- Experiment with different feedback styles
- Build series for recurring characters
- Share your favorite results!

---

**Version:** 1.0.0  
**Built with:** Electron, FastAPI, Next.js, Remotion  
**Made by:** HTXpunk Productions
