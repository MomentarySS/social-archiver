const fs = require('fs');
const path = require('path');

const INDEX_VERSION = 1;

function stripHtml(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listUserDirs(outputDir) {
  const users = [];
  if (!outputDir || !fs.existsSync(outputDir)) return users;
  const platformDirs = ['weibo', 'twitter', 'instagram'];
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (platformDirs.includes(entry.name)) {
      const platform = entry.name;
      for (const userEntry of fs.readdirSync(path.join(outputDir, entry.name), { withFileTypes: true })) {
        if (!userEntry.isDirectory()) continue;
        const userDir = path.join(outputDir, platform, userEntry.name);
        if (fs.existsSync(path.join(userDir, '_posts'))) {
          users.push({ userDir, platform, userId: userEntry.name });
        }
      }
    } else {
      const userDir = path.join(outputDir, entry.name);
      if (fs.existsSync(path.join(userDir, '_posts'))) {
        users.push({ userDir, platform: '', userId: entry.name });
      }
    }
  }
  return users;
}

function readProfile(userDir) {
  try {
    const profilePath = path.join(userDir, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    return JSON.parse(fs.readFileSync(profilePath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function collectPosts(userDir) {
  const posts = [];
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return posts;
  const profile = readProfile(userDir);
  for (const dateDir of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateDir.isDirectory()) continue;
    const dirPath = path.join(postsRoot, dateDir.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(dirPath, file);
      try {
        const stat = fs.statSync(filePath);
        const meta = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
        const text = stripHtml(meta.text || '');
        posts.push({
          userDir,
          platform: meta.platform || profile.platform || '',
          userId: profile.user_id || path.basename(userDir),
          userName: meta.user_name || profile.name || path.basename(userDir),
          postId: String(meta.id || path.basename(file, '.json')),
          text,
          created_at: meta.created_at || meta.date || dateDir.name,
          mtime: stat.mtimeMs,
        });
      } catch (_) { /* skip */ }
    }
  }
  return posts;
}

function indexPath(outputDir) {
  return path.join(outputDir, '_index', 'search-cache.json');
}

function buildSearchIndex(outputDir) {
  const users = listUserDirs(outputDir);
  const entries = [];
  const mtimes = {};
  for (const user of users) {
    const userPosts = collectPosts(user.userDir);
    for (const post of userPosts) {
      entries.push(post);
      mtimes[path.join(user.userDir, '_posts')] = Date.now();
    }
  }
  const payload = {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    outputDir,
    entries,
  };
  const dir = path.join(outputDir, '_index');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath(outputDir), JSON.stringify(payload), 'utf8');
  return payload;
}

function loadSearchIndex(outputDir, { rebuild = false } = {}) {
  const cacheFile = indexPath(outputDir);
  if (!rebuild && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.version === INDEX_VERSION && cached.outputDir === outputDir && Array.isArray(cached.entries)) {
        const users = listUserDirs(outputDir);
        let stale = cached.entries.length === 0 && users.length > 0;
        if (!stale) {
          for (const user of users) {
            const profile = readProfile(user.userDir);
            const lastUpdate = profile.lastUpdate ? Date.parse(profile.lastUpdate) : 0;
            if (lastUpdate && (!cached.builtAt || lastUpdate > Date.parse(cached.builtAt))) {
              stale = true;
              break;
            }
          }
        }
        if (!stale) return cached;
      }
    } catch (_) { /* rebuild */ }
  }
  return buildSearchIndex(outputDir);
}

function makeSnippet(text, query, maxLen = 120) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 60);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

function searchArchives(outputDir, query, { limit = 80, rebuild = false } = {}) {
  const q = String(query || '').trim();
  if (!q) return { hits: [], total: 0 };
  const index = loadSearchIndex(outputDir, { rebuild });
  const lower = q.toLowerCase();
  const hits = [];
  for (const entry of index.entries) {
    const hay = `${entry.text} ${entry.userName} ${entry.userId}`.toLowerCase();
    if (!hay.includes(lower)) continue;
    hits.push({
      userDir: entry.userDir,
      platform: entry.platform,
      userId: entry.userId,
      userName: entry.userName,
      postId: entry.postId,
      created_at: entry.created_at,
      snippet: makeSnippet(entry.text, q),
    });
    if (hits.length >= limit) break;
  }
  return { hits, total: hits.length, query: q };
}

module.exports = {
  buildSearchIndex,
  loadSearchIndex,
  searchArchives,
};
