const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const ctx = require('./electron/context');
const { createSettingsStore } = require('./electron/settings-store');
const { createBackendSpawn } = require('./electron/backend-spawn');
const { createNotifyHelpers } = require('./electron/notify');
const { registerProtocolSchemes, registerAssetProtocol } = require('./electron/protocol');
const { registerAllIpc } = require('./electron/ipc');
const { createScheduler } = require('./electron-scheduler');
const { debugLog } = require('./electron/debug');
const { configureDevSecurityWarnings, configureProductionCsp } = require('./electron/security');
const { CookieValidationStore } = require('./electron/cookie-validation');

configureDevSecurityWarnings(app);
registerProtocolSchemes();

if (process.platform === 'win32') {
  try {
    app.disableHardwareAcceleration();
  } catch (_) {
    app.commandLine.appendSwitch('disable-gpu');
  }
  app.commandLine.appendSwitch('disable-features', 'WebGL,WebGL2,WebGLRenderingContext');
  app.commandLine.appendSwitch('disable-component-extensions-with-background-pages');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

process.on('uncaughtException', (error) => {
  debugLog(`UNCAUGHT_EXCEPTION: ${error.message}\n${error.stack || ''}`);
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  debugLog(`UNHANDLED_REJECTION: ${reason && reason.message ? reason.message : String(reason)}`);
  console.error('Unhandled rejection:', reason);
});

const settingsStore = createSettingsStore(ctx);
const backend = createBackendSpawn(settingsStore);
const notify = createNotifyHelpers(settingsStore);
ctx.cookieValidation = new CookieValidationStore();

function createWindow() {
  const browserOptions = {
    title: 'Social Archiver',
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    width: 1000,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  };

  if (process.platform === 'win32') {
    browserOptions.webPreferences.backgroundThrottling = false;
  }

  ctx.mainWindow = new BrowserWindow(browserOptions);

  ctx.mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    debugLog(`RENDERER_FAIL_LOAD ${code} ${desc} ${url}`);
  });
  ctx.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      debugLog(`RENDERER_CONSOLE [${level}] ${message} (${sourceId}:${line})`);
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    ctx.mainWindow.loadURL('http://localhost:5173').catch((err) => {
      debugLog(`loadURL failed: ${err.message}`);
      console.error('无法加载开发服务器 http://localhost:5173 — 请先运行 npm.cmd run dev 或关闭占用 5173 的进程');
    });
    ctx.mainWindow.webContents.openDevTools();
  } else {
    ctx.mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

let downloadIpc = null;

function ensureIpc() {
  if (!downloadIpc) {
    downloadIpc = registerAllIpc({ ctx, settingsStore, backend, notify });
  }
  return downloadIpc;
}

app.whenReady().then(() => {
  configureProductionCsp(app);
  ensureIpc();
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.social-archiver.app');
  }
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  registerAssetProtocol(ctx, settingsStore.readSettings);

  debugLog('App ready, creating main window');
  const startupSettings = settingsStore.readSettings();
  if (startupSettings.output_dir) settingsStore.rememberAssetRoot(startupSettings.output_dir);

  ctx.schedulerController = createScheduler({
    readSettings: settingsStore.readSettings,
    saveSettingsPatch: settingsStore.saveSettingsPatch,
    buildScheduledJobs: downloadIpc.buildScheduledJobs,
    enqueueBatchDownload: downloadIpc.enqueueBatchDownloadInternal,
    isDownloading: async () => ctx.downloadProcess !== null || ctx.isBatchRunning,
  });
  ctx.schedulerController.start();
  createWindow();
});

app.on('window-all-closed', () => {
  debugLog('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  debugLog('Before quit');
});

app.on('will-quit', () => {
  ctx.schedulerController?.stop();
  debugLog('Will quit');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
