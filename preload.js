const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  stopDownload: () => ipcRenderer.invoke('stop-download'),
  isDownloading: () => ipcRenderer.invoke('is-downloading'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Browse archive
  scanArchives: (outputDir) => ipcRenderer.invoke('scan-archives', outputDir),
  getPosts: (userDir) => ipcRenderer.invoke('get-posts', userDir),
  saveHtml: (params) => ipcRenderer.invoke('save-html', params),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openLocalPath: (filePath) => ipcRenderer.invoke('open-local-path', filePath),
  assetUrl: (filePath) => ipcRenderer.invoke('asset-url', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  weiboLogin: () => ipcRenderer.invoke('weibo-login'),
  twitterLogin: () => ipcRenderer.invoke('twitter-login'),
  instagramLogin: () => ipcRenderer.invoke('instagram-login'),

  onDownloadEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download:event', handler);
    return () => ipcRenderer.removeListener('download:event', handler);
  },
  onDownloadLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download:log', handler);
    return () => ipcRenderer.removeListener('download:log', handler);
  },
  onDownloadError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download:error', handler);
    return () => ipcRenderer.removeListener('download:error', handler);
  },
  onDownloadDone: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download:done', handler);
    return () => ipcRenderer.removeListener('download:done', handler);
  },
  onShortcut: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('shortcut:switch-tab', handler);
    return () => ipcRenderer.removeListener('shortcut:switch-tab', handler);
  },
  // Batch download
  enqueueBatchDownload: (jobs) => ipcRenderer.invoke('enqueue-batch-download', jobs),
  stopBatchDownload: () => ipcRenderer.invoke('stop-batch-download'),
  getBatchStatus: () => ipcRenderer.invoke('get-batch-status'),
  onBatchEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('batch:event', handler);
    ipcRenderer.on('batch:done', handler);
    return () => {
      ipcRenderer.removeListener('batch:event', handler);
      ipcRenderer.removeListener('batch:done', handler);
    };
  },
  // Archive management
  deleteArchives: (userPaths) => ipcRenderer.invoke('delete-archives', userPaths),
  getUserLastUpdate: (userDir) => ipcRenderer.invoke('get-user-last-update', userDir),
});
