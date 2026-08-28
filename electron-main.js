const { app, BrowserWindow, ipcMain, dialog, shell, protocol, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { Readable } = require('stream');
const { createJsonLineParser } = require('./json-lines');
const { applySettingsPatch } = require('./settings-merge');

// ========== Debug Logging ==========
const debugLogPath = path.join(app.getPath('userData'), 'weibo-login-debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(debugLogPath, new Date().toISOString() + ' ' + msg + '\n');
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
  debugLog('Will quit');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Download IPC

function readSettings() {
  try {
    const configPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (e) {
    console.error('加载设置失败:', e);
  }
  return {};
}

const assetRoots = new Set();
let settingsWrite = Promise.resolve();

function rememberAssetRoot(dir) {
  if (!dir) return;
  try {
    assetRoots.add(path.resolve(dir));
  } catch (_) { /* ignore */ }
}

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
  const dir = path.join(app.getPath('userData'), 'cookie-tmp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `c-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(file, cookie || '', { encoding: 'utf8', mode: 0o600 });
  return file;
}

function removeCookieFile(file) {
  if (!file) return;
  try { fs.unlinkSync(file); } catch (_) { /* ignore */ }
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

// ─── Single-user download (existing) ───────────────────────────────

ipcMain.handle('start-download', async (event, { platform, userId, cookie, outputDir, startDate, endDate, concurrent, namingTemplate }) => {
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
    });

    const parser = createJsonLineParser(
      (parsed) => {
        if (parsed.type === 'done') {
          parsed.userDir = path.join(outputDir, platform, userId);
          updateProfileLastUpdate(parsed.userDir);
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
  const run = settingsWrite.then(() => {
    const configPath = path.join(app.getPath('userData'), 'settings.json');
    const next = applySettingsPatch(readSettings(), settings);
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
    if (next.output_dir) rememberAssetRoot(next.output_dir);
    return { success: true };
  }).catch((e) => ({ success: false, error: e.message }));
  settingsWrite = run.then(() => {}, () => {});
  return run;
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
        const displayName = platform
          ? `${platform} / ${profile.name || profile.screen_name || ud.name}`
          : (profile.name || profile.screen_name || ud.name);
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

ipcMain.handle('get-posts', async (event, userDir) => {
  try {
    if (!userDir || !fs.existsSync(userDir)) {
      return [];
    }
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
      .filter(d => d.isDirectory());

    for (const dateEntry of dates) {
      const dateDir = path.join(postsRoot, dateEntry.name);
      const files = fs.readdirSync(dateDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dateDir, file), 'utf-8');
          const meta = JSON.parse(content);
          if (meta.pics && Array.isArray(meta.pics)) {
            meta.pics = meta.pics.map(pic => ({
              ...pic,
              abs_path: path.join(userDir, pic.date_folder || '', pic.filename || ''),
              video_abs_path: pic.video_filename
                ? path.join(userDir, pic.date_folder || '', pic.video_filename)
                : '',
            }));
          }
          meta.user_name = meta.user_name || profile.name || profile.screen_name || fallbackId;
          meta.screen_name = meta.screen_name || profile.screen_name || fallbackId;
          if (profile.verified) meta.verified = true;
          if (hasAvatar) meta.avatar_path = avatarPath;
          posts.push(meta);
        } catch (e) {
          // skip unreadable metadata
        }
      }
    }
    posts.sort((a, b) => {
      const diff = postTimeMs(b) - postTimeMs(a);
      if (diff) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
    return posts;
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
