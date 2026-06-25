const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
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
let backendProcess;
let frontendUrl = isDev ? 'http://localhost:3000' : 'app://react';

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
    hfToken: '',
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
HF_TOKEN=${config.hfToken}
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

// Poll the backend /health endpoint until it responds (or we time out).
// This is far more reliable than parsing uvicorn's log output, which goes
// to stderr in a format that can change between versions.
function waitForBackend(port, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/health', timeout: 2000 },
        (res) => {
          // Drain the response so the socket can be reused/closed.
          res.resume();
          if (res.statusCode === 200) {
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
        reject(
          new Error(
            'Backend did not become healthy in time. It may have failed to ' +
              'start (e.g. port already in use, or Python dependencies missing).'
          )
        );
      } else {
        setTimeout(attempt, 1000);
      }
    };

    attempt();
  });
}

// Start backend
function startBackend(config) {
  return new Promise((resolve, reject) => {
    try {
      const backendPath = path.join(__dirname, '..', 'backend');

      // Set environment variables
      const env = {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: backendPath,
        GROQ_API_KEY: config.groqApiKey,
        HF_TOKEN: config.hfToken,
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
        'py',
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

// Create window
function createWindow(config) {
  const preload = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preload,
    },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${config.backendPort}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
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
  let config = loadConfig();

  if (!config.setupComplete) {
    config = await showSetupWizard();
  }

  try {
    // Start backend
    await startBackend(config);

    // Create main window
    createWindow(config);

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
