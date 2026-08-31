const { ipcMain } = require('electron');
const {
  applyBrowserCookieImports,
  readInstagramSessionFromPartition,
  refreshInstagramCookie,
} = require('../cookie-sources');

function registerMaintenanceIpc({ settingsStore, backend }) {
  const { rememberAssetRoot } = settingsStore;
  const { runBackendJsonLines } = backend;

  ipcMain.handle('verify-archives', async (_event, { outputDir, platform, userId }) => {
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

  ipcMain.handle('transcode-archives', async (_event, { outputDir, platform, userId }) => {
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

  ipcMain.handle('generate-posters', async (_event, { outputDir, platform, userId }) => {
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

  ipcMain.handle('check-cookie', async (_event, { platform, cookie }) => {
    try {
      const args = ['--check-cookie', '--platform', platform];
      const events = await runBackendJsonLines(args, { cookie, platform });
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

  ipcMain.handle('import-browser-cookies', async (_event, { browser = 'edge', platform } = {}) => {
    try {
      const args = ['--import-browser-cookies', '--browser', browser];
      if (platform) args.push('--platform', platform);
      const events = await runBackendJsonLines(args, { platform: platform || 'instagram' });
      const imports = events
        .filter((e) => e.type === 'browser-cookie-import')
        .map((e) => ({
          platform: e.platform,
          cookie: e.cookie || '',
          valid: Boolean(e.valid),
          message: e.message || '',
        }));
      const err = events.find((e) => e.type === 'error');
      if (!imports.length && err) {
        return { success: false, error: err.msg, browser, imports: [] };
      }
      await applyBrowserCookieImports(settingsStore, imports.filter((item) => item.cookie));
      return { success: true, browser, imports };
    } catch (e) {
      return { success: false, error: e.message, browser, imports: [] };
    }
  });

  ipcMain.handle('refresh-instagram-session', async (_event, { userId } = {}) => {
    try {
      return await refreshInstagramCookie(settingsStore, userId || '');
    } catch (e) {
      return { refreshed: false, cookie: '', message: e.message };
    }
  });

  ipcMain.handle('read-instagram-session-partition', async () => readInstagramSessionFromPartition());
}

module.exports = { registerMaintenanceIpc };
