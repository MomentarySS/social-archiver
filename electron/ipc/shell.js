const fs = require('fs');
const { ipcMain, shell } = require('electron');

function registerShellIpc(ctx, settingsStore) {
  const { rememberAssetRoot } = settingsStore;

  ipcMain.handle('open-local-path', async (_event, filePath) => {
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

  ipcMain.handle('open-folder', async (_event, folderPath) => {
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

  ipcMain.handle('asset-url', async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return '';
    rememberAssetRoot(filePath);
    return `social-archiver://asset/?path=${encodeURIComponent(filePath)}`;
  });

  ipcMain.handle('open-external', async (_event, url) => {
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
}

module.exports = { registerShellIpc };
