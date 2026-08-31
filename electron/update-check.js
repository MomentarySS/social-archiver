function parseVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .slice(0, 3)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function compareVersion(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function normalizeManifest(data) {
  if (!data || typeof data !== 'object') return null;
  const version = String(data.version || '').trim();
  if (!version) return null;
  return {
    version,
    notesUrl: String(data.notesUrl || data.notes_url || '').trim(),
    downloadUrl: String(data.zipUrl || data.download_url || data.url || '').trim(),
    releaseNotes: String(data.releaseNotes || data.release_notes || '').trim(),
  };
}

async function fetchManifest(manifestUrl, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(manifestUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const manifest = normalizeManifest(data);
    if (!manifest) {
      throw new Error('更新清单缺少 version 字段');
    }
    return manifest;
  } finally {
    clearTimeout(timer);
  }
}

async function checkForUpdates(currentVersion, manifestUrl) {
  const current = String(currentVersion || '').trim();
  if (!manifestUrl) {
    return {
      status: 'no_url',
      currentVersion: current,
      latestVersion: current,
      message: '未配置更新清单地址',
    };
  }
  try {
    const manifest = await fetchManifest(manifestUrl);
    const cmp = compareVersion(manifest.version, current);
    if (cmp > 0) {
      return {
        status: 'update_available',
        currentVersion: current,
        latestVersion: manifest.version,
        notesUrl: manifest.notesUrl,
        downloadUrl: manifest.downloadUrl,
        releaseNotes: manifest.releaseNotes,
        message: `发现新版本 ${manifest.version}`,
      };
    }
    return {
      status: 'up_to_date',
      currentVersion: current,
      latestVersion: manifest.version,
      message: '当前已是最新版本',
    };
  } catch (error) {
    return {
      status: 'error',
      currentVersion: current,
      latestVersion: current,
      message: error && error.message ? error.message : String(error),
    };
  }
}

module.exports = {
  compareVersion,
  checkForUpdates,
  normalizeManifest,
};
