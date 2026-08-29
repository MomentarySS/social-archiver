const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getAppRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return path.resolve(__dirname);
}

function isPortableMode() {
  try {
    return fs.existsSync(path.join(getAppRoot(), 'portable.flag'));
  } catch (_) {
    return false;
  }
}

function getDataDir() {
  if (isPortableMode()) {
    const dir = path.join(getAppRoot(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  return app.getPath('userData');
}

function getSettingsPath() {
  if (isPortableMode()) {
    const besideExe = path.join(getAppRoot(), 'settings.json');
    if (fs.existsSync(besideExe)) return besideExe;
    const inData = path.join(getDataDir(), 'settings.json');
    return inData;
  }
  return path.join(app.getPath('userData'), 'settings.json');
}

function getDefaultOutputDir() {
  if (!isPortableMode()) return '';
  const dir = path.join(getAppRoot(), 'archives');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getCookieTmpDir() {
  const dir = path.join(getDataDir(), 'cookie-tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  getAppRoot,
  isPortableMode,
  getDataDir,
  getSettingsPath,
  getDefaultOutputDir,
  getCookieTmpDir,
};
