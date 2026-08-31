const fs = require('fs');
const path = require('path');
const { postTimeMs, sortPostsByTime } = require('./archive-post-time');

const PLATFORM_DIRS = ['weibo', 'twitter', 'instagram'];

function findAvatar(userDir) {
  const names = ['_avatar.jpg', '_avatar.jpeg', '_avatar.png', '_avatar.webp', '_avatar.gif'];
  for (const name of names) {
    const filePath = path.join(userDir, name);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
        return filePath;
      }
    } catch (_) { /* ignore */ }
  }
  return '';
}

function isTwitterDerivativeUser(name) {
  return String(name || '').endsWith('--bookmarks') || String(name || '').endsWith('--likes');
}

function twitterDisplayName(ud, profile) {
  const platform = profile.platform || ud.platform || '';
  const base = profile.baseUserId || ud.name.replace(/--bookmarks$|--likes$/, '');
  if (ud.name.endsWith('--bookmarks')) {
    return platform ? `${platform} / ${base} (书签)` : `${base} (书签)`;
  }
  if (ud.name.endsWith('--likes')) {
    return platform ? `${platform} / ${base} (点赞)` : `${base} (点赞)`;
  }
  return platform
    ? `${platform} / ${profile.name || profile.screen_name || ud.name}`
    : (profile.name || profile.screen_name || ud.name);
}

function h264SiblingPath(mediaPath) {
  if (!mediaPath) return '';
  const ext = path.extname(mediaPath);
  const candidate = path.join(path.dirname(mediaPath), `${path.basename(mediaPath, ext)}_h264.mp4`);
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 64) return candidate;
  } catch (_) { /* ignore */ }
  return '';
}

function mapPostMediaPaths(userDir, pic) {
  const baseDir = pic.date_folder || '';
  const absPath = path.join(userDir, baseDir, pic.filename || '');
  const videoAbsPath = pic.video_filename
    ? path.join(userDir, baseDir, pic.video_filename)
    : '';
  const playbackAbsPath = pic.playback_filename
    ? path.join(userDir, baseDir, pic.playback_filename)
    : (pic.type === 'video' ? h264SiblingPath(absPath) : '');
  const videoPlaybackAbsPath = pic.video_playback_filename
    ? path.join(userDir, baseDir, pic.video_playback_filename)
    : (videoAbsPath ? h264SiblingPath(videoAbsPath) : '');
  const posterAbsPath = pic.poster_filename
    ? path.join(userDir, baseDir, pic.poster_filename)
    : '';
  return {
    ...pic,
    abs_path: absPath,
    video_abs_path: videoAbsPath,
    playback_abs_path: playbackAbsPath,
    video_playback_abs_path: videoPlaybackAbsPath,
    poster_abs_path: posterAbsPath,
  };
}

function inferPlatformFromPosts(postsDir) {
  try {
    const dateDirs = fs.readdirSync(postsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dateDir of dateDirs) {
      const files = fs.readdirSync(path.join(postsDir, dateDir.name)).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const meta = JSON.parse(fs.readFileSync(path.join(postsDir, dateDir.name, file), 'utf-8'));
        if (meta.platform) return meta.platform;
        if (String(meta.url || '').includes('weibo')) return 'weibo';
        if (/x\.com|twitter\.com/.test(String(meta.url || ''))) return 'twitter';
      }
    }
  } catch (_) { /* ignore */ }
  return '';
}

function listUserDirs(outputDir) {
  if (!outputDir || !fs.existsSync(outputDir)) return [];
  const userDirs = [];
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (PLATFORM_DIRS.includes(entry.name)) {
      const platform = entry.name;
      for (const ud of fs.readdirSync(path.join(outputDir, platform), { withFileTypes: true })) {
        if (!ud.isDirectory()) continue;
        userDirs.push({
          name: ud.name,
          dir: path.join(outputDir, platform, ud.name),
          platform,
        });
      }
    } else {
      userDirs.push({
        name: entry.name,
        dir: path.join(outputDir, entry.name),
        platform: '',
      });
    }
  }
  return userDirs;
}

/**
 * @param {string} outputDir
 * @param {{ brief?: boolean }} [options] brief=true 仅返回调度器所需字段
 */
function scanArchives(outputDir, options = {}) {
  const brief = Boolean(options.brief);
  try {
    if (!outputDir || !fs.existsSync(outputDir)) return [];
    const users = [];
    for (const ud of listUserDirs(outputDir)) {
      const userDir = ud.dir;
      const postsDir = path.join(userDir, '_posts');
      if (!fs.existsSync(postsDir)) continue;

      if (brief) {
        users.push({ name: ud.name, path: userDir, platform: ud.platform });
        continue;
      }

      let profile = {};
      const profilePath = path.join(userDir, '_profile.json');
      if (fs.existsSync(profilePath)) {
        try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')); } catch (_) { /* ignore */ }
      }
      const avatarPath = findAvatar(userDir);
      let platform = profile.platform || ud.platform || '';
      if (!platform) platform = inferPlatformFromPosts(postsDir);
      users.push({
        name: ud.name,
        path: userDir,
        platform,
        displayName: twitterDisplayName(ud, profile),
        avatar: fs.existsSync(avatarPath) ? avatarPath : '',
        lastUpdate: profile.lastUpdate || '',
      });
    }
    return users;
  } catch (_) {
    return [];
  }
}

function loadPostsFromUserDir(userDir) {
  if (!userDir || !fs.existsSync(userDir)) return [];
  const posts = [];
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return [];

  let profile = {};
  const profilePath = path.join(userDir, '_profile.json');
  if (fs.existsSync(profilePath)) {
    try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) || {}; } catch (_) { /* ignore */ }
  }
  const avatarPath = findAvatar(userDir);
  const hasAvatar = Boolean(avatarPath);
  const fallbackId = path.basename(userDir);

  for (const dateEntry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateEntry.isDirectory()) continue;
    const dateDir = path.join(postsRoot, dateEntry.name);
    for (const file of fs.readdirSync(dateDir).filter((f) => f.endsWith('.json'))) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dateDir, file), 'utf-8'));
        if (meta.pics && Array.isArray(meta.pics)) {
          meta.pics = meta.pics.map((pic) => mapPostMediaPaths(userDir, pic));
        }
        meta.user_name = meta.user_name || profile.name || profile.screen_name || fallbackId;
        meta.screen_name = meta.screen_name || profile.screen_name || fallbackId;
        if (profile.verified) meta.verified = true;
        if (hasAvatar) meta.avatar_path = avatarPath;
        meta._archiveUserDir = userDir;
        meta._archiveUserLabel = profile.name || profile.screen_name || fallbackId;
        posts.push(meta);
      } catch (_) {
        // skip unreadable metadata
      }
    }
  }
  return sortPostsByTime(posts);
}

function loadAllPosts(outputDir) {
  try {
    if (!outputDir || !fs.existsSync(outputDir)) return [];
    const users = scanArchives(outputDir);
    const merged = [];
    for (const user of users) {
      const batch = loadPostsFromUserDir(user.path);
      for (const post of batch) {
        post._archiveUserDir = user.path;
        post._archiveUserLabel = user.displayName || user.name;
        merged.push(post);
      }
    }
    merged.sort((a, b) => {
      const diff = postTimeMs(b) - postTimeMs(a);
      if (diff) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
    return merged;
  } catch (_) {
    return [];
  }
}

module.exports = {
  PLATFORM_DIRS,
  findAvatar,
  isTwitterDerivativeUser,
  twitterDisplayName,
  mapPostMediaPaths,
  scanArchives,
  loadPostsFromUserDir,
  loadAllPosts,
};
