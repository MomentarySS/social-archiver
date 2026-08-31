const { registerArchiveIpc } = require('./archives');
const { registerSettingsIpc } = require('./settings');
const { registerShellIpc } = require('./shell');
const { registerMaintenanceIpc } = require('./maintenance');
const { createDownloadIpc } = require('./download');
const { registerLoginIpc } = require('./login');
const { registerAppIpc } = require('./app');

function registerAllIpc(deps) {
  const { ctx, settingsStore, backend, notify } = deps;
  registerAppIpc(settingsStore);
  registerArchiveIpc({ settingsStore, backend });
  registerSettingsIpc(ctx, settingsStore);
  registerShellIpc(ctx, settingsStore);
  registerMaintenanceIpc({ settingsStore, backend });
  registerLoginIpc(ctx, settingsStore);
  return createDownloadIpc(ctx, settingsStore, backend, notify);
}

module.exports = { registerAllIpc };
