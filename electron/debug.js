const fs = require('fs');
const { getDataDir } = require('../app-paths');

function getDebugLogPath() {
  return require('path').join(getDataDir(), 'weibo-login-debug.log');
}

function debugLog(msg) {
  try {
    fs.appendFileSync(getDebugLogPath(), `${new Date().toISOString()} ${msg}\n`);
  } catch (_) { /* ignore */ }
}

module.exports = { debugLog };
