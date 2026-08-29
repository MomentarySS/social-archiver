const { app, BrowserWindow, ipcMain, dialog, shell, protocol, session, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { Readable } = require('stream');
const { createJsonLineParser } = require('./json-lines');
const { applySettingsPatch } = require('./settings-merge');
const { searchArchives, buildSearchIndex } = require('./electron-search');
const {
  getDataDir,
  getSettingsPath,
  isPortableMode,
  getDefaultOutputDir,
  getCookieTmpDir,
} = require('./app-paths');
const { collectUserStats, collectArchiveStats } = require('./electron-stats');
const { exportUserMarkdown } = require('./electron-export-md');
const { exportUserRss } = require('./electron-rss');
const { exportUserJson } = require('./electron-export-json');
const { appendUpdateLog } = require('./electron-update-log');
const { createScheduler, userScheduleKey, isUserDue } = require('./electron-scheduler');

function getDebugLogPath() {
  return path.join(getDataDir(), 'weibo-login-debug.log');
}

// ========== Debug Logging ==========
function debugLog(msg) {
  try {
    fs.appendFileSync(getDebugLogPath(), new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) { /* ignore */ }
}

// Register custom protocol scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'social-archiver',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
]);

// Disable GPU acceleration to fix crash on some Windows machines.
// Only use disableHardwareAcceleration (safe) — avoid in-process-gpu / no-sandbox
// which can bring down the main process on renderer crashes.
if (process.platform === 'win32') {
  try {
    app.disableHardwareAcceleration();
  } catch (e) {
    app.commandLine.appendSwitch('disable-gpu');
  }
  // Additional switches to prevent GPU crashes on Windows when loading heavy pages
  app.commandLine.appendSwitch('disable-features', 'WebGL,WebGL2,WebGLRenderingContext');
  app.commandLine.appendSwitch('disable-component-extensions-with-background-pages');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}

// Global error handlers — catch everything that would otherwise kill the process silently
process.on('uncaughtException', (error) => {
  debugLog('UNCAUGHT_EXCEPTION: ' + error.message + '\n' + (error.stack || ''));
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  debugLog('UNHANDLED_REJECTION: ' + (reason && reason.message ? reason.message : String(reason)));
  console.error('Unhandled rejection:', reason);
});

let mainWindow;

// Single download state (for per-user start)
let downloadProcess = null;

// Batch download queue state
let downloadQueue = [];          // Array of BatchJob objects
let currentBatchJob = null;      // { platform, userId, cookie, outputDir, concurrent, namingTemplate }
let batchProcess = null;         // active subprocess for the current batch job
let isBatchRunning = false;
let batchStopRequested = false;
let schedulerController = null;
const assetRoots = new Set();
let settingsWrite = Promise.resolve();

function rememberAssetRoot(dir) {
  if (!dir) return;
  try {
    assetRoots.add(path.resolve(dir));
  } catch (_) { /* ignore */ }
}

function readSettings() {
  try {
    const configPath = getSettingsPath();
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (isPortableMode() && !settings.output_dir) {
        settings.output_dir = getDefaultOutputDir();
      }
      return settings;
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
  const defaults = {};
  if (isPortableMode()) {
    defaults.output_dir = getDefaultOutputDir();
  }
  return defaults;
}

function writeSettingsFile(settings) {
  const configPath = getSettingsPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
}

async function saveSettingsPatch(patch) {
  const run = settingsWrite.then(() => {
    const next = applySettingsPatch(readSettings(), patch);
    writeSettingsFile(next);
    if (next.output_dir) rememberAssetRoot(next.output_dir);
    return next;
  });
  settingsWrite = run.then(() => {}, () => {});
  return run;
}

function mimeForAsset(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/mp4',
    '.webm': 'video/webm',
  }[ext] || '';
}

function localPathFromAssetUrl(requestUrl) {
  const parsed = new URL(requestUrl);
  const fromQuery = parsed.searchParams.get('path');
  if (fromQuery) {
    // searchParams.get() auto-decodes percent-encoding, so fromQuery
    // is the plain file system path (backslashes on Windows)
    return fromQuery;
  }
  let raw = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
  if (raw.toLowerCase().startsWith('local/')) raw = raw.slice(6);
  // Handle Windows absolute paths: /C:/foo → C:\foo
  if (/^\/[A-Za-z]:/.test(raw)) raw = raw.slice(1);
  // Normalize separators and .. components, keeping drive letter intact
  if (/^[A-Za-z]:/.test(raw)) {
    // Windows absolute path: normalize separators, not the drive prefix
    const drive = raw.slice(0, 2);
    const rest = path.normalize(raw.slice(2).replace(/\//g, '\\'));
    return drive + rest;
  }
  return path.normalize(raw);
}

function byteRange(size, header) {
  if (!header || !String(header).startsWith('bytes=') || size <= 0) return null;
  const spec = String(header).slice(6).split(',')[0].trim();
  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const left = spec.slice(0, dash);
  const right = spec.slice(dash + 1);
  let start;
  let end;
  if (!left) {
    const suffix = Number(right);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(left);
    end = right ? Number(right) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) return null;
  end = Math.min(Math.max(end, start), size - 1);
  return { start, end };
}

function fileResponse(filePath, request) {
  const stat = fs.statSync(filePath);
  const mime = mimeForAsset(filePath) || 'application/octet-stream';
  const etag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;
  const headers = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': etag,
    'Access-Control-Allow-Origin': '*',
  };
  if (request.headers.get('If-None-Match') === etag && !request.headers.get('Range')) {
    return new Response(null, { status: 304, headers });
  }
  const maxBuffer = 100 * 1024 * 1024;
  const data = stat.size <= maxBuffer ? fs.readFileSync(filePath) : null;
  const range = byteRange(stat.size, request.headers.get('Range'));
  if (data) {
    if (!range) {
      headers['Content-Length'] = String(data.byteLength);
      return new Response(data, { status: 200, headers });
    }
    const slice = data.subarray(range.start, range.end + 1);
    headers['Content-Length'] = String(slice.byteLength);
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${data.byteLength}`;
    return new Response(slice, { status: 206, headers });
  }
  if (!range) {
    headers['Content-Length'] = String(stat.size);
    return new Response(Readable.toWeb(fs.createReadStream(filePath)), { status: 200, headers });
  }
  headers['Content-Length'] = String(range.end - range.start + 1);
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
  return new Response(
    Readable.toWeb(fs.createReadStream(filePath, { start: range.start, end: range.end })),
    { status: 206, headers },
  );
}

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

  mainWindow = new BrowserWindow(browserOptions);

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.social-archiver.app');
  }
  protocol.handle('social-archiver', (request) => {
    try {
      const filePath = localPathFromAssetUrl(request.url);
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return new Response('Not Found', { status: 404 });
      }
      if (!isAssetAllowed(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }
      return fileResponse(filePath, request);
    } catch (e) {
      debugLog('ASSET_PROTOCOL: ' + (e && e.message ? e.message : String(e)));
      return new Response('Error', { status: 500 });
    }
  });

  debugLog('App ready, creating main window');
  const startupSettings = readSettings();
  if (startupSettings.output_dir) rememberAssetRoot(startupSettings.output_dir);
  schedulerController = createScheduler({
    readSettings,
    saveSettingsPatch,
    buildScheduledJobs,
    enqueueBatchDownload: enqueueBatchDownloadInternal,
    isDownloading: async () => downloadProcess !== null || isBatchRunning,
  });
  schedulerController.start();
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
  schedulerController?.stop();
  debugLog('Will quit');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Download IPC

function isAssetAllowed(filePath) {
  if (!filePath) return false;
  const target = path.resolve(filePath);
  const roots = [];
  for (const root of assetRoots) roots.push(root);
  const settings = readSettings();
  if (settings.output_dir) roots.push(path.resolve(settings.output_dir));
  const targetCmp = process.platform === 'win32' ? target.toLowerCase() : target;
  return roots.some((root) => {
    const rootCmp = process.platform === 'win32' ? String(root).toLowerCase() : String(root);
    const prefix = rootCmp.endsWith(path.sep) ? rootCmp : rootCmp + path.sep;
    return targetCmp.startsWith(prefix);
  });
}

function writeCookieFile(cookie) {
  const dir = getCookieTmpDir();
  const file = path.join(dir, `c-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(file, cookie || '', { encoding: 'utf8', mode: 0o600 });
  return file;
}

function removeCookieFile(file) {
  if (!file) return;
  try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
}

function h264SiblingPath(mediaPath) {
  if (!mediaPath) return '';
  const ext = path.extname(mediaPath);
  const candidate = path.join(path.dirname(mediaPath), `${path.basename(mediaPath, ext)}_h264.mp4`);
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 64) return candidate;
  } catch (_) { /* ignore */ }
  return '';
}

function mapPostMediaPaths(userDir, pic) {
  const baseDir = pic.date_folder || '';
  const absPath = path.join(userDir, baseDir, pic.filename || '');
  const videoAbsPath = pic.video_filename
    ? path.join(userDir, baseDir, pic.video_filename)
    : '';
  const playbackAbsPath = pic.playback_filename
    ? path.join(userDir, baseDir, pic.playback_filename)
    : (pic.type === 'video' ? h264SiblingPath(absPath) : '');
  const videoPlaybackAbsPath = pic.video_playback_filename
    ? path.join(userDir, baseDir, pic.video_playback_filename)
    : (videoAbsPath ? h264SiblingPath(videoAbsPath) : '');
  const posterAbsPath = pic.poster_filename
    ? path.join(userDir, baseDir, pic.poster_filename)
    : '';
  return {
    ...pic,
    abs_path: absPath,
    video_abs_path: videoAbsPath,
    playback_abs_path: playbackAbsPath,
    video_playback_abs_path: videoPlaybackAbsPath,
    poster_abs_path: posterAbsPath,
  };
}

function isTwitterDerivativeUser(name) {
  return String(name || '').endsWith('--bookmarks') || String(name || '').endsWith('--likes');
}

function twitterDisplayName(ud, profile) {
  const platform = profile.platform || ud.platform || '';
  const base = profile.baseUserId || ud.name.replace(/--bookmarks$|--likes$/, '');
  if (ud.name.endsWith('--bookmarks')) {
    return platform ? `${platform} / ${base} (书签)` : `${base} (书签)`;
  }
  if (ud.name.endsWith('--likes')) {
    return platform ? `${platform} / ${base} (点赞)` : `${base} (点赞)`;
  }
  return platform
    ? `${platform} / ${profile.name || profile.screen_name || ud.name}`
    : (profile.name || profile.screen_name || ud.name);
}

function readTwitterFetchOptions(outputDir, userId) {
  try {
    const profilePath = path.join(outputDir, 'twitter', userId, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return {
      includeReplies: Boolean(profile.includeReplies),
      repliesMediaOnly: Boolean(profile.repliesMediaOnly),
      includeQuotes: Boolean(profile.includeQuotes),
      includeBookmarks: Boolean(profile.includeBookmarks),
      includeLikes: Boolean(profile.includeLikes),
    };
  } catch (_) {
    return {};
  }
}

function readWeiboFetchOptions(outputDir, userId) {
  try {
    const profilePath = path.join(outputDir, 'weibo', userId, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return {
      includeQuoted: Boolean(profile.includeQuoted),
    };
  } catch (_) {
    return {};
  }
}

function readInstagramFetchOptions(outputDir, userId) {
  try {
    const profilePath = path.join(outputDir, 'instagram', userId, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return {
      includeReels: Boolean(profile.includeReels),
      includeStories: Boolean(profile.includeStories),
    };
  } catch (_) {
    return {};
  }
}

function spawnBackendJob(job) {
  const settings = readSettings();
  const backendInfo = resolveBackendPath();
  const cookieFile = writeCookieFile(job.cookie);
  const args = [
    ...backendInfo.args,
    '--platform', job.platform,
    '--user-id', job.userId,
    '--cookie-file', cookieFile,
    '--output-dir', job.outputDir,
    '--concurrent', String(job.concurrent || settings.concurrent || 3),
    '--naming-template', job.namingTemplate || settings.naming_template || '{post_id}_{index}',
  ];
  if (job.startDate) args.push('--start-date', job.startDate);
  if (job.endDate) args.push('--end-date', job.endDate);
  if (job.deepBacktrack) args.push('--deep-backtrack');
  if (job.platform === 'twitter') {
    const twitterOpts = job.includeReplies !== undefined
      ? {
        includeReplies: Boolean(job.includeReplies),
        repliesMediaOnly: Boolean(job.repliesMediaOnly),
        includeQuotes: Boolean(job.includeQuotes),
        includeBookmarks: Boolean(job.includeBookmarks),
        includeLikes: Boolean(job.includeLikes),
      }
      : readTwitterFetchOptions(job.outputDir, job.userId);
    if (twitterOpts.includeReplies) args.push('--include-replies');
    if (twitterOpts.repliesMediaOnly) args.push('--replies-media-only');
    if (twitterOpts.includeQuotes) args.push('--include-quotes');
    if (twitterOpts.includeBookmarks) args.push('--include-bookmarks');
    if (twitterOpts.includeLikes) args.push('--include-likes');
  }
  if (job.platform === 'weibo') {
    const weiboOpts = job.includeQuoted !== undefined
      ? { includeQuoted: Boolean(job.includeQuoted) }
      : readWeiboFetchOptions(job.outputDir, job.userId);
    if (weiboOpts.includeQuoted) args.push('--include-quoted');
  }
  if (job.platform === 'instagram') {
    const igOpts = job.includeReels !== undefined || job.includeStories !== undefined
      ? {
        includeReels: Boolean(job.includeReels),
        includeStories: Boolean(job.includeStories),
      }
      : readInstagramFetchOptions(job.outputDir, job.userId);
    if (igOpts.includeReels) args.push('--include-reels');
    if (igOpts.includeStories) args.push('--include-stories');
  }
  rememberAssetRoot(job.outputDir);
  const proc = spawn(backendInfo.program, args, {
    cwd: backendInfo.cwd,
    windowsHide: true,
    env: backendInfo.env,
  });
  const cleanup = () => removeCookieFile(cookieFile);
  proc.on('close', cleanup);
  proc.on('error', cleanup);
  return proc;
}

// ─── Batch Download Queue ───────────────────────────────────────────

function processQueue() {
  if (batchStopRequested) {
    downloadQueue = [];
    isBatchRunning = false;
    currentBatchJob = null;
    batchProcess = null;
    batchStopRequested = false;
    mainWindow?.webContents.send('batch:done', { type: 'batch-stopped' });
    return;
  }

  if (downloadQueue.length === 0) {
    isBatchRunning = false;
    currentBatchJob = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('batch:done', { type: 'batch-done' });
      notifyDesktop('Social Archiver', '批量缓存已全部完成');
    }
    return;
  }

  isBatchRunning = true;
  const job = downloadQueue.shift();
  currentBatchJob = job;

  mainWindow?.webContents.send('batch:event', {
    type: 'user-start',
    userId: job.userId,
    platform: job.platform,
    queued: downloadQueue.length,
  });

  batchProcess = null;
  let proc;
  try {
    proc = spawnBackendJob(job);
    batchProcess = proc;
  } catch (err) {
    mainWindow?.webContents.send('batch:event', {
      type: 'user-error',
      userId: job.userId,
      platform: job.platform,
      queued: downloadQueue.length,
      msg: err.message,
    });
    currentBatchJob = null;
    batchProcess = null;
    processQueue();
    return;
  }

  const parser = createJsonLineParser(
    (evt) => {
      if (evt.type === 'done') {
        evt.userDir = path.join(job.outputDir, job.platform, job.userId);
        updateProfileLastUpdate(evt.userDir);
        logUpdate(job.outputDir, {
          platform: job.platform,
          userId: job.userId,
          success: true,
          posts: evt.posts,
          count: evt.count,
          batch: true,
        });
      }
      mainWindow?.webContents.send('batch:event', { ...evt, userId: job.userId, platform: job.platform });
    },
    (raw) => {
      mainWindow?.webContents.send('batch:event', {
        type: 'user-progress',
        userId: job.userId,
        platform: job.platform,
        msg: raw,
      });
    },
  );

  proc.stdout.on('data', (data) => parser.push(data));

  proc.stderr.on('data', (data) => {
    const msg = data.toString('utf8').trim();
    if (msg) {
      mainWindow?.webContents.send('batch:event', {
        type: 'user-progress',
        userId: job.userId,
        platform: job.platform,
        msg,
      });
    }
  });

  proc.on('close', (code) => {
    parser.flush();
    const userDir = path.join(job.outputDir, job.platform, job.userId);
    if (batchStopRequested) {
      currentBatchJob = null;
      batchProcess = null;
      processQueue();
      return;
    }
    if (code !== 0) {
      logUpdate(job.outputDir, {
        platform: job.platform,
        userId: job.userId,
        success: false,
        error: `exit ${code}`,
        batch: true,
      });
      mainWindow?.webContents.send('batch:event', {
        type: 'user-error',
        userId: job.userId,
        platform: job.platform,
        userDir,
        queued: downloadQueue.length,
        msg: `进程退出（代码 ${code}）`,
      });
    } else {
      mainWindow?.webContents.send('batch:event', {
        type: 'user-done',
        userId: job.userId,
        platform: job.platform,
        userDir,
        queued: downloadQueue.length,
      });
    }
    currentBatchJob = null;
    batchProcess = null;
    processQueue();
  });
}

function updateProfileLastUpdate(userDir) {
  try {
    const profilePath = path.join(userDir, '_profile.json');
    let profile = {};
    if (fs.existsSync(profilePath)) {
      try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (_) {}
    }
    profile.lastUpdate = new Date().toISOString();
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
  } catch (_) {}
}

function notificationsEnabled() {
  try {
    const settings = readSettings();
    return settings.notifications?.enabled !== false;
  } catch (_) {
    return true;
  }
}

function notifyDesktop(title, body) {
  if (!notificationsEnabled()) return;
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body }).show();
  } catch (_) { /* ignore */ }
}

function logUpdate(outputDir, entry) {
  if (!outputDir) return;
  appendUpdateLog(outputDir, entry);
}

ipcMain.handle('enqueue-batch-download', async (event, jobs) => {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { success: false, error: '没有要下载的用户', queued: 0 };
  }
  batchStopRequested = false;
  for (const job of jobs) {
    downloadQueue.push(job);
  }
  if (!isBatchRunning) {
    processQueue();
  }
  return { success: true, queued: downloadQueue.length };
});

ipcMain.handle('stop-batch-download', async () => {
  batchStopRequested = true;
  downloadQueue = [];
  if (batchProcess) {
    batchProcess.kill();
    batchProcess = null;
  } else {
    isBatchRunning = false;
    currentBatchJob = null;
    batchStopRequested = false;
    mainWindow?.webContents.send('batch:done', { type: 'batch-stopped' });
  }
  return {};
});

ipcMain.handle('get-batch-status', async () => {
  return {
    queued: downloadQueue.length,
    running: isBatchRunning,
    currentUserId: currentBatchJob?.userId,
    currentPlatform: currentBatchJob?.platform,
  };
});

function runBackendJsonLines(extraArgs, { cookie } = {}) {
  return new Promise((resolve, reject) => {
    const backendInfo = resolveBackendPath();
    const cookieFile = cookie != null ? writeCookieFile(cookie) : '';
    const args = [...backendInfo.args, ...extraArgs];
    if (cookieFile) args.push('--cookie-file', cookieFile);
    const proc = spawn(backendInfo.program, args, {
      cwd: backendInfo.cwd,
      windowsHide: true,
      env: backendInfo.env,
    });
    const events = [];
    const parser = createJsonLineParser(
      (parsed) => events.push(parsed),
      () => {},
    );
    proc.stdout.on('data', (data) => parser.push(data));
    proc.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim();
      if (msg) events.push({ type: 'status', msg });
    });
    proc.on('error', (err) => {
      if (cookieFile) removeCookieFile(cookieFile);
      reject(err);
    });
    proc.on('close', (code) => {
      parser.flush();
      if (cookieFile) removeCookieFile(cookieFile);
      if (code !== 0 && !events.some((e) => e.type === 'cookie-check' || e.type === 'summary' || e.type === 'error' || e.type === 'ffmpeg-probe')) {
        reject(new Error(`后端进程退出（代码 ${code}）`));
        return;
      }
      resolve(events);
    });
  });
}

// ─── Single-user download (existing) ───────────────────────────────

ipcMain.handle('start-download', async (event, { platform, userId, cookie, outputDir, startDate, endDate, concurrent, namingTemplate, deepBacktrack, includeReplies, repliesMediaOnly, includeQuotes, includeQuoted, includeReels, includeStories, includeBookmarks, includeLikes }) => {
  if (downloadProcess) {
    return { success: false, error: '已有缓存任务进行中' };
  }

  try {
    downloadProcess = spawnBackendJob({
      platform,
      userId,
      cookie,
      outputDir,
      startDate,
      endDate,
      concurrent,
      namingTemplate,
      deepBacktrack: Boolean(deepBacktrack),
      includeReplies: platform === 'twitter' ? Boolean(includeReplies) : false,
      repliesMediaOnly: platform === 'twitter' ? Boolean(repliesMediaOnly) : false,
      includeQuotes: platform === 'twitter' ? Boolean(includeQuotes) : false,
      includeBookmarks: platform === 'twitter' ? Boolean(includeBookmarks) : false,
      includeLikes: platform === 'twitter' ? Boolean(includeLikes) : false,
      includeQuoted: platform === 'weibo' ? Boolean(includeQuoted) : false,
      includeReels: platform === 'instagram' ? Boolean(includeReels) : false,
      includeStories: platform === 'instagram' ? Boolean(includeStories) : false,
    });

    const parser = createJsonLineParser(
      (parsed) => {
        if (parsed.type === 'done') {
          parsed.userDir = path.join(outputDir, platform, userId);
          updateProfileLastUpdate(parsed.userDir);
          logUpdate(outputDir, {
            platform,
            userId,
            success: true,
            posts: parsed.posts,
            count: parsed.count,
          });
          notifyDesktop('Social Archiver', `已缓存 ${platform}/${userId}：${parsed.posts || 0} 篇`);
        }
        mainWindow?.webContents.send('download:event', parsed);
      },
      (line) => {
        mainWindow?.webContents.send('download:log', { msg: line });
      },
    );

    downloadProcess.stdout.on('data', (data) => parser.push(data));

    downloadProcess.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim();
      if (msg) {
        mainWindow?.webContents.send('download:log', { msg });
      }
    });

    downloadProcess.on('close', (code) => {
      parser.flush();
      downloadProcess = null;
      if (code !== 0) {
        mainWindow?.webContents.send('download:error', { msg: `缓存进程异常退出（代码 ${code}）` });
      }
    });

    return { success: true };
  } catch (error) {
    downloadProcess = null;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-download', async () => {
  if (downloadProcess) {
    downloadProcess.kill();
    downloadProcess = null;
    return { success: true };
  }
  return { success: false, error: '没有正在进行的缓存' };
});

ipcMain.handle('is-downloading', async () => {
  return downloadProcess !== null || isBatchRunning;
});

function isPathInsideRoot(userPath, rootDir) {
  const root = path.resolve(rootDir);
  const target = path.resolve(userPath);
  const rootCmp = process.platform === 'win32' ? root.toLowerCase() : root;
  const targetCmp = process.platform === 'win32' ? target.toLowerCase() : target;
  if (targetCmp === rootCmp) return false;
  const prefix = rootCmp.endsWith(path.sep) ? rootCmp : rootCmp + path.sep;
  return targetCmp.startsWith(prefix);
}

ipcMain.handle('delete-archives', async (event, { paths, rootDir }) => {
  const results = { success: [], failed: [] };
  for (const userPath of paths) {
    try {
      if (rootDir && !isPathInsideRoot(userPath, rootDir)) {
        results.failed.push(userPath);
        continue;
      }
      if (!fs.existsSync(userPath)) {
        results.failed.push(userPath);
        continue;
      }
      fs.rmSync(userPath, { recursive: true, force: true });
      results.success.push(userPath);
    } catch (e) {
      results.failed.push(userPath);
    }
  }
  return results;
});

ipcMain.handle('get-user-last-update', async (event, userDir) => {
  try {
    const profilePath = path.join(userDir, '_profile.json');
    if (!fs.existsSync(profilePath)) return null;
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile.lastUpdate || null;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('select-output-dir', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择下载目录',
    });
    if (!result.canceled) {
      rememberAssetRoot(result.filePaths[0]);
      return result.filePaths[0];
    }
    return null;
  } catch (e) {
    return null;
  }
});

ipcMain.handle('get-settings', async () => {
  return readSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  try {
    await saveSettingsPatch(settings);
    if (settings?.scheduler) {
      schedulerController?.start();
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('search-archives', async (event, { outputDir, query, rebuild }) => {
  try {
    if (!outputDir) return { hits: [], total: 0, error: '未选择存档目录' };
    rememberAssetRoot(outputDir);
    return searchArchives(outputDir, query, { rebuild: Boolean(rebuild) });
  } catch (e) {
    return { hits: [], total: 0, error: e.message };
  }
});

ipcMain.handle('rebuild-search-index', async (event, outputDir) => {
  try {
    if (!outputDir) return { success: false, error: '未选择存档目录' };
    rememberAssetRoot(outputDir);
    const index = buildSearchIndex(outputDir);
    return { success: true, count: index.entries.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('verify-archives', async (event, { outputDir, platform, userId }) => {
  try {
    if (!outputDir) return { success: false, error: '未选择存档目录', issues: [] };
    rememberAssetRoot(outputDir);
    const args = ['--verify', '--output-dir', outputDir];
    if (platform) args.push('--platform', platform);
    if (userId) args.push('--user-id', userId);
    const events = await runBackendJsonLines(args);
    const issues = events.filter((e) => e.type === 'missing_media' || e.type === 'corrupt_media' || e.type === 'bad_json');
    const summaries = events.filter((e) => e.type === 'summary');
    const errors = events.filter((e) => e.type === 'error');
    if (errors.length) {
      return { success: false, error: errors[0].msg, issues, summaries };
    }
    return { success: true, issues, summaries, events };
  } catch (e) {
    return { success: false, error: e.message, issues: [] };
  }
});

ipcMain.handle('probe-ffmpeg', async () => {
  try {
    const events = await runBackendJsonLines(['--probe-ffmpeg']);
    const result = events.find((e) => e.type === 'ffmpeg-probe');
    if (!result) {
      const err = events.find((e) => e.type === 'error');
      return { available: false, path: '', version: '', error: err?.msg || '检测失败' };
    }
    return result;
  } catch (e) {
    return { available: false, path: '', version: '', error: e.message };
  }
});

ipcMain.handle('transcode-archives', async (event, { outputDir, platform, userId }) => {
  try {
    if (!outputDir) return { success: false, error: '未选择存档目录', summaries: [] };
    rememberAssetRoot(outputDir);
    const args = ['--transcode', '--output-dir', outputDir];
    if (platform) args.push('--platform', platform);
    if (userId) args.push('--user-id', userId);
    const events = await runBackendJsonLines(args);
    const summaries = events.filter((e) => e.type === 'summary');
    const errors = events.filter((e) => e.type === 'error');
    if (errors.length) {
      return { success: false, error: errors[0].msg, summaries, events };
    }
    const failed = summaries.some((item) => item.ok === false);
    return { success: !failed, summaries, events };
  } catch (e) {
    return { success: false, error: e.message, summaries: [] };
  }
});

ipcMain.handle('generate-posters', async (event, { outputDir, platform, userId }) => {
  try {
    if (!outputDir) return { success: false, error: '未选择存档目录', summaries: [] };
    rememberAssetRoot(outputDir);
    const args = ['--generate-posters', '--output-dir', outputDir];
    if (platform) args.push('--platform', platform);
    if (userId) args.push('--user-id', userId);
    const events = await runBackendJsonLines(args);
    const summaries = events.filter((e) => e.type === 'summary');
    const errors = events.filter((e) => e.type === 'error');
    if (errors.length) {
      return { success: false, error: errors[0].msg, summaries, events };
    }
    const failed = summaries.some((item) => item.ok === false);
    return { success: !failed, summaries, events };
  } catch (e) {
    return { success: false, error: e.message, summaries: [] };
  }
});

ipcMain.handle('check-cookie', async (event, { platform, cookie }) => {
  try {
    const args = ['--check-cookie', '--platform', platform];
    const events = await runBackendJsonLines(args, { cookie });
    const result = events.find((e) => e.type === 'cookie-check');
    if (!result) {
      const err = events.find((e) => e.type === 'error');
      return { valid: false, message: err?.msg || '预检失败' };
    }
    return { valid: Boolean(result.valid), message: result.message || '' };
  } catch (e) {
    return { valid: false, message: e.message };
  }
});

function cookieForUser(settings, platform, userId) {
  const key = `${platform}:${userId}`;
  const perUser = settings?.cookies?.per_user || {};
  return perUser[key] || settings?.cookies?.[platform] || '';
}

function hasUsableCookie(platform, cookie) {
  const value = String(cookie || '').trim();
  if (!value) return false;
  if (platform === 'weibo') return value.includes('SUB=') || (!value.includes('=') && !value.includes(';'));
  if (platform === 'twitter') return /auth_token=/i.test(value) && /ct0=/i.test(value);
  if (platform === 'instagram') return /sessionid=/i.test(value) || (!value.includes('=') && !value.includes(';'));
  return true;
}

async function buildScheduledJobs(settings) {
  const outputDir = settings?.output_dir;
  if (!outputDir || !fs.existsSync(outputDir)) return [];
  const users = await scanArchivesInternal(outputDir);
  const schedules = settings.user_schedules || {};
  const lastScheduled = settings.user_last_scheduled || {};
  const jobs = [];
  for (const user of users) {
    const platform = user.platform || 'weibo';
    if (platform === 'twitter' && isTwitterDerivativeUser(user.name)) continue;
    const key = userScheduleKey(platform, user.name);
    const schedule = schedules[key] || 'manual';
    if (!isUserDue(schedule, lastScheduled[key])) continue;
    const cookie = cookieForUser(settings, platform, user.name);
    if (!hasUsableCookie(platform, cookie)) continue;
    jobs.push({
      platform,
      userId: user.name,
      cookie,
      outputDir,
      concurrent: settings.concurrent || 3,
      namingTemplate: settings.naming_template || '{post_id}_{index}',
      ...readTwitterFetchOptions(outputDir, user.name),
      ...readWeiboFetchOptions(outputDir, user.name),
      ...readInstagramFetchOptions(outputDir, user.name),
    });
  }
  return jobs;
}

async function scanArchivesInternal(outputDir) {
  if (!outputDir || !fs.existsSync(outputDir)) return [];
  const users = [];
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const platformDirs = ['weibo', 'twitter', 'instagram'];
    const userDirs = platformDirs.includes(entry.name)
      ? fs.readdirSync(path.join(outputDir, entry.name), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({ name: d.name, dir: path.join(outputDir, entry.name, d.name), platform: entry.name }))
      : [{ name: entry.name, dir: path.join(outputDir, entry.name), platform: '' }];
    for (const ud of userDirs) {
      if (!fs.existsSync(path.join(ud.dir, '_posts'))) continue;
      users.push({ name: ud.name, path: ud.dir, platform: ud.platform });
    }
  }
  return users;
}

async function enqueueBatchDownloadInternal(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { success: false, error: '没有要下载的用户', queued: 0 };
  }
  batchStopRequested = false;
  for (const job of jobs) {
    downloadQueue.push(job);
  }
  if (!isBatchRunning) {
    processQueue();
  }
  return { success: true, queued: downloadQueue.length };
}

ipcMain.handle('get-portable-info', async () => ({
  portable: isPortableMode(),
  settingsPath: getSettingsPath(),
  dataDir: getDataDir(),
}));

ipcMain.handle('get-user-stats', async (event, userDir) => {
  try {
    if (!userDir || !fs.existsSync(userDir)) return null;
    rememberAssetRoot(userDir);
    return collectUserStats(userDir);
  } catch (_) {
    return null;
  }
});

ipcMain.handle('get-archive-stats', async (event, outputDir) => {
  try {
    if (!outputDir) return { users: [], totalPosts: 0, totalMedia: 0, totalBytes: 0, totalBytesLabel: '0 B' };
    rememberAssetRoot(outputDir);
    return collectArchiveStats(outputDir);
  } catch (_) {
    return { users: [], totalPosts: 0, totalMedia: 0, totalBytes: 0, totalBytesLabel: '0 B' };
  }
});

ipcMain.handle('export-markdown', async (event, { userDir, destDir }) => {
  try {
    if (!userDir || !fs.existsSync(userDir)) {
      return { success: false, error: '用户目录不存在' };
    }
    rememberAssetRoot(userDir);
    return exportUserMarkdown(userDir, destDir || '');
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-rss', async (event, { userDir, destPath }) => {
  try {
    if (!userDir || !fs.existsSync(userDir)) {
      return { success: false, error: '用户目录不存在' };
    }
    rememberAssetRoot(userDir);
    return exportUserRss(userDir, destPath || '');
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-json', async (event, { userDir, destPath }) => {
  try {
    if (!userDir || !fs.existsSync(userDir)) {
      return { success: false, error: '用户目录不存在' };
    }
    rememberAssetRoot(userDir);
    return exportUserJson(userDir, destPath || '');
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('repair-weibo-media', async (event, { outputDir, platform, userId }) => {
  try {
    if (!outputDir) return { success: false, error: '未选择存档目录', events: [] };
    rememberAssetRoot(outputDir);
    const args = ['--repair-weibo-media', '--output-dir', outputDir];
    if (platform) args.push('--platform', platform);
    if (userId) args.push('--user-id', userId);
    const events = await runBackendJsonLines(args);
    const errors = events.filter((e) => e.type === 'error');
    const summaries = events.filter((e) => e.type === 'summary');
    if (errors.length) {
      return { success: false, error: errors[0].msg, events, summaries };
    }
    return { success: true, events, summaries };
  } catch (e) {
    return { success: false, error: e.message, events: [], summaries: [] };
  }
});

// Browse archive IPC

ipcMain.handle('scan-archives', async (event, outputDir) => {
  try {
    if (!outputDir || !fs.existsSync(outputDir)) {
      return [];
    }
    rememberAssetRoot(outputDir);
    const users = [];
    const entries = fs.readdirSync(outputDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const platformDirs = ['weibo', 'twitter', 'instagram'];
      const userDirs = platformDirs.includes(entry.name)
        ? fs.readdirSync(path.join(outputDir, entry.name), { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => ({ name: d.name, dir: path.join(outputDir, entry.name, d.name), platform: entry.name }))
        : [{ name: entry.name, dir: path.join(outputDir, entry.name), platform: '' }];

      for (const ud of userDirs) {
        const userDir = ud.dir;
        const postsDir = path.join(userDir, '_posts');
        if (!fs.existsSync(postsDir)) continue;
        let profile = {};
        const profilePath = path.join(userDir, '_profile.json');
        if (fs.existsSync(profilePath)) {
          try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')); } catch (e) { /* ignore */ }
        }
        const avatarPath = findAvatar(userDir);
        let platform = profile.platform || ud.platform || '';
        if (!platform) {
          try {
            const dateDirs = fs.readdirSync(postsDir, { withFileTypes: true }).filter(d => d.isDirectory());
            outer: for (const dateDir of dateDirs) {
              const files = fs.readdirSync(path.join(postsDir, dateDir.name)).filter(f => f.endsWith('.json'));
              for (const file of files) {
                const meta = JSON.parse(fs.readFileSync(path.join(postsDir, dateDir.name, file), 'utf-8'));
                if (meta.platform) {
                  platform = meta.platform;
                  break outer;
                }
                if (String(meta.url || '').includes('weibo')) {
                  platform = 'weibo';
                  break outer;
                }
                if (/x\.com|twitter\.com/.test(String(meta.url || ''))) {
                  platform = 'twitter';
                  break outer;
                }
              }
            }
          } catch (e) { /* ignore */ }
        }
        const displayName = twitterDisplayName(ud, profile);
        users.push({
          name: ud.name,
          path: userDir,
          platform,
          displayName,
          avatar: fs.existsSync(avatarPath) ? avatarPath : '',
          lastUpdate: profile.lastUpdate || '',
        });
      }
    }
    return users;
  } catch (e) {
    return [];
  }
});

function findAvatar(userDir) {
  const names = ['_avatar.jpg', '_avatar.jpeg', '_avatar.png', '_avatar.webp', '_avatar.gif'];
  for (const name of names) {
    const filePath = path.join(userDir, name);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
        return filePath;
      }
    } catch (e) { /* ignore */ }
  }
  return '';
}

function isXPost(post) {
  const platform = String((post && post.platform) || '').toLowerCase();
  if (platform === 'twitter' || platform === 'x') return true;
  return /x\.com|twitter\.com/i.test(String((post && post.url) || ''));
}

function twitterSnowflakeMs(id) {
  try {
    const n = BigInt(String(id || ''));
    if (n < 2n ** 32n) return 0;
    return Number((n >> 22n) + 1288834974657n);
  } catch {
    return 0;
  }
}

function hasClockTime(raw) {
  return /^\d{10,13}$/.test(raw) || /T\d{2}:/.test(raw) || /\d{2}:\d{2}(:\d{2})?/.test(raw);
}

function postTimeMs(post) {
  const created = String((post && post.created_at) || '').trim();
  const dated = String((post && post.date) || '').trim();
  let parsed = parseTimestamp(created);
  if (!parsed) parsed = parseTimestamp(dated);
  if (isXPost(post) && !hasClockTime(created) && !hasClockTime(dated)) {
    const flake = twitterSnowflakeMs(post.id);
    if (flake) return flake;
  }
  return parsed;
}

function parseTimestamp(raw) {
  if (!raw) return 0;
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  const weibo = raw.match(
    /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})\s+(\d{4})$/,
  );
  if (weibo) {
    const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const mon = months[weibo[1]];
    if (mon == null) return 0;
    const offset = weibo[6];
    const sign = offset[0] === '-' ? -1 : 1;
    const tzMin = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5)));
    const utc = Date.UTC(
      Number(weibo[7]), mon, Number(weibo[2]),
      Number(weibo[3]), Number(weibo[4]), Number(weibo[5]),
    ) - tzMin * 60000;
    return Number.isNaN(utc) ? 0 : utc;
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  const day = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day) {
    const t = Date.parse(`${day[1]}T00:00:00`);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function loadPostsFromUserDir(userDir) {
  if (!userDir || !fs.existsSync(userDir)) return [];
  rememberAssetRoot(userDir);
  const posts = [];
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return [];

  let profile = {};
  const profilePath = path.join(userDir, '_profile.json');
  if (fs.existsSync(profilePath)) {
    try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) || {}; } catch (e) { /* ignore */ }
  }
  const avatarPath = findAvatar(userDir);
  const hasAvatar = Boolean(avatarPath);
  const fallbackId = path.basename(userDir);

  const dates = fs.readdirSync(postsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dateEntry of dates) {
    const dateDir = path.join(postsRoot, dateEntry.name);
    const files = fs.readdirSync(dateDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dateDir, file), 'utf-8');
        const meta = JSON.parse(content);
        if (meta.pics && Array.isArray(meta.pics)) {
          meta.pics = meta.pics.map((pic) => mapPostMediaPaths(userDir, pic));
        }
        meta.user_name = meta.user_name || profile.name || profile.screen_name || fallbackId;
        meta.screen_name = meta.screen_name || profile.screen_name || fallbackId;
        if (profile.verified) meta.verified = true;
        if (hasAvatar) meta.avatar_path = avatarPath;
        meta._archiveUserDir = userDir;
        meta._archiveUserLabel = profile.name || profile.screen_name || fallbackId;
        posts.push(meta);
      } catch (e) {
        // skip unreadable metadata
      }
    }
  }
  posts.sort((a, b) => {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff) return pinDiff;
    const diff = postTimeMs(b) - postTimeMs(a);
    if (diff) return diff;
    return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
  });
  return posts;
}

ipcMain.handle('get-posts', async (event, userDir) => {
  try {
    return loadPostsFromUserDir(userDir);
  } catch (e) {
    return [];
  }
});

ipcMain.handle('get-all-posts', async (event, outputDir) => {
  try {
    if (!outputDir || !fs.existsSync(outputDir)) return [];
    rememberAssetRoot(outputDir);
    const users = await scanArchivesInternal(outputDir);
    const merged = [];
    for (const user of users) {
      const batch = loadPostsFromUserDir(user.path);
      for (const post of batch) {
        post._archiveUserDir = user.path;
        post._archiveUserLabel = user.displayName || user.name;
        merged.push(post);
      }
    }
    merged.sort((a, b) => {
      const diff = postTimeMs(b) - postTimeMs(a);
      if (diff) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
    return merged;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('save-html', async (event, { userDir, html, filename }) => {
  try {
    const target = path.join(userDir, filename || 'index.html');
    fs.writeFileSync(target, html, 'utf-8');
    return { success: true, path: target };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-local-path', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return { success: false, error: '文件不存在' };
    }
    const err = await shell.openPath(filePath);
    return err ? { success: false, error: err } : { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      shell.openPath(folderPath);
      return { success: true };
    }
    return { success: false, error: '目录不存在' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('asset-url', async (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return '';
  return `social-archiver://asset/?path=${encodeURIComponent(filePath)}`;
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (url && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: '非法链接' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('weibo-login', async () => {
  return runLoginCapture({
    partition: 'persist:weibo-login',
    url: 'https://m.weibo.cn',
    domains: ['.weibo.cn', 'm.weibo.cn', '.weibo.com', 'weibo.com'],
    requiredName: 'SUB',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    crashHint: '登录页崩溃。请改用系统浏览器打开 m.weibo.cn，登录后粘贴 Cookie。',
    timeoutHint: '登录超时。请改用系统浏览器打开 m.weibo.cn，登录后粘贴 Cookie。',
    width: 420,
    height: 760,
    retries: 1,
  });
});

ipcMain.handle('twitter-login', async () => {
  return runLoginCapture({
    partition: 'persist:twitter-login',
    url: 'https://x.com/i/flow/login',
    domains: ['.x.com', 'x.com', '.twitter.com', 'twitter.com'],
    requiredName: 'auth_token',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    crashHint: 'X 登录页崩溃。请在 Edge 打开 x.com，F12 → 应用 → Cookie，复制 auth_token 和 ct0。',
    timeoutHint: '登录超时。现代 Edge/Chrome 无法被直接读取 Cookie，请在此窗口登录，或手动粘贴 auth_token。',
    width: 520,
    height: 780,
    retries: 1,
  });
});

ipcMain.handle('instagram-login', async () => {
  return runLoginCapture({
    partition: 'persist:instagram-login',
    url: 'https://www.instagram.com/accounts/login/',
    domains: ['.instagram.com', 'www.instagram.com'],
    requiredName: 'sessionid',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    crashHint: 'Instagram 登录页崩溃。请打开 instagram.com，F12 → 应用 → Cookie，复制 sessionid。',
    timeoutHint: '登录超时。现代 Edge/Chrome 无法被直接读取 Cookie，请在此窗口登录，或手动粘贴 sessionid。',
    width: 420,
    height: 760,
    retries: 1,
  });
});

async function runLoginCapture(opts) {
  debugLog('login-capture start ' + opts.url);
  try {
    const result = await startCookieLogin(opts);
    if (result && result.cookie) {
      return { success: true, cookie: result.cookie };
    }
    return { success: false, error: (result && result.error) || opts.timeoutHint };
  } catch (e) {
    debugLog('login-capture exception: ' + (e.message || String(e)));
    return { success: false, error: '登录过程出错: ' + (e.message || String(e)) };
  }
}

async function collectCookies(ses, domains) {
  const buckets = await Promise.all(domains.map((domain) => ses.cookies.get({ domain })));
  const byName = new Map();
  for (const cookie of buckets.flat()) {
    if (cookie && cookie.name && cookie.value) {
      byName.set(cookie.name, cookie.value);
    }
  }
  return byName;
}

function cookieMapToString(byName) {
  return Array.from(byName.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function startCookieLogin(opts) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { cookie: null, error: '主窗口不可用' };
  }

  const maxAttempts = 1 + (opts.retries || 0);
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      debugLog('login-capture retry ' + attempt + '/' + maxAttempts);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    lastResult = await tryCookieLogin(opts);
    if (lastResult && lastResult.cookie) {
      debugLog('login-capture success on attempt ' + attempt);
      return lastResult;
    }

    const isRetryable =
      (lastResult && lastResult.retryable) ||
      (lastResult && lastResult.error && /崩溃|加载失败|render-process-gone|did-fail-load/.test(lastResult.error));

    if (!isRetryable || attempt === maxAttempts) {
      debugLog('login-capture failed on attempt ' + attempt + ': ' + (lastResult && lastResult.error));
      return lastResult;
    }

    debugLog('login-capture will retry after attempt ' + attempt);
  }

  return lastResult || { cookie: null, error: opts.timeoutHint };
}

async function tryCookieLogin(opts) {
  const base = String(opts.partition || 'login').replace(/^persist:/, '');
  const partitionName = `${base}-${Date.now()}`;
  const loginSession = session.fromPartition(partitionName);
  const loginWindow = new BrowserWindow({
    width: opts.width || 480,
    height: opts.height || 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: partitionName,
      webgl: false,
      backgroundThrottling: false,
    },
  });

  debugLog('Login window created, id=' + loginWindow.id);

  let outerResolve = null;
  const outerPromise = new Promise((r) => { outerResolve = r; });
  let timeoutHandle = null;
  let intervalHandle = null;
  let resolved = false;

  const cleanup = () => {
    if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  };

  const resolveWith = (cookie, error, retryable = false) => {
    debugLog('resolveWith called, cookie=' + (cookie ? 'yes' : 'no') + ' error=' + (error || '') + ' retryable=' + retryable);
    if (resolved) return { cookie, error, retryable };
    resolved = true;
    cleanup();
    try {
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    } catch (e) { debugLog('close error: ' + e.message); }
    const result = { cookie: cookie || null, error: cookie ? null : (error || '登录已取消或超时'), retryable };
    if (outerResolve) { outerResolve(result); }
    return result;
  };

  loginWindow.webContents.on('render-process-gone', (_e, details) => {
    debugLog('render-process-gone: ' + JSON.stringify(details));
    resolveWith(null, opts.crashHint, true);
  });

  loginWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    debugLog('did-fail-load: ' + errorCode + ' ' + errorDescription + ' ' + validatedURL);
    if (!isMainFrame || errorCode === -3) return;
    const reason = '登录页加载失败（' + errorDescription + '）。请检查网络，或改为手动粘贴 Cookie。';
    resolveWith(null, reason, true);
  });

  loginWindow.on('closed', () => {
    resolveWith(null, '登录已取消');
  });

  try {
    if (opts.userAgent) {
      loginWindow.webContents.setUserAgent(opts.userAgent);
    }
    loginWindow.show();
    try {
      await loginWindow.loadURL(opts.url);
    } catch (e) {
      return resolveWith(null, '无法打开登录页：' + e.message, true);
    }

    timeoutHandle = setTimeout(() => {
      resolveWith(null, opts.timeoutHint);
    }, 300000);

    intervalHandle = setInterval(async () => {
      try {
        if (resolved) return;
        if (!loginWindow || loginWindow.isDestroyed()) {
          resolveWith(null, '登录窗口已关闭');
          return;
        }
        const byName = await collectCookies(loginSession, opts.domains);
        if (resolved) return;
        if (byName.get(opts.requiredName)) {
          resolveWith(cookieMapToString(byName), null);
        }
      } catch (e) {
        debugLog('Cookie check error: ' + e.message);
      }
    }, 1000);

    return await outerPromise;
  } catch (e) {
    return resolveWith(null, e.message || String(e), true);
  }
}

function resolveBackendPath() {
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  if (app.isPackaged) {
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    const backendDir = path.join(process.resourcesPath, 'backend');
    const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
    const exePath = path.join(backendDir, exeName);
    if (fs.existsSync(exePath)) {
      return { program: exePath, args: [], cwd: backendDir, env };
    }
    // Packaged but backend exe missing — fail clearly instead of silently
    // falling through to an invalid __dirname path inside the ASAR.
    throw new Error(`后端程序未找到: ${exePath}。请重新构建打包。`);
  }

  // Development: use python with backend/cli.py alongside electron-main.js
  const cliPath = path.join(__dirname, 'backend', 'cli.py');
  return { program: 'python', args: [cliPath], cwd: __dirname, env };
}
