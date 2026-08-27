import { postTimeMs, sortPosts } from './postTime.js'
import { groupLiveMedia } from './livePhoto.js'

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripHtml(html) {
  return (html || '')
    .replace(/<a[^>]*>([^<]*)<\/a>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
}

function formatDateForHtml(raw) {
  const clean = stripHtml(raw)
  const d = new Date(clean)
  if (!isNaN(d.getTime())) return d.toLocaleString('zh-CN', { hour12: false })
  return clean
}

export function detectSkin(posts, platform) {
  const value = String(platform || posts[0]?.platform || '').toLowerCase()
  if (value === 'twitter' || value === 'x') return 'twitter'
  if (value === 'instagram') return 'instagram'
  if (value === 'weibo') return 'weibo'
  const url = posts[0]?.url || ''
  if (/x\.com|twitter\.com/i.test(url)) return 'twitter'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return 'weibo'
}

function highlightEntities(escapedText, skin) {
  if (skin === 'weibo') {
    return escapedText
      .replace(/#([^#\n]{1,40})#/g, '<span class="topic">#$1#</span>')
      .replace(/@([A-Za-z0-9_\u4e00-\u9fff-]+)/g, '<span class="at">@$1</span>')
  }
  if (skin === 'instagram') {
    return escapedText
      .replace(/(^|\s)#([A-Za-z0-9_\u4e00-\u9fff]+)/g, '$1<span class="topic">#$2</span>')
      .replace(/(^|\s)@([A-Za-z0-9_.]+)/g, '$1<span class="at">@$2</span>')
  }
  return escapedText
    .replace(/(^|\s)#([A-Za-z0-9_\u4e00-\u9fff]+)/g, '$1<span class="hash">#$2</span>')
    .replace(/(^|\s)@([A-Za-z0-9_]+)/g, '$1<span class="at">@$2</span>')
}

export function buildArchiveHtml({ posts, userName, handle, platform }) {
  const name = userName || handle || 'user'
  const account = String(handle || '').replace(/^@/, '')
  const ordered = sortPosts(posts || [], 'newest')
  const skin = detectSkin(ordered, platform)
  const body = ordered.map((post) => {
    const text = highlightEntities(escapeHtml(stripHtml(post.text || '')), skin).replace(/\n/g, '<br/>')
    const date = escapeHtml(formatDateForHtml(post.created_at || post.date || ''))
    const ts = postTimeMs(post)
    const idAttr = escapeHtml(String(post.id || ''))
    const url = post.url || ''
    const media = groupLiveMedia(post.pics || []).slice(0, 9)
    const images = media
      .map((pic) => {
        const still = pic.date_folder && pic.filename
          ? `${pic.date_folder}/${pic.filename}`
          : ''
        if (!still) return ''
        if (pic.type === 'video') {
          return `<div class="cell"><video src="${escapeHtml(still)}" controls preload="metadata"></video></div>`
        }
        if (pic.type === 'livephoto') {
          const motion = pic.date_folder && pic.video_filename
            ? `${pic.date_folder}/${pic.video_filename}`
            : ''
          return `<div class="cell live"><img src="${escapeHtml(still)}" loading="lazy" />${motion ? `<video src="${escapeHtml(motion)}" muted loop playsinline preload="auto"></video>` : ''}<span class="live">LIVE</span></div>`
        }
        return `<div class="cell"><img src="${escapeHtml(still)}" loading="lazy" /></div>`
      })
      .join('')
    const count = media.length
    if (skin === 'twitter') {
      return `
      <article class="post" data-ts="${ts}" data-id="${idAttr}">
        <div class="name">${escapeHtml(post.user_name || name)} <span class="handle">@${escapeHtml(post.screen_name || account)}</span> · ${date}</div>
        ${text ? `<p class="text">${text}</p>` : ''}
        <div class="images n${count}">${images}</div>
        ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">打开原文</a>` : ''}
      </article>`
    }
    if (skin === 'instagram') {
      return `
      <article class="post" data-ts="${ts}" data-id="${idAttr}">
        <div class="name">${escapeHtml(post.user_name || name)} <span class="handle">@${escapeHtml(post.screen_name || account)}</span> · ${date}</div>
        ${text ? `<p class="text">${text}</p>` : ''}
        <div class="images n${count}">${images}</div>
        ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">查看原文</a>` : ''}
      </article>`
    }
    return `
      <article class="post" data-ts="${ts}" data-id="${idAttr}">
        <div class="name">${escapeHtml(post.user_name || name)}</div>
        ${text ? `<p class="text">${text}</p>` : ''}
        <div class="images n${count}">${images}</div>
        <div class="meta">${date}${post.source ? ` · 来自 ${escapeHtml(post.source)}` : ''}${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">原文</a>` : ''}</div>
      </article>`
  }).join('\n')

  return skin === 'twitter'
    ? twitterArchiveHtml(name, account, body, ordered.length)
    : skin === 'instagram'
    ? igArchiveHtml(name, account, body, ordered.length)
    : weiboArchiveHtml(name, body, ordered.length)
}

function sortControlsHtml() {
  return `<div class="sort" role="group" aria-label="时间顺序">
    <button type="button" data-order="newest" class="on">最新在前</button>
    <button type="button" data-order="oldest">最早在前</button>
  </div>`
}

function weiboArchiveHtml(userName, body, count) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(userName)} 的微博</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f2f2f5; color: #333; }
  .page { max-width: 600px; margin: 0 auto; background: #fff; min-height: 100vh; }
  .cover { height: 120px; background: linear-gradient(180deg, #ff8200, #ff9f40); }
  .profile { padding: 0 16px 16px; }
  .band { height: 8px; background: #f2f2f5; }
  .avatar { width: 72px; height: 72px; border-radius: 50%; background: #ffb366; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; margin-top: -28px; border: 3px solid #fff; }
  h1 { font-size: 20px; margin-top: 10px; }
  .sub { color: #939393; font-size: 13px; margin-top: 4px; }
  .post { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
  .name { font-weight: 700; font-size: 15px; }
  .text { font-size: 15px; line-height: 1.6; margin: 6px 0 8px; }
  .text .topic, .text .at { color: #eb7350; }
  .images { display: grid; gap: 4px; max-width: 360px; }
  .images.n1 { grid-template-columns: 1fr; max-width: 260px; }
  .images.n2, .images.n4 { grid-template-columns: 1fr 1fr; }
  .images.n3, .images.n5, .images.n6, .images.n7, .images.n8, .images.n9 { grid-template-columns: 1fr 1fr 1fr; }
  .cell { aspect-ratio: 1; background: #f2f2f5; overflow: hidden; position: relative; }
  img, video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cell.live video { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
  .cell.live:hover video, .cell.live video.on { opacity: 1; }
  .cell .live { position: absolute; left: 6px; bottom: 6px; height: 18px; padding: 0 6px; border-radius: 4px; background: rgba(0,0,0,.55); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .04em; line-height: 18px; }
  .meta { font-size: 12px; color: #939393; }
  a { color: #eb7350; text-decoration: none; }
  .sort { display: flex; gap: 8px; margin-top: 12px; }
  .sort button { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid #e6e6e6; background: #fff; color: #939393; font: inherit; font-size: 13px; cursor: pointer; }
  .sort button.on { background: #ff8200; border-color: #ff8200; color: #fff; }
</style>
</head>
<body>
<div class="page">
  <div class="cover"></div>
  <div class="profile">
    <div class="avatar">${escapeHtml(userName.slice(0, 1))}</div>
    <h1>${escapeHtml(userName)}</h1>
    <div class="sub">共 ${count} 条微博 · 本地存档</div>
    ${sortControlsHtml()}
  </div>
  <div class="band"></div>
  <div id="feed">${body}</div>
</div>
${archiveLightbox()}
</body>
</html>`
}

function twitterArchiveHtml(userName, handle, body, count) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(userName)} (@${escapeHtml(handle)})</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Segoe UI", "PingFang SC", sans-serif; background: #000; color: #e7e9ea; }
  .page { max-width: 600px; margin: 0 auto; border-inline: 1px solid #2f3336; min-height: 100vh; }
  .cover { height: 120px; background: #333639; }
  .profile { padding: 12px 16px 16px; border-bottom: 1px solid #2f3336; }
  .avatar { width: 72px; height: 72px; border-radius: 50%; background: #536471; margin-top: -40px; border: 4px solid #000; display: flex; align-items: center; justify-content: center; font-size: 28px; }
  h1 { font-size: 20px; margin-top: 8px; }
  .handle { color: #71767b; font-weight: 400; }
  .sub { color: #71767b; font-size: 13px; margin-top: 6px; }
  .post { padding: 12px 16px; border-bottom: 1px solid #2f3336; }
  .name { font-weight: 700; }
  .text { font-size: 15px; line-height: 1.5; margin: 6px 0 10px; }
  .text .hash, .text .at { color: #1d9bf0; }
  .images { display: grid; gap: 2px; border: 1px solid #2f3336; border-radius: 16px; overflow: hidden; }
  .images.n1 { grid-template-columns: 1fr; }
  .images.n2, .images.n4 { grid-template-columns: 1fr 1fr; }
  .images.n3, .images.n5, .images.n6, .images.n7, .images.n8, .images.n9 { grid-template-columns: 1fr 1fr 1fr; }
  .cell { min-height: 140px; background: #16181c; position: relative; }
  img, video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cell.live video { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
  .cell.live:hover video, .cell.live video.on { opacity: 1; }
  .cell .live { position: absolute; left: 6px; bottom: 6px; height: 18px; padding: 0 6px; border-radius: 4px; background: rgba(0,0,0,.55); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .04em; line-height: 18px; }
  a { color: #1d9bf0; text-decoration: none; font-size: 13px; }
  .sort { display: flex; gap: 8px; margin-top: 12px; }
  .sort button { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid #2f3336; background: transparent; color: #71767b; font: inherit; font-size: 13px; cursor: pointer; }
  .sort button.on { background: #1d9bf0; border-color: #1d9bf0; color: #fff; }
</style>
</head>
<body>
<div class="page">
  <div class="cover"></div>
  <div class="profile">
    <div class="avatar">${escapeHtml(userName.slice(0, 1))}</div>
    <h1>${escapeHtml(userName)}</h1>
    <div class="handle">@${escapeHtml(handle)}</div>
    <div class="sub">${count} posts · local archive</div>
    ${sortControlsHtml()}
  </div>
  <div id="feed">${body}</div>
</div>
${archiveLightbox()}
</body>
</html>`
}

function igArchiveHtml(userName, handle, body, count) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(userName)} (@${escapeHtml(handle)})</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #fafafa; color: #262626; }
  .page { max-width: 600px; margin: 0 auto; background: #fff; min-height: 100vh; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .cover { height: 120px; background: linear-gradient(45deg, #f58529 0%, #dd2a7b 50%, #515bd4 100%); }
  .profile { padding: 0 16px 16px; }
  .band { height: 8px; background: #fafafa; }
  .avatar { width: 72px; height: 72px; border-radius: 50%; background: #dd2a7b; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; margin-top: -28px; border: 3px solid #fff; }
  h1 { font-size: 20px; font-weight: 800; margin-top: 10px; letter-spacing: -0.02em; }
  .sub { color: #8e8e8e; font-size: 13px; margin-top: 4px; }
  .post { padding: 12px 16px; border-bottom: 1px solid #efefef; }
  .name { font-weight: 700; font-size: 15px; }
  .text { font-size: 15px; line-height: 1.6; margin: 6px 0 8px; }
  .text .topic, .text .at { color: #0095f6; }
  .handle { color: #8e8e8e; font-weight: 400; }
  .images { display: grid; gap: 4px; max-width: 360px; }
  .images.n1 { grid-template-columns: 1fr; max-width: 260px; }
  .images.n2, .images.n4 { grid-template-columns: 1fr 1fr; }
  .images.n3, .images.n5, .images.n6, .images.n7, .images.n8, .images.n9 { grid-template-columns: 1fr 1fr 1fr; }
  .cell { aspect-ratio: 1; background: #efefef; overflow: hidden; position: relative; }
  img, video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .meta { font-size: 12px; color: #8e8e8e; }
  a { color: #0095f6; text-decoration: none; }
  .sort { display: flex; gap: 8px; margin-top: 12px; }
  .sort button { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid #dbdbdb; background: #fff; color: #8e8e8e; font: inherit; font-size: 13px; cursor: pointer; }
  .sort button.on { background: #0095f6; border-color: #0095f6; color: #fff; }
</style>
</head>
<body>
<div class="page">
  <div class="cover"></div>
  <div class="profile">
    <div class="avatar">${escapeHtml(userName.slice(0, 1))}</div>
    <h1>${escapeHtml(userName)}</h1>
    <div class="sub">@${escapeHtml(handle)} · 共 ${count} 条 Instagram · 本地存档</div>
    ${sortControlsHtml()}
  </div>
  <div class="band"></div>
  <div id="feed">${body}</div>
</div>
${archiveLightbox()}
</body>
</html>`
}

function archiveLightbox() {
  return `<div id="sa-lb" hidden></div>
<style>
  .cell img { cursor: zoom-in; }
  #sa-lb { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.9); }
  #sa-lb[hidden] { display: none; }
  #sa-lb .stage { position: relative; max-width: 96vw; max-height: 96vh; }
  #sa-lb img, #sa-lb video { max-width: 96vw; max-height: 96vh; object-fit: contain; display: block; }
  #sa-lb video { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
<script>
(function () {
  var lb = document.getElementById('sa-lb');
  function closeLb() { lb.hidden = true; lb.innerHTML = ''; }
  document.querySelectorAll('.cell img').forEach(function (img) {
    img.addEventListener('click', function () {
      var cell = img.closest('.cell');
      var motion = cell && cell.querySelector('video');
      var html = '<div class="stage"><img src="' + img.getAttribute('src') + '" alt="">';
      if (motion && motion.getAttribute('src')) {
        html += '<video src="' + motion.getAttribute('src') + '" muted loop playsinline autoplay></video>';
      }
      html += '</div>';
      lb.innerHTML = html;
      lb.hidden = false;
      var video = lb.querySelector('video');
      if (video) {
        video.muted = true;
        var play = video.play();
        if (play && play.catch) play.catch(function () {});
      }
    });
  });
  document.querySelectorAll('.cell.live').forEach(function (cell) {
    var video = cell.querySelector('video');
    if (!video) return;
    cell.addEventListener('pointerenter', function () {
      video.muted = true;
      video.classList.add('on');
      var play = video.play();
      if (play && play.catch) play.catch(function () {});
    });
    cell.addEventListener('pointerleave', function () {
      video.pause();
      video.currentTime = 0;
      video.classList.remove('on');
    });
  });
  lb.addEventListener('click', closeLb);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLb(); });
  document.querySelectorAll('a[href^="http"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    });
  });
  var feed = document.getElementById('feed');
  var buttons = document.querySelectorAll('.sort [data-order]');
  function applySort(order) {
    if (!feed) return;
    var posts = Array.prototype.slice.call(feed.querySelectorAll('.post'));
    posts.sort(function (a, b) {
      var da = Number(a.getAttribute('data-ts') || 0);
      var db = Number(b.getAttribute('data-ts') || 0);
      if (db !== da) return order === 'oldest' ? da - db : db - da;
      var ia = a.getAttribute('data-id') || '';
      var ib = b.getAttribute('data-id') || '';
      var cmp = ib.localeCompare(ia, undefined, { numeric: true });
      return order === 'oldest' ? -cmp : cmp;
    });
    posts.forEach(function (p) { feed.appendChild(p); });
    buttons.forEach(function (btn) {
      btn.classList.toggle('on', btn.getAttribute('data-order') === order);
    });
  }
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      applySort(btn.getAttribute('data-order'));
    });
  });
})();
</script>`
}

export async function writeArchiveHtml({ userDir, posts, userName, handle, platform }) {
  if (!userDir || !window.electronAPI) {
    return { success: false, error: '无法写入离线页面' }
  }
  const html = buildArchiveHtml({
    posts: posts || [],
    userName,
    handle,
    platform,
  })
  return window.electronAPI.saveHtml({
    userDir,
    html,
    filename: 'index.html',
  })
}
