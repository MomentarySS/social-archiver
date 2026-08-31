const fs = require('fs');
const { ipcMain, dialog } = require('electron');
const { searchArchives, buildSearchIndex } = require('../../electron-search');
const { getSettingsPath, getDataDir, isPortableMode } = require('../../app-paths');

function registerSettingsIpc(ctx, settingsStore) {
  const { rememberAssetRoot, readSettings, saveSettingsPatch } = settingsStore;

  ipcMain.handle('select-output-dir', async () => {
    try {
      const result = await dialog.showOpenDialog(ctx.mainWindow, {
        properties: ['openDirectory'],
        title: '选择下载目录',
      });
      if (!result.canceled) {
        rememberAssetRoot(result.filePaths[0]);
        return result.filePaths[0];
      }
      return null;
    } catch (_) {
      return null;
    }
  });

  ipcMain.handle('get-settings', async () => readSettings());

  ipcMain.handle('save-settings', async (_event, settings) => {
    try {
      await saveSettingsPatch(settings);
      if (settings?.scheduler) {
        ctx.schedulerController?.start();
      }
      return { success: true };
    } catch (e) {
      console.error('保存设置失败:', e);
      return { success: false, error: e.message || String(e) };
    }
  });

  ipcMain.handle('search-archives', async (_event, { outputDir, query, rebuild }) => {
    try {
      if (!outputDir) return { hits: [], total: 0, error: '未选择存档目录' };
      rememberAssetRoot(outputDir);
      return searchArchives(outputDir, query, { rebuild: Boolean(rebuild) });
    } catch (e) {
      return { hits: [], total: 0, error: e.message };
    }
  });

  ipcMain.handle('rebuild-search-index', async (_event, outputDir) => {
    try {
      if (!outputDir) return { success: false, error: '未选择存档目录' };
      rememberAssetRoot(outputDir);
      const index = buildSearchIndex(outputDir);
      return { success: true, count: index.entries.length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-portable-info', async () => ({
    portable: isPortableMode(),
    settingsPath: getSettingsPath(),
    dataDir: getDataDir(),
  }));
}

module.exports = { registerSettingsIpc };
