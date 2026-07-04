const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

// Handle Squirrel events (Windows installer)
// electron-builder handles Squirrel setup automatically
if (process.platform === 'win32') {
  const squirrelEvent = process.argv[1];
  if (squirrelEvent === '--squirrel-install' ||
      squirrelEvent === '--squirrel-updated' ||
      squirrelEvent === '--squirrel-uninstall') {
    app.quit();
    return;
  }
}

let mainWindow;
let tray;
let splashWindow;
let backendProcess;
let frontendProcess;

// Embedded fallback icon (32px) so the tray never depends on a file existing.
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoUlEQVR4nGNgGOmAEZdEjdXb/9S2rOWYMIZ9TPSyHJe5GA6gleW4zGfCJ0kPRzBhE6SnI7CmAXoCFmIVNh8VwhCrtX5Hshp0MOAhMOqAUQcQnQuwAWypnlQw4CEw6oABdwBFiZCYopgQGPAQGHXAgDsA3kqld4uIgQHSSh7wEBg8DsDWaaAlgNnHhE2QXpZjOIAejkA3H2saoJUj6B3NRAEAnLAymQiraYcAAAAASUVORK5CYII=';

// Build a nativeImage from a file, falling back to the embedded icon if the
// file is missing or unreadable. Never throws.
function loadIconImage(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const img = nativeImage.createFromPath(filePath);
      if (!img.isEmpty()) return img;
    }
  } catch (e) {
    console.warn('Icon load failed, using fallback:', e.message);
  }
  return nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
}

// Paths
const appDataPath = path.join(os.homedir(), '.htxpunk-mv-generator');
const configPath = path.join(appDataPath, 'config.json');
const envPath = path.join(appDataPath, '.env');

// In dev, the repo checkout is intact, so the real backend/frontend
// directories are siblings of electron-app/. In a packaged build there is no
// such checkout — package.json's `extraResources` config copies the backend
// source and the frontend's built standalone server into resourcesPath at
// build time, so we resolve to those instead.
function getBackendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
}

function getFrontendServerPath() {
  const frontendRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend')
    : path.join(__dirname, '..', 'frontend', '.next', 'standalone');
  return path.join(frontendRoot, 'server.js');
}

// Ensure app data directory exists
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}

// Load config
function loadConfig() {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return {
    groqApiKey: '',
    cloudflareAccountId: '',
    cloudflareApiToken: '',
    storagePath: path.join(appDataPath, 'storage'),
    backendPort: 8000,
    frontendPort: 3000,
    setupComplete: false,
  };
}

// Save config
function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  generateEnvFile(config);
}

// Generate .env file
function generateEnvFile(config) {
  const envContent = `GROQ_API_KEY=${config.groqApiKey}
CLOUDFLARE_ACCOUNT_ID=${config.cloudflareAccountId || ''}
CLOUDFLARE_API_TOKEN=${config.cloudflareApiToken || ''}
IMAGE_BACKEND=cloudflare
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=${config.storagePath}
DATABASE_URL=sqlite+aiosqlite:///${path.join(config.storagePath, 'htxpunk.db')}
VIDEO_BACKEND=ffmpeg
VIDEO_FPS=25
CLIP_DURATION=5
OUTPUT_RESOLUTION=1920x1080
WHISPER_MODEL=base
`;
  fs.writeFileSync(envPath, envContent);
}

// Poll an HTTP endpoint until it responds with 2xx/3xx (or we time out).
// This is far more reliable than parsing a process's log output, which goes
// to stderr in a format that can change between versions.
function waitForHttp(port, urlPath, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: urlPath, timeout: 2000 },
        (res) => {
          // Drain the response so the socket can be reused/closed.
          res.resume();
          if (res.statusCode && res.statusCode < 400) {
            resolve(true);
          } else {
            retry();
          }
        }
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(timeoutMessage));
      } else {
        setTimeout(attempt, 1000);
      }
    };

    attempt();
  });
}

function waitForBackend(port, timeoutMs = 90000) {
  return waitForHttp(
    port,
    '/health',
    timeoutMs,
    'Backend did not become healthy in time. It may have failed to start ' +
      '(e.g. port already in use, or Python dependencies missing).'
  );
}

function waitForFrontend(port, timeoutMs = 60000) {
  return waitForHttp(
    port,
    '/',
    timeoutMs,
    'Frontend did not become ready in time. It may have failed to start ' +
      '(e.g. port already in use).'
  );
}

// Find a working Python launcher on this machine. Different Windows Python
// installs put different things on PATH: the official python.org installer's
// `py` launcher requires "Install launcher for all users" (often unchecked
// on a per-user install), while `python` is what's on PATH whenever "Add
// python.exe to PATH" was checked — which is the common case. Try both, and
// `python3` for macOS/Linux, rather than hardcoding one and crashing with a
// cryptic ENOENT when that one isn't present.
function resolvePythonCommand() {
  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    if (!result.error) return cmd;
  }
  return null;
}

// Run `pip install -r requirements.txt` once per requirements.txt content.
// A one-click installer can't assume the user has already set up a Python
// environment for this app, so we do it on first run (and again if
// requirements.txt changes, e.g. after an app update). Subsequent launches
// skip this via a hash marker in the app data folder, since re-resolving an
// already-satisfied dependency set still costs several seconds.
function ensureBackendDependencies(pythonCmd, onProgress) {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath();
    const reqPath = path.join(backendPath, 'requirements.txt');
    const markerPath = path.join(appDataPath, '.deps-installed');

    let currentHash;
    try {
      currentHash = require('crypto')
        .createHash('sha256')
        .update(fs.readFileSync(reqPath))
        .digest('hex');
    } catch (err) {
      reject(new Error(`Could not read ${reqPath}: ${err.message}`));
      return;
    }

    if (fs.existsSync(markerPath) && fs.readFileSync(markerPath, 'utf8').trim() === currentHash) {
      resolve();
      return;
    }

    if (onProgress) onProgress('Installing Python dependencies (first run only, this can take a few minutes)…');

    const pipProcess = spawn(
      pythonCmd,
      ['-m', 'pip', 'install', '--user', '--disable-pip-version-check', '-r', reqPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    pipProcess.stdout.on('data', (data) => console.log('[pip]', data.toString()));
    pipProcess.stderr.on('data', (data) => console.log('[pip]', data.toString()));

    pipProcess.on('error', (err) => {
      reject(new Error(`Failed to run pip: ${err.message}`));
    });

    pipProcess.on('exit', (code) => {
      if (code === 0) {
        fs.writeFileSync(markerPath, currentHash);
        resolve();
      } else {
        reject(new Error(
          `Installing Python dependencies failed (exit code ${code}). ` +
            'Check your internet connection, then restart the app to retry.'
        ));
      }
    });
  });
}

// Start backend
function startBackend(config, pythonCmd) {
  return new Promise((resolve, reject) => {
    try {
      const backendPath = getBackendPath();

      // Set environment variables
      const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: backendPath,
        GROQ_API_KEY: config.groqApiKey,
        CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId || '',
        CLOUDFLARE_API_TOKEN: config.cloudflareApiToken || '',
        IMAGE_BACKEND: 'cloudflare',
        STORAGE_BACKEND: 'local',
        LOCAL_STORAGE_PATH: config.storagePath,
        DATABASE_URL: `sqlite+aiosqlite:///${path.join(config.storagePath, 'htxpunk.db')}`,
      };

      // Create storage directory if it doesn't exist
      if (!fs.existsSync(config.storagePath)) {
        fs.mkdirSync(config.storagePath, { recursive: true });
      }

      // Spawn uvicorn process. We capture stdout/stderr purely for logging;
      // readiness is detected by polling /health, not by parsing this output.
      backendProcess = spawn(
        pythonCmd,
        ['-m', 'uvicorn', 'main:app', '--port', String(config.backendPort), '--host', '127.0.0.1'],
        {
          cwd: backendPath,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let exitedEarly = false;

      backendProcess.stdout.on('data', (data) => {
        console.log('[Backend]', data.toString());
      });

      backendProcess.stderr.on('data', (data) => {
        // uvicorn logs (including the "Application startup complete" line)
        // are written to stderr — this is normal, not an error.
        console.log('[Backend]', data.toString());
      });

      backendProcess.on('error', (err) => {
        exitedEarly = true;
        reject(new Error(`Failed to start backend: ${err.message}`));
      });

      backendProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          exitedEarly = true;
          reject(
            new Error(
              `Backend process exited with code ${code} before becoming ready. ` +
                'Check that port ' + config.backendPort + ' is free and that ' +
                'the Python dependencies are installed.'
            )
          );
        }
      });

      // Wait for the health endpoint to respond instead of scraping logs.
      waitForBackend(config.backendPort)
        .then(() => {
          if (!exitedEarly) resolve(true);
        })
        .catch((err) => {
          if (!exitedEarly) reject(err);
        });
    } catch (err) {
      reject(err);
    }
  });
}

// Start frontend — a self-contained Next.js "standalone" server (see
// frontend/next.config.js's `output: "standalone"` and
// scripts/build-frontend.js), run with Electron's own bundled Node via
// ELECTRON_RUN_AS_NODE so the packaged app needs no separate Node.js/npm
// install on the target machine.
function startFrontend(config) {
  return new Promise((resolve, reject) => {
    try {
      const serverPath = getFrontendServerPath();
      if (!fs.existsSync(serverPath)) {
        reject(new Error(
          `Frontend build not found at ${serverPath}. Run "npm run build:frontend" ` +
            '(or "npm run dist") in electron-app/ before packaging.'
        ));
        return;
      }

      // NEXT_PUBLIC_API_URL is only a fallback for completeness — the client
      // bundle already has it inlined at build time (frontend/lib/api.ts
      // defaults to http://localhost:8000, matching the default backendPort).
      // Changing backendPort in settings without rebuilding the frontend
      // will not repoint the UI; that's a known limitation, not a bug here.
      const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(config.frontendPort),
        HOSTNAME: '127.0.0.1',
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${config.backendPort}`,
      };

      frontendProcess = spawn(process.execPath, [serverPath], {
        cwd: path.dirname(serverPath),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let exitedEarly = false;

      frontendProcess.stdout.on('data', (data) => console.log('[Frontend]', data.toString()));
      frontendProcess.stderr.on('data', (data) => console.log('[Frontend]', data.toString()));

      frontendProcess.on('error', (err) => {
        exitedEarly = true;
        reject(new Error(`Failed to start frontend: ${err.message}`));
      });

      frontendProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          exitedEarly = true;
          reject(new Error(
            `Frontend process exited with code ${code} before becoming ready. ` +
              'Check that port ' + config.frontendPort + ' is free.'
          ));
        }
      });

      waitForFrontend(config.frontendPort)
        .then(() => {
          if (!exitedEarly) resolve(true);
        })
        .catch((err) => {
          if (!exitedEarly) reject(err);
        });
    } catch (err) {
      reject(err);
    }
  });
}

// Create window
function createWindow(config) {
  const preload = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false, // shown on ready-to-show, in sync with closing the splash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preload,
    },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL('http://localhost:3000');
  } else {
    // The backend only serves /health and /storage — the actual UI is the
    // bundled Next.js frontend, started separately by startFrontend().
    mainWindow.loadURL(`http://127.0.0.1:${config.frontendPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// Splash screen — shown while the backend/frontend processes come up, since
// that can take a few minutes on first run (installing Python dependencies)
// and would otherwise look like the app hung with no window at all.
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    center: true,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function setSplashStatus(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash-status', message);
  }
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

// Setup wizard
function showSetupWizard() {
  let setupWindow = new BrowserWindow({
    width: 600,
    height: 700,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });

  const setupFile = path.join(__dirname, 'setup.html');
  setupWindow.loadFile(setupFile);

  return new Promise((resolve) => {
    ipcMain.once('setup-complete', (event, config) => {
      saveConfig(config);
      setupWindow.close();
      resolve(config);
    });

    setupWindow.on('closed', () => {
      setupWindow = null;
      // If setup wasn't completed, quit
      app.quit();
    });
  });
}

// Tray menu
function createTrayMenu(config) {
  const template = [
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.webContents.send('open-settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Open Storage Folder',
      click: () => {
        require('electron').shell.openPath(config.storagePath);
      },
    },
    {
      label: 'View Logs',
      click: () => {
        const logsPath = path.join(appDataPath, 'logs');
        require('electron').shell.openPath(logsPath);
      },
    },
    { type: 'separator' },
    {
      label: 'About',
      click: () => {
        require('electron').dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'About HTXpunk MV Generator',
          message: 'HTXpunk Music Video Generator v1.0.0',
          detail: 'Create stunning AI-powered music videos from songs.\n\nBuilt with FastAPI, Next.js, and Remotion.',
        });
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ];

  return Menu.buildFromTemplate(template);
}

// App lifecycle
app.on('ready', async () => {
  // When launched by the run.py helper, the backend (and frontend) are already
  // running and managed externally. In that case we skip spawning our own
  // backend and skip the setup wizard (config comes from the project .env).
  const externalBackend = process.env.HTXPUNK_SKIP_BACKEND === '1';

  let config = loadConfig();

  if (!externalBackend && !config.setupComplete) {
    config = await showSetupWizard();
  }

  try {
    if (externalBackend) {
      // run.py already started (and owns) both processes.
      await waitForBackend(config.backendPort);
      await waitForFrontend(config.frontendPort);
    } else {
      // Show a splash immediately — first-run dependency installation plus
      // backend/frontend startup can take a few minutes, and with no window
      // at all that looks indistinguishable from a hang.
      createSplashWindow();

      const pythonCmd = resolvePythonCommand();
      if (!pythonCmd) {
        throw new Error(
          'Could not find Python on this system (tried python, py, python3). ' +
            'Install Python 3.11+ from python.org — check "Add python.exe to PATH" ' +
            'during setup — then restart this app.'
        );
      }

      await ensureBackendDependencies(pythonCmd, setSplashStatus);
      setSplashStatus('Starting backend…');
      await startBackend(config, pythonCmd);
      setSplashStatus('Starting frontend…');
      await startFrontend(config);
    }

    // Create main window
    createWindow(config);
    mainWindow.once('ready-to-show', () => closeSplashWindow());

    // Create tray (non-fatal: a tray failure should never crash the app)
    try {
      const trayImage = loadIconImage(path.join(__dirname, 'assets', 'tray-icon.png'));
      tray = new Tray(trayImage);
      const contextMenu = createTrayMenu(config);
      tray.setContextMenu(contextMenu);
      tray.setToolTip('HTXpunk MV Generator');
      tray.on('click', () => {
        if (mainWindow) {
          mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
      });
    } catch (trayErr) {
      console.warn('Tray icon could not be created (continuing without it):', trayErr.message);
    }
  } catch (err) {
    console.error('Startup error:', err);
    closeSplashWindow();
    require('electron').dialog.showErrorBox('Startup Error', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow(loadConfig());
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
});

// IPC Handlers
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return true;
});

ipcMain.handle('get-backend-url', () => {
  const config = loadConfig();
  return `http://127.0.0.1:${config.backendPort}`;
});

ipcMain.handle('open-storage', () => {
  const config = loadConfig();
  require('electron').shell.openPath(config.storagePath);
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});
