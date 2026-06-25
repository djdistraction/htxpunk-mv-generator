const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
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

// Start backend
function startBackend(config) {
  return new Promise((resolve, reject) => {
    try {
      const backendPath = path.join(__dirname, '..', 'backend');
      const pythonScript = path.join(backendPath, 'main.py');

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

      // Spawn uvicorn process
      backendProcess = spawn('py', ['-m', 'uvicorn', 'main:app', '--port', config.backendPort, '--host', '127.0.0.1'], {
        cwd: backendPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let backendStarted = false;

      backendProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Backend]', output);
        if (output.includes('Uvicorn running on') || output.includes('Chimera Tower online')) {
          if (!backendStarted) {
            backendStarted = true;
            resolve(true);
          }
        }
      });

      backendProcess.stderr.on('data', (data) => {
        console.error('[Backend]', data.toString());
      });

      backendProcess.on('error', (err) => {
        reject(new Error(`Failed to start backend: ${err.message}`));
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!backendStarted) {
          reject(new Error('Backend startup timeout'));
        }
      }, 30000);
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
    icon: path.join(__dirname, 'assets', 'icon.png'),
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
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

    // Create tray
    const trayIcon = path.join(__dirname, 'assets', 'tray-icon.png');
    tray = new Tray(trayIcon);
    const contextMenu = createTrayMenu(config);
    tray.setContextMenu(contextMenu);
    tray.setTitle('HTXpunk MV');
    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
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
