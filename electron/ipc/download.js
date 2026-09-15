const path = require('path');
const fs = require('fs');
const { ipcMain, BrowserWindow, session } = require('electron');
const { createJsonLineParser } = require('../../json-lines');
const { scanArchives, isTwitterDerivativeUser } = require('../../electron-archives');
const { userScheduleKey, isUserDue } = require('../../electron-scheduler');
const { debugLog } = require('../debug');
const { refreshInstagramCookie, readInstagramSessionFromPartition } = require('../cookie-sources');
const { hasUsableCookie, extractCookieValue } = require('../cookie-rules');

function createDownloadIpc(ctx, settingsStore, backend, notify) {
  const { readSettings, persistJobCookie } = settingsStore;
  const { getDataDir } = settingsStore;
  const { spawnBackendJob, clampConcurrent, readTwitterFetchOptions, readWeiboFetchOptions, readInstagramFetchOptions } = backend;
  const { notifyDesktop, logUpdate, updateProfileLastUpdate } = notify;

  function getBatchRetrySettings() {
    const settings = readSettings().batch_retry || {};
    return {
      enabled: settings.enabled !== false,
      maxAttempts: Math.min(5, Math.max(1, Number(settings.max_attempts) || 3)),
      baseDelayMs: Math.max(1000, Number(settings.base_delay_ms) || 5000),
    };
  }

  function clearBatchRetryTimers() {
    for (const timer of ctx.batchRetryTimers) clearTimeout(timer);
    ctx.batchRetryTimers = [];
  }

  function pendingBatchPath() {
    return path.join(getDataDir(), 'pending-batch.json');
  }

  function persistPendingBatch() {
    const jobs = [];
    if (ctx.currentBatchJob) jobs.push({ ...ctx.currentBatchJob, _resumeActive: true });
    jobs.push(...ctx.downloadQueue);
    const target = pendingBatchPath();
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!jobs.length) {
        try { fs.unlinkSync(target); } catch (_) { /* already clear */ }
        return;
      }
      const temp = `${target}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), jobs }, null, 2), 'utf8');
      fs.renameSync(temp, target);
    } catch (error) {
      debugLog(`保存批量任务快照失败: ${error.message}`);
    }
  }

  function restorePendingBatch() {
    const target = pendingBatchPath();
    try {
      if (!fs.existsSync(target)) return { restored: 0 };
      const payload = JSON.parse(fs.readFileSync(target, 'utf8')) || {};
      const jobs = Array.isArray(payload.jobs) ? payload.jobs.filter((job) => (
        job && job.platform && job.userId && job.outputDir
      )).map((job) => {
        const next = { ...job };
        delete next._resumeActive;
        return next;
      }) : [];
      if (!jobs.length) {
        try { fs.unlinkSync(target); } catch (_) { /* ignore */ }
        return { restored: 0 };
      }
      ctx.downloadQueue.push(...jobs);
      persistPendingBatch();
      processQueue();
      return { restored: jobs.length };
    } catch (error) {
      debugLog(`恢复批量任务快照失败: ${error.message}`);
      return { restored: 0, error: error.message };
    }
  }

  async function resolveInstagramJobCookie(job) {
    if (job.platform !== 'instagram') {
      return { cookie: job.cookie, refreshed: false, message: '' };
    }
    const current = String(job.cookie || '').trim();
    const cacheIsUsable = hasUsableCookie('instagram', current);

    if (cacheIsUsable && ctx.cookieValidation?.isFresh('instagram', job.userId, current)) {
      return { cookie: current, refreshed: false, message: '' };
    }

    const partition = await readInstagramSessionFromPartition();
    const partitionSid = partition.success ? extractCookieValue(partition.cookie, 'sessionid') : '';
    const currentSid = extractCookieValue(current, 'sessionid');

    if (partitionSid && currentSid && partitionSid === currentSid) {
      if (cacheIsUsable) {
        ctx.cookieValidation?.markValid('instagram', job.userId, current);
        return { cookie: current, refreshed: false, message: '' };
      }
    }

    if (!cacheIsUsable) {
      if (partitionSid) {
        ctx.cookieValidation?.markValid('instagram', job.userId, partition.cookie);
        const refreshed = await refreshInstagramCookie(settingsStore, job.userId);
        if (refreshed.refreshed && refreshed.cookie) {
          return {
            cookie: refreshed.cookie,
            refreshed: true,
            message: refreshed.message || '已从应用内登录分区写入 Instagram sessionid',
          };
        }
      }
      return { cookie: current, refreshed: false, message: 'Instagram Cookie 已失效或为空，请重新登录' };
    }

    if (cacheIsUsable) {
      ctx.cookieValidation?.markValid('instagram', job.userId, current);
      return { cookie: current, refreshed: false, message: '' };
    }

    return { cookie: current, refreshed: false, message: '' };
  }

  function notifyInstagramCookieRefresh(message) {
    if (!message) return;
    ctx.mainWindow?.webContents.send('download:log', { msg: message });
  }

  function createDownloadHeartbeat(send) {
    let lastOutputAt = Date.now();
    const timer = setInterval(() => {
      const idleSeconds = Math.floor((Date.now() - lastOutputAt) / 1000);
      if (idleSeconds >= 30) {
        send(`下载仍在进行，已 ${idleSeconds} 秒没有新进度。平台可能正在限流或重试，请继续等待。`);
      }
    }, 30_000);
    return {
      touch: () => { lastOutputAt = Date.now(); },
      stop: () => clearInterval(timer),
    };
  }

  function scheduleBatchRetry(job, message, userDir) {
    const retryCount = Number(job._retryCount) || 0;
    const { enabled, maxAttempts, baseDelayMs } = getBatchRetrySettings();
    if (!enabled || retryCount >= maxAttempts || ctx.batchStopRequested) {
      return false;
    }
    const attempt = retryCount + 1;
    const delayMs = baseDelayMs * (2 ** retryCount);
    ctx.mainWindow?.webContents.send('batch:event', {
      type: 'user-retry-scheduled',
      userId: job.userId,
      platform: job.platform,
      userDir,
      queued: ctx.downloadQueue.length,
      attempt,
      maxAttempts,
      delayMs,
      msg: message,
    });
    const timer = setTimeout(() => {
      ctx.batchRetryTimers = ctx.batchRetryTimers.filter((item) => item !== timer);
      if (ctx.batchStopRequested) return;
      ctx.downloadQueue.push({ ...job, _retryCount: attempt });
      if (!ctx.isBatchRunning) processQueue();
    }, delayMs);
    ctx.batchRetryTimers.push(timer);
    return true;
  }

  function processQueue() {
    if (ctx.batchStopRequested) {
      ctx.downloadQueue = [];
      ctx.isBatchRunning = false;
      ctx.currentBatchJob = null;
      ctx.batchProcess = null;
      ctx.batchStopRequested = false;
      persistPendingBatch();
      ctx.mainWindow?.webContents.send('batch:done', { type: 'batch-stopped' });
      return;
    }

    if (ctx.downloadQueue.length === 0) {
      ctx.isBatchRunning = false;
      ctx.currentBatchJob = null;
      persistPendingBatch();
      if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send('batch:done', { type: 'batch-done' });
        notifyDesktop('Social Archiver', '批量缓存已全部完成');
      }
      return;
    }

    ctx.isBatchRunning = true;
    const job = ctx.downloadQueue.shift();
    ctx.currentBatchJob = job;
    persistPendingBatch();

    ctx.mainWindow?.webContents.send('batch:event', {
      type: 'user-start',
      userId: job.userId,
      platform: job.platform,
      queued: ctx.downloadQueue.length,
    });

    void startBatchJob(job);
  }

  function latestJobCookie(job) {
    const settings = readSettings();
    const stored = cookieForUser(settings, job.platform, job.userId);
    return hasUsableCookie(job.platform, stored) ? stored : (job.cookie || '');
  }

  async function startBatchJob(job) {
    ctx.batchProcess = null;
    let proc;
    let sawDone = false;
    try {
      const withLatest = { ...job, cookie: latestJobCookie(job) };
      const cookieInfo = await resolveInstagramJobCookie(withLatest);
      if (cookieInfo.refreshed) {
        notifyInstagramCookieRefresh(cookieInfo.message);
      }
      proc = spawnBackendJob({ ...withLatest, cookie: cookieInfo.cookie });
      ctx.batchProcess = proc;
    } catch (err) {
      const userDir = path.join(job.outputDir, job.platform, job.userId);
      if (!scheduleBatchRetry(job, err.message, userDir)) {
        ctx.mainWindow?.webContents.send('batch:event', {
          type: 'user-error',
          userId: job.userId,
          platform: job.platform,
          queued: ctx.downloadQueue.length,
          msg: err.message,
        });
      }
      ctx.currentBatchJob = null;
      ctx.batchProcess = null;
      persistPendingBatch();
      processQueue();
      return;
    }

    const parser = createJsonLineParser(
      (evt) => {
        if (evt.cookie) {
          persistJobCookie(job.platform, job.userId, evt.cookie);
        }
        if (evt.type === 'done') {
          sawDone = true;
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
          ctx.cookieValidation?.markValid(job.platform, job.userId, job.cookie);
        }
        ctx.mainWindow?.webContents.send('batch:event', { ...evt, userId: job.userId, platform: job.platform });
      },
      (raw) => {
        ctx.mainWindow?.webContents.send('batch:event', {
          type: 'user-progress',
          userId: job.userId,
          platform: job.platform,
          msg: raw,
        });
      },
    );
    const heartbeat = createDownloadHeartbeat((msg) => {
      ctx.mainWindow?.webContents.send('batch:event', {
        type: 'user-progress', userId: job.userId, platform: job.platform, msg,
      });
    });

    proc.stdout.on('data', (data) => {
      heartbeat.touch();
      parser.push(data);
    });

    proc.stderr.on('data', (data) => {
      heartbeat.touch();
      const msg = data.toString('utf8').trim();
      if (msg) {
        ctx.mainWindow?.webContents.send('batch:event', {
          type: 'user-progress',
          userId: job.userId,
          platform: job.platform,
          msg,
        });
      }
    });

    proc.on('close', (code) => {
      heartbeat.stop();
      parser.flush();
      const userDir = path.join(job.outputDir, job.platform, job.userId);
      if (ctx.batchStopRequested) {
        ctx.currentBatchJob = null;
        ctx.batchProcess = null;
        persistPendingBatch();
        processQueue();
        return;
      }
      if (code !== 0 || !sawDone) {
        logUpdate(job.outputDir, {
          platform: job.platform,
          userId: job.userId,
          success: false,
          error: code !== 0 ? `exit ${code}` : 'exited without done event',
          batch: true,
        });
        const message = code !== 0
          ? `进程退出（代码 ${code}）`
          : '缓存进程已结束，但没有返回完成结果';
        if (!scheduleBatchRetry(job, message, userDir)) {
          ctx.mainWindow?.webContents.send('batch:event', {
            type: 'user-error',
            userId: job.userId,
            platform: job.platform,
            userDir,
            queued: ctx.downloadQueue.length,
            msg: message,
          });
        }
      } else {
        ctx.mainWindow?.webContents.send('batch:event', {
          type: 'user-done',
          userId: job.userId,
          platform: job.platform,
          userDir,
          queued: ctx.downloadQueue.length,
        });
      }
      ctx.currentBatchJob = null;
      ctx.batchProcess = null;
      persistPendingBatch();
      processQueue();
    });
  }

  async function enqueueBatchDownloadInternal(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return { success: false, error: '没有要下载的用户', queued: 0 };
    }
    ctx.batchStopRequested = false;
    for (const job of jobs) {
      ctx.downloadQueue.push(job);
    }
    persistPendingBatch();
    if (!ctx.isBatchRunning) {
      processQueue();
    }
    return { success: true, queued: ctx.downloadQueue.length };
  }

  function cookieForUser(settings, platform, userId) {
    const key = `${platform}:${userId}`;
    const perUser = settings?.cookies?.per_user || {};
    return perUser[key] || settings?.cookies?.[platform] || '';
  }

  async function buildScheduledJobs(settings) {
    const outputDir = settings?.output_dir;
    if (!outputDir || !fs.existsSync(outputDir)) return [];
    const users = scanArchives(outputDir, { brief: true });
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
        concurrent: clampConcurrent(settings.concurrent || 3),
        namingTemplate: settings.naming_template || '{post_id}_{index}',
        ...readTwitterFetchOptions(outputDir, user.name),
        ...readWeiboFetchOptions(outputDir, user.name),
        ...readInstagramFetchOptions(outputDir, user.name),
      });
    }
    return jobs;
  }

  ipcMain.handle('enqueue-batch-download', async (_event, jobs) => enqueueBatchDownloadInternal(jobs));

  ipcMain.handle('stop-batch-download', async () => {
    ctx.batchStopRequested = true;
    ctx.downloadQueue = [];
    clearBatchRetryTimers();
    if (ctx.batchProcess) {
      ctx.batchProcess.kill();
      ctx.batchProcess = null;
    } else {
      ctx.isBatchRunning = false;
      ctx.currentBatchJob = null;
      ctx.batchStopRequested = false;
      persistPendingBatch();
      ctx.mainWindow?.webContents.send('batch:done', { type: 'batch-stopped' });
    }
    return {};
  });

  ipcMain.handle('get-batch-status', async () => ({
    queued: ctx.downloadQueue.length,
    running: ctx.isBatchRunning,
    currentUserId: ctx.currentBatchJob?.userId,
    currentPlatform: ctx.currentBatchJob?.platform,
  }));

  ipcMain.handle('start-download', async (_event, jobArgs) => {
    if (ctx.downloadProcess) {
      return { success: false, error: '已有缓存任务进行中' };
    }
    const {
      platform, userId, cookie, outputDir, startDate, endDate, concurrent, namingTemplate,
      deepBacktrack, includeReplies, repliesMediaOnly, includeQuotes, includeQuoted,
      includeReels, includeStories, includeBookmarks, includeLikes,
    } = jobArgs;

    try {
      let sawDone = false;
      const cookieInfo = await resolveInstagramJobCookie({ platform, userId, cookie });
      if (cookieInfo.refreshed) {
        notifyInstagramCookieRefresh(cookieInfo.message);
      }
      ctx.downloadProcess = spawnBackendJob({
        platform,
        userId,
        cookie: cookieInfo.cookie,
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
          if (parsed.cookie) {
            persistJobCookie(platform, userId, parsed.cookie);
          }
          if (parsed.type === 'done') {
            sawDone = true;
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
            ctx.cookieValidation?.markValid(platform, userId, cookie);
          }
          ctx.mainWindow?.webContents.send('download:event', parsed);
        },
        (line) => {
          ctx.mainWindow?.webContents.send('download:log', { msg: line });
        },
      );
      const heartbeat = createDownloadHeartbeat((msg) => {
        ctx.mainWindow?.webContents.send('download:log', { msg });
      });

      ctx.downloadProcess.stdout.on('data', (data) => {
        heartbeat.touch();
        parser.push(data);
      });

      ctx.downloadProcess.stderr.on('data', (data) => {
        heartbeat.touch();
        const msg = data.toString('utf8').trim();
        if (msg) {
          ctx.mainWindow?.webContents.send('download:log', { msg });
        }
      });

      ctx.downloadProcess.on('close', (code) => {
        heartbeat.stop();
        parser.flush();
        ctx.downloadProcess = null;
        if (code !== 0 || !sawDone) {
          const msg = code !== 0
            ? `缓存进程异常退出（代码 ${code}）`
            : '缓存进程已结束，但没有返回完成结果';
          ctx.mainWindow?.webContents.send('download:error', { msg });
        }
      });

      return { success: true };
    } catch (error) {
      ctx.downloadProcess = null;
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-download', async () => {
    if (ctx.downloadProcess) {
      ctx.downloadProcess.kill();
      ctx.downloadProcess = null;
      return { success: true };
    }
    return { success: false, error: '没有正在进行的缓存' };
  });

  ipcMain.handle('is-downloading', async () => ctx.downloadProcess !== null || ctx.isBatchRunning);

  return { buildScheduledJobs, enqueueBatchDownloadInternal, restorePendingBatch };
}

module.exports = { createDownloadIpc };
