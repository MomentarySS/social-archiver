const fs = require('fs');
const path = require('path');

const MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.mkv']);

function readProfile(userDir) {
  try {
    const profilePath = path.join(userDir, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    return JSON.parse(fs.readFileSync(profilePath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function collectUserStats(userDir) {
  const stats = {
    userDir,
    postCount: 0,
    mediaCount: 0,
    mediaBytes: 0,
    earliestDate: '',
    latestDate: '',
    lastUpdate: readProfile(userDir).lastUpdate || '',
    fetchStatus: readProfile(userDir).fetchStatus || '',
  };
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return stats;

  const dates = [];
  for (const dateEntry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateEntry.isDirectory()) continue;
    dates.push(dateEntry.name);
    const dateDir = path.join(postsRoot, dateEntry.name);
    for (const file of fs.readdirSync(dateDir)) {
      if (file.endsWith('.json')) stats.postCount += 1;
    }
  }
  dates.sort();
  if (dates.length) {
    stats.earliestDate = dates[0];
    stats.latestDate = dates[dates.length - 1];
  }

  for (const entry of fs.readdirSync(userDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_') || entry.name === 'export-md') continue;
    const mediaDir = path.join(userDir, entry.name);
    for (const file of fs.readdirSync(mediaDir)) {
      const ext = path.extname(file).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      const filePath = path.join(mediaDir, file);
      try {
        const size = fs.statSync(filePath).size;
        if (size > 0) {
          stats.mediaCount += 1;
          stats.mediaBytes += size;
        }
      } catch (_) { /* ignore */ }
    }
  }
  return stats;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function collectArchiveStats(outputDir) {
  const users = [];
  let totalPosts = 0;
  let totalMedia = 0;
  let totalBytes = 0;
  if (!outputDir || !fs.existsSync(outputDir)) {
    return { users, totalPosts, totalMedia, totalBytes, totalBytesLabel: '0 B' };
  }
  const platformDirs = ['weibo', 'twitter', 'instagram'];
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidates = platformDirs.includes(entry.name)
      ? fs.readdirSync(path.join(outputDir, entry.name), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => path.join(outputDir, entry.name, d.name))
      : [path.join(outputDir, entry.name)];
    for (const userDir of candidates) {
      if (!fs.existsSync(path.join(userDir, '_posts'))) continue;
      const stat = collectUserStats(userDir);
      users.push(stat);
      totalPosts += stat.postCount;
      totalMedia += stat.mediaCount;
      totalBytes += stat.mediaBytes;
    }
  }
  return {
    users,
    totalPosts,
    totalMedia,
    totalBytes,
    totalBytesLabel: formatBytes(totalBytes),
  };
}

module.exports = {
  collectUserStats,
  collectArchiveStats,
  formatBytes,
};
