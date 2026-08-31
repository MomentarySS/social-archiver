const path = require('path');
const { ipcMain, shell } = require('electron');
const { checkForUpdates } = require('../update-check');

function registerAppIpc(settingsStore) {
  const { readSettings } = settingsStore;
  const pkg = require(path.join(__dirname, '..', '..', 'package.json'));

  ipcMain.handle('get-app-info', async () => ({
    name: pkg.build?.productName || 'Social Archiver',
    version: pkg.version,
  }));

  ipcMain.handle('check-for-updates', async () => {
    const settings = readSettings();
    const manifestUrl = String(settings.update_manifest_url || '').trim();
    return checkForUpdates(pkg.version, manifestUrl);
  });

  ipcMain.handle('open-update-notes', async (_event, url) => {
    const target = String(url || '').trim();
    if (!target) return { success: false, error: '没有可打开的链接' };
    if (/^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return { success: true };
    }
    return { success: false, error: '仅支持 http(s) 链接' };
  });
}

module.exports = { registerAppIpc };
