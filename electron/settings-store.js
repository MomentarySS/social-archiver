const fs = require('fs');
const path = require('path');
const { applySettingsPatch } = require('../settings-merge');
const { hasUsableCookie } = require('./cookie-rules');
const {
  getDataDir,
  getSettingsPath,
  isPortableMode,
  getDefaultOutputDir,
} = require('../app-paths');

function createSettingsStore(ctx) {
  function rememberAssetRoot(dir) {
    if (!dir) return;
    try {
      ctx.assetRoots.add(path.resolve(dir));
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
    const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      const payload = JSON.stringify(settings, null, 2);
      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeFileSync(fd, payload, 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempPath, configPath);
    } catch (error) {
      try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
      throw error;
    }
  }

  async function saveSettingsPatch(patch) {
    const run = ctx.settingsWrite.then(() => {
      const next = applySettingsPatch(readSettings(), patch);
      writeSettingsFile(next);
      if (next.output_dir) rememberAssetRoot(next.output_dir);
      return next;
    });
    ctx.settingsWrite = run.then(() => {}, () => {});
    return run;
  }

  async function persistJobCookie(platform, userId, cookie) {
    const value = String(cookie || '').trim();
    if (!platform || !hasUsableCookie(platform, value)) return;
    try {
      await saveSettingsPatch({
        cookies: {
          [platform]: value,
          per_user: userId ? { [`${platform}:${userId}`]: value } : {},
        },
      });
    } catch (e) {
      console.error('保存任务 Cookie 失败:', e);
    }
  }

  async function persistWeiboCookieFromJob(platform, userId, cookie) {
    return persistJobCookie(platform, userId, cookie);
  }

  function getProxyUrl() {
    return String(readSettings().proxy_url || '').trim();
  }

  return {
    rememberAssetRoot,
    readSettings,
    writeSettingsFile,
    saveSettingsPatch,
    persistWeiboCookieFromJob,
    persistJobCookie,
    getProxyUrl,
    getDataDir,
    getSettingsPath,
    isPortableMode,
  };
}

module.exports = { createSettingsStore };
