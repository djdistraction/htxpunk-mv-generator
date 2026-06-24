# Build & Distribution Guide

Complete guide to building and distributing HTXpunk MV Generator as a standalone desktop application.

## Prerequisites

### System Requirements
- **Node.js**: 16+ (for building Electron app)
- **Python**: 3.11+ (for backend)
- **FFmpeg**: 4.0+ (system binary or bundled)
- **Git**: 2.0+ (if building from source)

### Development Tools
- Electron 27+
- Electron Builder 24+
- PyInstaller (optional, for standalone Python runtime)

## Quick Build (Development)

### 1. Install Dependencies

```bash
# Frontend dependencies
cd frontend
npm install

# Remotion dependencies
cd ../remotion-composer
npm install

# Backend dependencies
cd ../backend
pip install -r requirements.txt

# Electron app dependencies
cd ../electron-app
npm install
```

### 2. Test the Electron App

```bash
cd electron-app
npm run dev
```

This launches:
- Setup wizard on first run
- Electron main process with dev tools
- React frontend in development mode
- Python backend (should start automatically)

## Production Build

### 1. Build Frontend

```bash
cd frontend
npm run build
# Creates: frontend/build/
```

### 2. Build Remotion Bundle

```bash
cd remotion-composer
npm run build
# Creates: remotion-composer/dist/
```

### 3. Prepare Backend

```bash
cd backend
pip install -r requirements.txt
# Ensure all dependencies are in requirements.txt
```

### 4. Create Desktop Installers

```bash
cd electron-app
npm run build
npm run dist
# Creates installers in: dist/
```

## Platform-Specific Builds

### Windows Installer

```bash
cd electron-app
npm run dist:win
# Creates:
# - HTXpunk MV Generator Setup 1.0.0.exe (NSIS installer)
# - HTXpunk MV Generator 1.0.0 portable.exe
```

**Requirements:**
- Windows 7 or later
- Administrator privileges for installation
- 500MB+ disk space

**Features:**
- Custom NSIS installer with Next/Back buttons
- Desktop and Start Menu shortcuts
- Uninstaller
- Auto-updates support

### macOS App Bundle

```bash
cd electron-app
npm run dist:mac
# Creates:
# - HTXpunk MV Generator-1.0.0.dmg
# - HTXpunk MV Generator-1.0.0.zip
```

**Requirements:**
- macOS 10.13+
- 500MB+ disk space

**Code Signing (Optional but recommended):**

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_TEAM_ID="XXXXXXXXXX"  # From Apple Developer Account
npm run dist:mac
```

### Linux Package

```bash
cd electron-app
npm run dist:linux
# Creates:
# - HTXpunk-MV-Generator-1.0.0.AppImage (no installation needed)
# - htxpunk-mv-generator-1.0.0.deb (Debian/Ubuntu)
# - HTXpunk-MV-Generator-1.0.0.x86_64.rpm (Red Hat/Fedora)
```

**AppImage** (recommended):
- Single executable, no installation needed
- Just download and run: `./HTXpunk-MV-Generator-1.0.0.AppImage`
- Works on any Linux distro with glibc 2.29+

**Debian**:
```bash
sudo apt install ./htxpunk-mv-generator-1.0.0.deb
htxpunk-mv-generator
```

## Advanced: Custom Python Runtime

For completely standalone packages without requiring system Python:

### Using PyInstaller

```bash
pip install pyinstaller

cd backend
pyinstaller --onefile \
  --name uvicorn-server \
  --hidden-import=uvicorn \
  --hidden-import=fastapi \
  --collect-all=fastapi \
  --collect-all=sqlalchemy \
  main.py

# Creates: backend/dist/uvicorn-server
```

Then update `electron-app/main.js`:

```javascript
const pythonBinary = isDev
  ? 'python'
  : path.join(__dirname, '..', 'backend', 'dist', 'uvicorn-server');

backendProcess = spawn(pythonBinary, [...]);
```

### Using Conda/Mamba

For more reproducible builds across machines:

```bash
conda create -n htxpunk-build \
  python=3.11 \
  ffmpeg \
  -y

conda activate htxpunk-build
pip install -r backend/requirements.txt
```

Then in CI/CD, package the entire conda environment.

## Signing & Notarization

### macOS Code Signing

```bash
# Requires Apple Developer Certificate
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ID)"
npm run dist:mac
```

After build, notarize:
```bash
xcrun altool --notarize-app \
  --file dist/HTXpunk MV Generator-1.0.0.dmg \
  --primary-bundle-id tv.thevoodoohut.mvgenerator \
  --username $APPLE_ID \
  --password $APPLE_PASSWORD
```

### Windows Code Signing

```bash
export WIN_CERTIFICATE_FILE="path/to/certificate.pfx"
export WIN_CERTIFICATE_PASSWORD="your-password"
npm run dist:win
```

## Versioning & Updates

### Semantic Versioning

Update version in:
1. `electron-app/package.json`: `"version": "1.0.0"`
2. `backend/config.py`: Update any version constants
3. Create git tag: `git tag v1.0.0 && git push origin v1.0.0`

### Auto-Updates (Electron Updater)

The Electron Builder config already supports auto-updates via GitHub releases. To enable:

```bash
# Create a GitHub release with the installer file
gh release create v1.0.0 \
  dist/HTXpunk\ MV\ Generator\ Setup\ 1.0.0.exe \
  dist/HTXpunk\ MV\ Generator-1.0.0.dmg \
  dist/HTXpunk-MV-Generator-1.0.0.AppImage
```

Then in `electron-app/main.js`, enable auto-updates:

```javascript
if (!isDev) {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.checkForUpdatesAndNotify();
}
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/build.yml`:

```yaml
name: Build Installers

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - run: cd electron-app && npm install && npm run dist
      - uses: softprops/action-gh-release@v1
        with:
          files: electron-app/dist/**
```

## Distribution

### Direct Download
- Host installers on your website
- Static hosting (GitHub Pages, S3, etc.)
- Version history and release notes

### Package Managers

#### Windows (Chocolatey)
```bash
# Submit to: https://chocolatey.org/
choco pack htxpunk-mv-generator.nuspec
```

#### macOS (Homebrew)
```bash
# Create tap: https://github.com/yourusername/homebrew-htxpunk
brew tap yourusername/htxpunk
brew install htxpunk-mv-generator
```

#### Linux (Flathub)
```bash
# Create Flatpak manifest and submit to https://flathub.org/
```

### App Stores

#### Windows Microsoft Store
- Submit to: https://partner.microsoft.com/
- Requires: Windows Subsystem for App Execution (WAM)

#### macOS App Store
- Register as Apple Developer
- Requires code signing and notarization
- Submit via Transporter

## Troubleshooting

### Build fails with "Python not found"
```bash
# Ensure Python is in PATH
which python  # macOS/Linux
where python  # Windows
# If not found, install from python.org
```

### Installer is too large (>500MB)
This likely means dependencies are being included multiple times:
1. Remove `node_modules` from backend files in `electron-app/package.json` build config
2. Use `npm ci --production` instead of `npm install`
3. Consider using pre-built Python runtime

### macOS DMG won't open
```bash
# Check code signing
codesign -v dist/HTXpunk\ MV\ Generator.app

# If failed, re-sign:
codesign -s - dist/HTXpunk\ MV\ Generator.app --deep
```

### FFmpeg not found at runtime
On Linux, users may need to install FFmpeg:
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# Fedora
sudo dnf install ffmpeg

# macOS (via Homebrew)
brew install ffmpeg
```

Or bundle it with the app:
```bash
# Download FFmpeg binary
wget https://ffmpeg.org/releases/ffmpeg-snapshot.tar.bz2
# Extract to: electron-app/binaries/ffmpeg
```

## Performance Tips

1. **Minimize bundle size**
   - Remove dev dependencies: `npm prune --production`
   - Use --asar to compress: electron-builder creates .asar archives

2. **Faster startup**
   - Pre-create directories during installation
   - Cache Python dependencies in installer
   - Use v8 code caching for faster JS parsing

3. **Lower resource usage**
   - Limit thread pool: `max_workers=2` in orchestrator for older machines
   - Make Whisper model optional (download on first use)

## Testing Before Release

```bash
# 1. Test installer
# Run the generated .exe/.dmg/.AppImage
# Complete setup wizard
# Verify UI loads
# Test a complete workflow (upload → video)

# 2. Test uninstall
# Remove app through system controls
# Verify all files cleaned up
# Verify no leftover processes

# 3. Test on clean system
# Use VM without Python/Node.js/FFmpeg installed
# Verify everything bundled correctly

# 4. Performance testing
# Monitor CPU/RAM during video generation
# Check file size of final video
# Verify audio sync is correct
```

## Release Checklist

- [ ] Update version numbers (electron-app/package.json, backend)
- [ ] Update CHANGELOG.md with release notes
- [ ] Test builds on Windows, macOS, Linux
- [ ] Verify installers can be run on clean systems
- [ ] Test complete workflow (upload to download video)
- [ ] Create GitHub release with installer files
- [ ] Update website download links
- [ ] Announce on social media
- [ ] Monitor for bug reports

## Support

For build issues:
1. Check Electron Builder docs: https://www.electron.build/
2. Check Node/Python versions match requirements
3. Try clean build: `rm -rf dist node_modules && npm install && npm run dist`
4. Search existing GitHub issues
5. Create new issue with build logs

---

**Last Updated:** June 2026
