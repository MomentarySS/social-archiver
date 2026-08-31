const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const {
  scanArchives,
  loadPostsFromUserDir,
  loadAllPosts,
} = require('../../electron-archives');
const { collectUserStats, collectArchiveStats } = require('../../electron-stats');
const { exportUserMarkdown } = require('../../electron-export-md');
const { exportUserRss } = require('../../electron-rss');
const { exportUserJson } = require('../../electron-export-json');
const { isPathInsideRoot } = require('../asset-access');

function registerArchiveIpc({ settingsStore, backend }) {
  const { rememberAssetRoot } = settingsStore;
  const { runBackendJsonLines } = backend;

  ipcMain.handle('scan-archives', async (_event, outputDir) => {
    try {
      if (!outputDir || !fs.existsSync(outputDir)) return [];
      rememberAssetRoot(outputDir);
      return scanArchives(outputDir);
    } catch (_) {
      return [];
    }
  });

  ipcMain.handle('get-posts', async (_event, userDir) => {
    try {
      rememberAssetRoot(userDir);
      return loadPostsFromUserDir(userDir);
    } catch (_) {
      return [];
    }
  });

  ipcMain.handle('get-all-posts', async (_event, outputDir) => {
    try {
      if (!outputDir || !fs.existsSync(outputDir)) return [];
      rememberAssetRoot(outputDir);
      return loadAllPosts(outputDir);
    } catch (_) {
      return [];
    }
  });

  ipcMain.handle('delete-archives', async (_event, { paths, rootDir }) => {
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
      } catch (_) {
        results.failed.push(userPath);
      }
    }
    return results;
  });

  ipcMain.handle('get-user-last-update', async (_event, userDir) => {
    try {
      const profilePath = path.join(userDir, '_profile.json');
      if (!fs.existsSync(profilePath)) return null;
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      return profile.lastUpdate || null;
    } catch (_) {
      return null;
    }
  });

  ipcMain.handle('get-user-stats', async (_event, userDir) => {
    try {
      if (!userDir || !fs.existsSync(userDir)) return null;
      rememberAssetRoot(userDir);
      return collectUserStats(userDir);
    } catch (_) {
      return null;
    }
  });

  ipcMain.handle('get-archive-stats', async (_event, outputDir) => {
    try {
      if (!outputDir) return { users: [], totalPosts: 0, totalMedia: 0, totalBytes: 0, totalBytesLabel: '0 B' };
      rememberAssetRoot(outputDir);
      return collectArchiveStats(outputDir);
    } catch (_) {
      return { users: [], totalPosts: 0, totalMedia: 0, totalBytes: 0, totalBytesLabel: '0 B' };
    }
  });

  ipcMain.handle('export-markdown', async (_event, { userDir, destDir }) => {
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

  ipcMain.handle('export-rss', async (_event, { userDir, destPath }) => {
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

  ipcMain.handle('export-json', async (_event, { userDir, destPath }) => {
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

  ipcMain.handle('repair-weibo-media', async (_event, { outputDir, platform, userId }) => {
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

  ipcMain.handle('save-html', async (_event, { userDir, html, filename }) => {
    try {
      const target = path.join(userDir, filename || 'index.html');
      fs.writeFileSync(target, html, 'utf-8');
      return { success: true, path: target };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = { registerArchiveIpc };
