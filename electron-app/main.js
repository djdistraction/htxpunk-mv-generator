const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

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

const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoUlEQVR4nGNgGOmAEZdEjdXb/9S2rOWYMIZ9TPSyHJe5GA6gleW4zGfCJ0kPRzBhE6SnI7CmAXoCFmIVNh8VwhCrtX5Hshp0MOAhMOqAUQcQnQuwAWypnlQw4CEw6oABdwBFiZCYopgQGPAQGHXAgDsA3kqld4uIgQHSSh7wEBg8DsDWaaAlgNnHhE2QXpZjOIAejkA3H2saoJUj6B3NRAEAnLAymQiraYcAAAAASUVORK5CYII=';

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

const appDataPath = path.join(os.homedir(), '.htxpunk-mv-generator');
const configPath = path.join(appDataPath, 'config.json');
const envPath = path.join(appDataPath, '.env');

function boolEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue ? 'true' : 'false';
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase()) ? 'true' : 'false';
}

function getBackendPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '..', 'backend');
}

function getFrontendServerPath() {
  const frontendRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend')
    : path.join(__dirname, '..', 'frontend', '.next', 'standalone');
  return path.join(frontendRoot, 'server.js');
}

if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true });

function loadConfig() {
  const defaults = {
    groqApiKey: '',
    cloudflareAccountId: '',
    cloudflareApiToken: '',
    storagePath: path.join(appDataPath, 'storage'),
    backendPort: 8000,
    frontendPort: 3000,
    setupComplete: false,
    videoBackend: 'ffmpeg',
    allowFallbackVideo: false,
    modalTokenId: '',
    modalTokenSecret: '',
  };
  if (!fs.existsSync(configPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (err) {
    console.warn('Could not read config.json, using defaults:', err.message);
    return defaults;
  }
}

function saveConfig(partialConfig) {
  const merged = { ...loadConfig(), ...partialConfig };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  generateEnvFile(merged);
}

function generateEnvFile(config) {
  const allowFallbackVideo = boolEnv(config.allowFallbackVideo, false);
  const envContent = `GROQ_API_KEY=${config.groqApiKey}
CLOUDFLARE_ACCOUNT_ID=${config.cloudflareAccountId || ''}
CLOUDFLARE_API_TOKEN=${config.cloudflareApiToken || ''}
IMAGE_BACKEND=cloudflare
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=${config.storagePath}
DATABASE_URL=sqlite+aiosqlite:///${path.join(config.storagePath, 'htxpunk.db')}
VIDEO_BACKEND=${config.videoBackend || 'ffmpeg'}
ALLOW_FALLBACK_VIDEO=${allowFallbackVideo}
VIDEO_FPS=25
CLIP_DURATION=5
OUTPUT_RESOLUTION=1920x1080
WHISPER_MODEL=base
LIPSYNC_ENABLED=${config.videoBackend === 'modal' ? 'true' : 'false'}
MODAL_TOKEN_ID=${config.modalTokenId || ''}
MODAL_TOKEN_SECRET=${config.modalTokenSecret || ''}
`;
  fs.writeFileSync(envPath, envContent);
}

function waitForHttp(port, urlPath, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 400) resolve(true);
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startTime > timeoutMs) reject(new Error(timeoutMessage));
      else setTimeout(attempt, 1000);
    };
    attempt();
  });
}

function waitForBackend(port, timeoutMs = 90000) {
  return waitForHttp(
    port,
    '/health',
    timeoutMs,
    'Backend did not become healthy in time. It may have failed to start (e.g. port already in use, Python dependencies missing, or invalid configuration).'
  );
}

function waitForFrontend(port, timeoutMs = 60000) {
  return waitForHttp(
    port,
    '/',
    timeoutMs,
    'Frontend did not become ready in time. It may have failed to start.'
  );
}

function resolvePythonCommand() {
  const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    if (!result.error) return cmd;
  }
  return null;
}

function pipeProcessOutput(proc, label) {
  const logsDir = path.join(appDataPath, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(logsDir, `${label}.log`), { flags: 'w' });
  let tail = '';
  const MAX_TAIL = 4000;
  const onData = (data) => {
    const text = data.toString();
    console.log(`[${label}]`, text);
    logStream.write(text);
    tail = (tail + text).slice(-MAX_TAIL);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('exit', () => logStream.end());
  return () => tail.trim();
}

function runPipInstall(pythonCmd, args, env, label, failureContext) {
  return new Promise((resolve, reject) => {
    const pipProcess = spawn(pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    const getTail = pipeProcessOutput(pipProcess, label);
    pipProcess.on('error', (err) => reject(new Error(`Failed to run pip: ${err.message}`)));
    pipProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const tail = getTail();
        reject(new Error(`${failureContext} failed (exit code ${code}).\n\n${tail ? `Last output:\n${tail}` : ''}\n\nCheck your internet connection, then restart the app to retry.`));
      }
    });
  });
}

async function ensureBackendDependencies(pythonCmd, onProgress) {
  const backendPath = getBackendPath();
  const reqPath = path.join(backendPath, 'requirements.txt');
  const aeneasReqPath = path.join(backendPath, 'requirements-aeneas.txt');
  const markerPath = path.join(appDataPath, '.deps-installed');
  let currentHash;
  try {
    const hash = require('crypto').createHash('sha256');
    hash.update(fs.readFileSync(reqPath));
    hash.update(fs.readFileSync(aeneasReqPath));
    currentHash = hash.digest('hex');
  } catch (err) {
    throw new Error(`Could not read requirements files: ${err.message}`);
  }
  if (fs.existsSync(markerPath) && fs.readFileSync(markerPath, 'utf8').trim() === currentHash) {
    return;
  }

  if (onProgress) onProgress('Installing Python dependencies (first run only, this can take a few minutes)…');
  await runPipInstall(
    pythonCmd,
    ['-m', 'pip', 'install', '--user', '--disable-pip-version-check', '-r', reqPath],
    process.env,
    'pip-install',
    'Installing Python dependencies'
  );

  // aeneas (lyric forced alignment) is installed as a separate step: its
  // setup.py needs numpy (just installed above) importable, which pip's
  // isolated build env otherwise hides — --no-build-isolation makes it see
  // the real environment instead. AENEAS_WITH_CEW=False skips its optional
  // C extension (avoids needing espeak dev headers), SETUPTOOLS_USE_DISTUTILS=stdlib
  // works around an install_layout error under current setuptools.
  await runPipInstall(
    pythonCmd,
    ['-m', 'pip', 'install', '--user', '--disable-pip-version-check', '--no-build-isolation', '-r', aeneasReqPath],
    { ...process.env, AENEAS_WITH_CEW: 'False', SETUPTOOLS_USE_DISTUTILS: 'stdlib' },
    'pip-install-aeneas',
    'Installing lyric alignment dependencies'
  );

  fs.writeFileSync(markerPath, currentHash);
}

function startBackend(config, pythonCmd) {
  return new Promise((resolve, reject) => {
    try {
      const backendPath = getBackendPath();
      const allowFallbackVideo = boolEnv(config.allowFallbackVideo, false);
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
        VIDEO_BACKEND: config.videoBackend || 'ffmpeg',
        ALLOW_FALLBACK_VIDEO: allowFallbackVideo,
        VIDEO_FPS: '25',
        CLIP_DURATION: '5',
        OUTPUT_RESOLUTION: '1920x1080',
        WHISPER_MODEL: 'base',
        LIPSYNC_ENABLED: config.videoBackend === 'modal' ? 'true' : 'false',
        MODAL_TOKEN_ID: config.modalTokenId || '',
        MODAL_TOKEN_SECRET: config.modalTokenSecret || '',
      };

      if (!fs.existsSync(config.storagePath)) fs.mkdirSync(config.storagePath, { recursive: true });

      backendProcess = spawn(
        pythonCmd,
        ['-m', 'uvicorn', 'main:app', '--port', String(config.backendPort), '--host', '127.0.0.1'],
        { cwd: backendPath, env, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let exitedEarly = false;
      const getTail = pipeProcessOutput(backendProcess, 'backend');
      backendProcess.on('error', (err) => {
        exitedEarly = true;
        reject(new Error(`Failed to start backend: ${err.message}`));
      });
      backendProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          exitedEarly = true;
          const tail = getTail();
          reject(new Error(`Backend process exited with code ${code} before becoming ready.\n\n${tail ? `Last output:\n${tail}` : `No output was captured — check ${path.join(appDataPath, 'logs', 'backend.log')}`}`));
        }
      });
      waitForBackend(config.backendPort)
        .then(() => { if (!exitedEarly) resolve(true); })
        .catch((err) => { if (!exitedEarly) reject(err); });
    } catch (err) {
      reject(err);
    }
  });
}

function startFrontend(config) {
  return new Promise((resolve, reject) => {
    try {
      const serverPath = getFrontendServerPath();
      if (!fs.existsSync(serverPath)) {
        reject(new Error(`Frontend build not found at ${serverPath}. Run "npm run build:frontend" or "npm run dist" in electron-app/ before packaging.`));
        return;
      }
      const env = {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: String(config.frontendPort),
        HOSTNAME: '127.0.0.1',
      };
      frontendProcess = spawn(process.execPath, [serverPath], {
        cwd: path.dirname(serverPath),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let exitedEarly = false;
      const getTail = pipeProcessOutput(frontendProcess, 'frontend');
      frontendProcess.on('error', (err) => {
        exitedEarly = true;
        reject(new Error(`Failed to start frontend: ${err.message}`));
      });
      frontendProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          exitedEarly = true;
          const tail = getTail();
          reject(new Error(`Frontend process exited with code ${code} before becoming ready.\n\n${tail ? `Last output:\n${tail}` : `No output was captured — check ${path.join(appDataPath, 'logs', 'frontend.log')}`}`));
        }
      });
      waitForFrontend(config.frontendPort)
        .then(() => { if (!exitedEarly) resolve(true); })
        .catch((err) => { if (!exitedEarly) reject(err); });
    } catch (err) {
      reject(err);
    }
  });
}

function createWindow(config) {
  const preload = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (isDev) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${config.frontendPort}`);
  }
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    center: true,
    frame: false,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
  return splashWindow;
}

function setSplashStatus(message) {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.webContents.send('splash-status', message);
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
}

function showSetupWizard() {
  let completed = false;
  let setupWindow = new BrowserWindow({
    width: 600,
    height: 700,
    center: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    icon: loadIconImage(path.join(__dirname, 'assets', 'icon.png')),
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  return new Promise((resolve) => {
    ipcMain.once('setup-complete', (event, config) => {
      completed = true;
      saveConfig({ ...config, allowFallbackVideo: Boolean(config.allowFallbackVideo) });
      setupWindow.close();
      resolve(loadConfig());
    });
    setupWindow.on('closed', () => {
      setupWindow = null;
      if (!completed) app.quit();
    });
  });
}

function createTrayMenu(config) {
  const template = [
    { label: 'Show', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: 'Settings', click: () => { if (mainWindow) mainWindow.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: 'Open Storage Folder', click: () => require('electron').shell.openPath(config.storagePath) },
    { label: 'View Logs', click: () => require('electron').shell.openPath(path.join(appDataPath, 'logs')) },
    { type: 'separator' },
    {
      label: 'About',
      click: () => require('electron').dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'About HTXpunk MV Generator',
        message: 'HTXpunk Music Video Generator v1.0.0',
        detail: 'Create AI-powered music videos from songs. Preview slideshow mode is explicit and disabled by default.',
      }),
    },
    { label: 'Quit', click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(template);
}

app.on('ready', async () => {
  const externalBackend = process.env.HTXPUNK_SKIP_BACKEND === '1';
  let config = loadConfig();
  const hasRequiredConfig = Boolean(config.groqApiKey && config.cloudflareAccountId && config.cloudflareApiToken);

  if (!externalBackend && (!config.setupComplete || !hasRequiredConfig)) {
    config = await showSetupWizard();
  }

  try {
    if (externalBackend) {
      await waitForBackend(config.backendPort);
      await waitForFrontend(config.frontendPort);
    } else {
      createSplashWindow();
      const pythonCmd = resolvePythonCommand();
      if (!pythonCmd) {
        throw new Error('Could not find Python on this system (tried python, py, python3). Install Python 3.11+ from python.org and restart this app.');
      }
      await ensureBackendDependencies(pythonCmd, setSplashStatus);
      setSplashStatus('Starting backend…');
      await startBackend(config, pythonCmd);
      if (!isDev) {
        setSplashStatus('Starting frontend…');
        await startFrontend(config);
      }
    }

    createWindow(config);
    mainWindow.once('ready-to-show', () => closeSplashWindow());

    try {
      tray = new Tray(loadIconImage(path.join(__dirname, 'assets', 'tray-icon.png')));
      tray.setContextMenu(createTrayMenu(config));
      tray.setToolTip('HTXpunk MV Generator');
      tray.on('click', () => { if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); });
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
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow(loadConfig());
  else mainWindow.show();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
});

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (event, config) => {
  saveConfig(config);
  return true;
});
ipcMain.handle('get-backend-url', () => `http://127.0.0.1:${loadConfig().backendPort}`);
ipcMain.handle('open-storage', () => require('electron').shell.openPath(loadConfig().storagePath));
ipcMain.handle('app-version', () => app.getVersion());
