const fs = require('fs');
const path = require('path');
const { Notification } = require('electron');
const { appendUpdateLog } = require('../electron-update-log');

function createNotifyHelpers(settingsStore) {
  function notificationsEnabled() {
    try {
      const settings = settingsStore.readSettings();
      return settings.notifications?.enabled !== false;
    } catch (_) {
      return true;
    }
  }

  function notifyDesktop(title, body) {
    if (!notificationsEnabled()) return;
    if (!Notification.isSupported()) return;
    try {
      new Notification({ title, body }).show();
    } catch (_) { /* ignore */ }
  }

  function logUpdate(outputDir, entry) {
    if (!outputDir) return;
    appendUpdateLog(outputDir, entry);
  }

  function updateProfileLastUpdate(userDir) {
    try {
      const profilePath = path.join(userDir, '_profile.json');
      let profile = {};
      if (fs.existsSync(profilePath)) {
        try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch (_) {}
      }
      profile.lastUpdate = new Date().toISOString();
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf8');
    } catch (_) {}
  }

  return { notifyDesktop, logUpdate, updateProfileLastUpdate };
}

module.exports = { createNotifyHelpers };
