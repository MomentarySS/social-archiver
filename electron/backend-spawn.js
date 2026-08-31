const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app } = require('electron');
const { createJsonLineParser } = require('../json-lines');
const { getCookieTmpDir } = require('../app-paths');

function createBackendSpawn(settingsStore) {
  const { readSettings, rememberAssetRoot } = settingsStore;

  function stripProxyEnv(env) {
    const next = { ...env };
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy']) {
      delete next[key];
    }
    return next;
  }

  function applyProxyEnv(env) {
    const proxyUrl = settingsStore.getProxyUrl();
    if (!proxyUrl) return env;
    return {
      ...env,
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      ALL_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
    };
  }

  function buildBackendEnv(platform) {
    let env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
    if (app.isPackaged) {
      delete env.PYTHONHOME;
      delete env.PYTHONPATH;
    }
    if (platform === 'weibo') {
      return stripProxyEnv(env);
    }
    return applyProxyEnv(env);
  }

  function resolveBackendPath(platform) {
    const env = buildBackendEnv(platform);
    if (app.isPackaged) {
      delete env.PYTHONHOME;
      delete env.PYTHONPATH;
      const backendDir = path.join(process.resourcesPath, 'backend');
      const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
      const exePath = path.join(backendDir, exeName);
      if (fs.existsSync(exePath)) {
        return { program: exePath, args: [], cwd: backendDir, env };
      }
      throw new Error(`后端程序未找到: ${exePath}。请重新构建打包。`);
    }
    const cliPath = path.join(__dirname, '..', 'backend', 'cli.py');
    return { program: 'python', args: [cliPath], cwd: path.join(__dirname, '..'), env };
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
      return { includeQuoted: Boolean(profile.includeQuoted) };
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

  function clampConcurrent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.min(5, Math.max(1, Math.round(n)));
  }

  function spawnBackendJob(job) {
    const settings = readSettings();
    const backendInfo = resolveBackendPath(job.platform);
    const cookieFile = writeCookieFile(job.cookie);
    const concurrent = clampConcurrent(job.concurrent || settings.concurrent || 3);
    const args = [
      ...backendInfo.args,
      '--platform', job.platform,
      '--user-id', job.userId,
      '--cookie-file', cookieFile,
      '--output-dir', job.outputDir,
      '--concurrent', String(concurrent),
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

  function runBackendJsonLines(extraArgs, { cookie, platform } = {}) {
    return new Promise((resolve, reject) => {
      const backendInfo = resolveBackendPath(platform);
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

  return {
    buildBackendEnv,
    resolveBackendPath,
    spawnBackendJob,
    runBackendJsonLines,
    clampConcurrent,
    readTwitterFetchOptions,
    readWeiboFetchOptions,
    readInstagramFetchOptions,
  };
}

module.exports = { createBackendSpawn };
