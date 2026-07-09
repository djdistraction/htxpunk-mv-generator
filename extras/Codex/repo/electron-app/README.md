# HTXpunk MV Generator - Desktop Application

This directory contains the Electron-based desktop application that packages the entire system as a downloadable installer with a professional setup wizard.

## Structure

```
electron-app/
├── main.js              # Main Electron process (backend management)
├── preload.js           # Secure IPC bridge
├── setup.html           # Installation wizard UI
├── public/
│   └── index.html       # Launcher UI (shows while backend starts)
├── package.json         # Dependencies and build config
└── assets/              # Icons and resources
```

## Features

✨ **One-Click Installation**
- Single installer for Windows, macOS, and Linux
- Guided setup wizard (3 steps)
- Automatic backend discovery and startup

🔐 **Security**
- Context isolation for IPC
- Secure credential storage (saved in user home directory)
- No hardcoded API keys

🎯 **User Experience**
- Beautiful gradient UI matching the brand
- Progress tracking
- Helpful hints for getting API keys
- System tray integration
- Auto-start management

⚙️ **Backend Management**
- Automatic Python environment detection
- Backend process lifecycle management
- Graceful startup/shutdown
- Health check before showing UI

## Installation

### Prerequisites

- Node.js 16+
- npm 8+
- Python 3.11+ (for backend)
- FFmpeg (should be installed system-wide or bundled)

### Setup

```bash
cd electron-app
npm install
```

## Development

### Run in development mode

```bash
npm run dev
```

This will:
1. Start the Electron app
2. Watch for changes to main.js
3. Show dev tools
4. Hot-reload the React setup wizard

### Build installers

```bash
# All platforms
npm run dist

# Windows only
npm run dist:win

# macOS only
npm run dist:mac

# Linux only
npm run dist:linux
```

Installers will be created in `dist/` directory.

## Configuration

User configuration is stored in:
- **Windows**: `C:\Users\{username}\AppData\Roaming\htxpunk-mv-generator\`
- **macOS**: `~/Library/Application Support/htxpunk-mv-generator/`
- **Linux**: `~/.htxpunk-mv-generator/`

Files:
- `config.json` - User settings (ports, storage path, setup status)
- `.env` - Generated environment file for backend

## Build Configuration

The `electron-builder` config in `package.json` creates:

### Windows
- NSIS installer with custom wizard
- Portable .exe
- Desktop and Start Menu shortcuts

### macOS
- DMG installer
- Signed .app bundle (requires developer certificate)
- Auto-update support

### Linux
- AppImage (single file, no installation needed)
- .deb package
- .rpm package

## Bundling the Backend

The backend is bundled directly in the app directory. For production builds, you may want to:

1. Use PyInstaller to create a standalone Python runtime:
   ```bash
   pyinstaller --onefile backend/main.py
   ```

2. Or pre-compile everything:
   ```bash
   pip install -r backend/requirements.txt --target backend/vendor
   ```

3. Then update `main.js` to point to the bundled Python:
   ```javascript
   const pythonPath = path.join(__dirname, '..', 'backend', 'python.exe');
   ```

## Signing & Notarization

For macOS:
```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
npm run dist:mac
```

For Windows code signing:
```bash
export WIN_CERTIFICATE_FILE="/path/to/cert.pfx"
export WIN_CERTIFICATE_PASSWORD="password"
npm run dist:win
```

## Troubleshooting

### "Python not found" error
- Ensure Python 3.11+ is installed and in PATH
- On Windows, install Python with "Add Python to PATH" option checked
- On macOS/Linux, Python should be available as `python3`

### Backend fails to start
- Check that all Python dependencies are installed: `pip install -r ../backend/requirements.txt`
- Verify GROQ_API_KEY and HF_TOKEN are set correctly in setup wizard
- Check logs in the user's app data directory

### Installer fails to build
- Delete `dist/` directory and try again
- Ensure all dependencies are installed: `npm install`
- Check that electron-builder is properly installed

## Future Enhancements

- [ ] Auto-update mechanism
- [ ] System tray progress indicator
- [ ] Settings UI within app
- [ ] Video editor integration
- [ ] Project sharing
- [ ] Cloud sync (optional)
- [ ] CLI interface alongside GUI

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Electron Builder](https://www.electron.build/)
- [NSIS](https://nsis.sourceforge.io/)

---

**Built with ❤️ by HTXpunk Productions**
