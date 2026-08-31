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
  getAllPosts: (outputDir) => ipcRenderer.invoke('get-all-posts', outputDir),
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
  deleteArchives: (paths, rootDir) => ipcRenderer.invoke('delete-archives', { paths, rootDir }),
  getUserLastUpdate: (userDir) => ipcRenderer.invoke('get-user-last-update', userDir),
  searchArchives: (params) => ipcRenderer.invoke('search-archives', params),
  rebuildSearchIndex: (outputDir) => ipcRenderer.invoke('rebuild-search-index', outputDir),
  verifyArchives: (params) => ipcRenderer.invoke('verify-archives', params),
  checkCookie: (params) => ipcRenderer.invoke('check-cookie', params),
  importBrowserCookies: (params) => ipcRenderer.invoke('import-browser-cookies', params || {}),
  refreshInstagramSession: (params) => ipcRenderer.invoke('refresh-instagram-session', params || {}),
  getPortableInfo: () => ipcRenderer.invoke('get-portable-info'),
  getUserStats: (userDir) => ipcRenderer.invoke('get-user-stats', userDir),
  getArchiveStats: (outputDir) => ipcRenderer.invoke('get-archive-stats', outputDir),
  exportMarkdown: (params) => ipcRenderer.invoke('export-markdown', params),
  exportRss: (params) => ipcRenderer.invoke('export-rss', params),
  exportJson: (params) => ipcRenderer.invoke('export-json', params),
  repairWeiboMedia: (params) => ipcRenderer.invoke('repair-weibo-media', params),
  probeFfmpeg: () => ipcRenderer.invoke('probe-ffmpeg'),
  transcodeArchives: (params) => ipcRenderer.invoke('transcode-archives', params),
  generatePosters: (params) => ipcRenderer.invoke('generate-posters', params),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openUpdateNotes: (url) => ipcRenderer.invoke('open-update-notes', url),
});
