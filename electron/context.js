module.exports = {
  mainWindow: null,
  downloadProcess: null,
  downloadQueue: [],
  currentBatchJob: null,
  batchProcess: null,
  isBatchRunning: false,
  batchStopRequested: false,
  schedulerController: null,
  assetRoots: new Set(),
  settingsWrite: Promise.resolve(),
  batchRetryTimers: [],
};
