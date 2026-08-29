const fs = require('fs');
const path = require('path');

function stripHtml(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function extractHashtags(text) {
  const tags = new Set();
  const re = /#([\w\u4e00-\u9fff]+)/g;
  let match;
  while ((match = re.exec(text))) {
    const tag = String(match[1] || '').trim();
    if (tag) tags.add(tag);
  }
  return [...tags];
}

function postTitle(text, postId) {
  const plain = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (!plain) return String(postId || 'untitled');
  const firstLine = plain.split('\n')[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return `${firstLine.slice(0, 77)}…`;
}

function yearFromDate(date) {
  const match = String(date || '').match(/^(\d{4})/);
  return match ? match[1] : 'unknown';
}

function buildTags(post) {
  const tags = new Set(['social-archiver']);
  const platform = String(post.platform || '').trim();
  if (platform) tags.add(platform);
  const kind = String(post.kind || '').trim();
  if (kind) tags.add(kind);
  for (const tag of extractHashtags(post.text || '')) {
    tags.add(tag);
  }
  return [...tags];
}

function postMarkdown(post, userDir) {
  const postId = String(post.id || 'unknown');
  const date = post.date || 'unknown';
  const platform = post.platform || '';
  const url = post.url || '';
  const text = stripHtml(post.text || '');
  const title = postTitle(text, postId);
  const tags = buildTags(post);
  const lines = [
    '---',
    `id: "${yamlEscape(postId)}"`,
    `title: "${yamlEscape(title)}"`,
    `date: "${yamlEscape(date)}"`,
  ];
  if (post.created_at) lines.push(`created_at: "${yamlEscape(post.created_at)}"`);
  lines.push(`platform: "${yamlEscape(platform)}"`);
  if (post.kind) lines.push(`kind: "${yamlEscape(post.kind)}"`);
  if (post.user_name || post.screen_name) {
    lines.push(`author: "${yamlEscape(post.user_name || post.screen_name)}"`);
  }
  if (url) lines.push(`url: "${yamlEscape(url)}"`);
  lines.push('tags:');
  for (const tag of tags) {
    lines.push(`  - ${tag}`);
  }
  lines.push('---', '', text || '（无正文）', '');

  for (const pic of post.pics || []) {
    const folder = pic.date_folder || date;
    const filename = pic.filename || '';
    if (!filename) continue;
    const rel = path.posix.join('..', '..', folder, filename).replace(/\\/g, '/');
    if (pic.type === 'video') {
      lines.push(`[视频](${rel})`, '');
      continue;
    }
    lines.push(`![media](${rel})`, '');
    const videoName = pic.video_filename || '';
    if (videoName) {
      const videoRel = path.posix.join('..', '..', folder, videoName).replace(/\\/g, '/');
      lines.push(`[实况视频](${videoRel})`, '');
    }
  }
  return lines.join('\n').trim() + '\n';
}

function exportUserMarkdown(userDir, destDir) {
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) {
    return { success: false, error: '没有帖子目录', count: 0, destDir };
  }
  const outRoot = destDir || path.join(userDir, 'export-md');
  fs.mkdirSync(outRoot, { recursive: true });
  let count = 0;
  for (const dateEntry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateEntry.isDirectory()) continue;
    const dateDir = path.join(postsRoot, dateEntry.name);
    const year = yearFromDate(dateEntry.name);
    const outDateDir = path.join(outRoot, year, dateEntry.name);
    fs.mkdirSync(outDateDir, { recursive: true });
    for (const file of fs.readdirSync(dateDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const post = JSON.parse(fs.readFileSync(path.join(dateDir, file), 'utf8')) || {};
        const postId = String(post.id || path.basename(file, '.json'));
        const md = postMarkdown(post, userDir);
        fs.writeFileSync(path.join(outDateDir, `${postId}.md`), md, 'utf8');
        count += 1;
      } catch (_) { /* skip */ }
    }
  }
  return { success: true, count, destDir: outRoot };
}

module.exports = {
  exportUserMarkdown,
  postMarkdown,
  buildTags,
  extractHashtags,
  yearFromDate,
};
