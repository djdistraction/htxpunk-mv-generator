# Quick Build Guide for Windows Installer

This guide walks you through building the desktop installer on your local Windows machine.

## Prerequisites

Install these on your Windows machine (if not already installed):

1. **Node.js 16+**
   - Download from https://nodejs.org/
   - Install (includes npm)
   - Verify: `node --version && npm --version`

2. **Python 3.11+**
   - Download from https://www.python.org/downloads/
   - **IMPORTANT:** Check "Add Python to PATH" during installation
   - Verify: `python --version`

3. **Git**
   - Download from https://git-scm.com/
   - Keep default settings
   - Verify: `git --version`

## Build Steps

### 1. Pull Latest Code

```powershell
cd path\to\your\htxpunk-mv-generator
git pull origin claude/youthful-cray-l9yx4c
```

### 2. Install Frontend Dependencies

```powershell
cd frontend
npm install
npm run build
cd ..
```

### 3. Install Backend Dependencies

```powershell
cd backend
pip install -r requirements.txt
cd ..
```

### 4. Install Electron App Dependencies

```powershell
cd electron-app
npm install
```

This will:
- Download electron (may take 1-2 minutes)
- Download electron-builder
- Set up all build tools

### 5. Build Windows Installer

```powershell
npm run dist:win
```

This creates:
- `dist/HTXpunk MV Generator Setup 1.0.0.exe` (full installer)
- `dist/HTXpunk MV Generator 1.0.0 portable.exe` (portable version)

Build takes 2-5 minutes. You'll see progress in the console.

### 6. Test the Installer

1. Find the `.exe` file in `electron-app/dist/`
2. Double-click to run the installer
3. Complete setup wizard with your API keys
4. Verify the app launches and loads

## Troubleshooting

### npm install hangs on "electron"
- This is normal - Electron binary is large (150MB+)
- Wait 2-3 minutes, don't interrupt
- If it still fails after 5 min, try: `npm install --verbose`

### "python: command not found"
- Python wasn't added to PATH during installation
- Reinstall Python and check "Add Python to PATH"
- Restart PowerShell after reinstalling

### "electron not found"
- Run `npm install` again
- Ensure no antivirus is blocking downloads
- Try on a different network if all else fails

### Build says "Cannot find ffmpeg"
- This is a warning, not an error - FFmpeg is bundled at runtime
- The build will complete successfully

## What You Built

- **HTXpunk MV Generator Setup 1.0.0.exe** (340MB)
  - Full installer with wizard
  - Creates Start Menu shortcuts
  - Can be distributed to users
  - Run: Just double-click

## Next Steps

1. **Test the installer** on your machine
2. **Share with others** - they can run the `.exe` file
3. **For macOS/Linux** - Use the same steps but run `npm run dist:mac` or `npm run dist:linux` on those platforms
4. **Upload to GitHub** - Create a release and attach the .exe for distribution

## For Users Installing Your App

Users just need to:
1. Download `HTXpunk MV Generator Setup 1.0.0.exe`
2. Double-click to install
3. Answer 3 setup questions (API keys, storage path)
4. Start making videos!

---

**Note:** If `npm install` fails to download Electron on your first attempt, you may need to:
- Check your internet connection
- Disable antivirus temporarily
- Try from a different network
- Check if your firewall blocks npm registry

The fix we made to `package.json` removed all problematic dependencies, so installation should now be smooth.
