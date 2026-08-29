const fs = require('fs');
const path = require('path');

function stripHtml(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function parsePostTime(post, fallbackDate) {
  const raw = post.created_at || post.date || fallbackDate || '';
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  const day = Date.parse(`${fallbackDate}T12:00:00`);
  return Number.isNaN(day) ? 0 : day;
}

function formatRssDate(ms) {
  if (!ms) return new Date().toUTCString();
  return new Date(ms).toUTCString();
}

function collectUserPosts(userDir) {
  const posts = [];
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) return posts;
  const profile = readProfile(userDir);
  for (const dateEntry of fs.readdirSync(postsRoot, { withFileTypes: true })) {
    if (!dateEntry.isDirectory()) continue;
    const dirPath = path.join(postsRoot, dateEntry.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.json')) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8')) || {};
        const text = stripHtml(meta.text || '');
        posts.push({
          id: String(meta.id || path.basename(file, '.json')),
          title: text.slice(0, 80) || String(meta.id || file),
          description: text,
          link: meta.url || '',
          pubDateMs: parsePostTime(meta, dateEntry.name),
          platform: meta.platform || profile.platform || '',
        });
      } catch (_) { /* skip */ }
    }
  }
  posts.sort((a, b) => b.pubDateMs - a.pubDateMs);
  return posts;
}

function buildFeedXml({ title, link, description, posts, maxItems = 100 }) {
  const items = (posts || []).slice(0, maxItems);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(link || 'about:blank')}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <lastBuildDate>${escapeXml(formatRssDate(Date.now()))}</lastBuildDate>`,
    `    <generator>Social Archiver</generator>`,
  ];
  for (const post of items) {
    lines.push('    <item>');
    lines.push(`      <title>${escapeXml(post.title)}</title>`);
    if (post.link) {
      lines.push(`      <link>${escapeXml(post.link)}</link>`);
      lines.push(`      <guid isPermaLink="true">${escapeXml(post.link)}</guid>`);
    } else {
      lines.push(`      <guid isPermaLink="false">${escapeXml(post.id)}</guid>`);
    }
    lines.push(`      <pubDate>${escapeXml(formatRssDate(post.pubDateMs))}</pubDate>`);
    if (post.description) {
      lines.push(`      <description>${escapeXml(post.description)}</description>`);
    }
    if (post.platform) {
      lines.push(`      <category>${escapeXml(post.platform)}</category>`);
    }
    lines.push('    </item>');
  }
  lines.push('  </channel>', '</rss>', '');
  return lines.join('\n');
}

function exportUserRss(userDir, destPath) {
  const postsRoot = path.join(userDir, '_posts');
  if (!fs.existsSync(postsRoot)) {
    return { success: false, error: '没有帖子目录', count: 0, destPath };
  }
  const profile = readProfile(userDir);
  const posts = collectUserPosts(userDir);
  const userLabel = profile.name || profile.screen_name || path.basename(userDir);
  const platform = profile.platform || 'archive';
  const feedPath = destPath || path.join(userDir, 'feed.xml');
  fs.mkdirSync(path.dirname(feedPath), { recursive: true });
  const xml = buildFeedXml({
    title: `${userLabel} (${platform})`,
    link: posts[0]?.link || '',
    description: `Social Archiver 本地存档 RSS — ${userLabel}`,
    posts,
  });
  fs.writeFileSync(feedPath, xml, 'utf8');
  return { success: true, count: posts.length, destPath: feedPath };
}

module.exports = {
  exportUserRss,
  buildFeedXml,
  collectUserPosts,
};
