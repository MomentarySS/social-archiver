const fs = require('fs');
const path = require('path');

function logPath(outputDir) {
  if (!outputDir) return '';
  return path.join(outputDir, 'update-log.jsonl');
}

function appendUpdateLog(outputDir, entry) {
  const file = logPath(outputDir);
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    });
    fs.appendFileSync(file, `${line}\n`, 'utf8');
  } catch (_) { /* ignore */ }
}

module.exports = {
  appendUpdateLog,
  logPath,
};
