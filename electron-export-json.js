const fs = require('fs');
const path = require('path');

function readProfile(userDir) {
  try {
    const profilePath = path.join(userDir, '_profile.json');
    if (!fs.existsSync(profilePath)) return {};
    return JSON.parse(fs.readFileSync(profilePath, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function collectUserPosts(userDir) {
  const posts = [];
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return posts;
  for (const dateEntry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateEntry.isDirectory()) continue;
    const dirPath = path.join(postsRoot, dateEntry.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.json')) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8')) || {};
        posts.push(meta);
      } catch (_) { /* skip */ }
    }
  }
  return posts;
}

function exportUserJson(userDir, destPath) {
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) {
    return { success: false, error: '没有帖子目录', count: 0, destPath };
  }
  const profile = readProfile(userDir);
  const posts = collectUserPosts(userDir);
  const stamp = new Date().toISOString().slice(0, 10);
  const userId = path.basename(userDir);
  const outPath = destPath || path.join(userDir, `export-${userId}-${stamp}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = {
    exported_at: new Date().toISOString(),
    user_dir: userDir,
    user_id: profile.user_id || userId,
    platform: profile.platform || '',
    profile,
    post_count: posts.length,
    posts,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  return { success: true, count: posts.length, destPath: outPath };
}

module.exports = {
  exportUserJson,
  collectUserPosts,
};
