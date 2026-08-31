import { postTimeMs, sortPosts } from './postTime.js'
import { groupLiveMedia } from './livePhoto.js'
import { detectPostPlatform } from './postPlatform.js'
import { PLATFORM_LABELS } from '../constants'
import { browseTheme, THEME_STORAGE_KEY } from '../theme.js'

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

function highlightEntities(escapedText, platform) {
  if (platform === 'weibo') {
    return escapedText
      .replace(/#([^#\n]{1,40})#/g, '<span class="entity">#$1#</span>')
      .replace(/@([A-Za-z0-9_\u4e00-\u9fff-]+)/g, '<span class="entity">@$1</span>')
  }
  return escapedText
    .replace(/(^|\s)#([A-Za-z0-9_\u4e00-\u9fff]+)/g, '$1<span class="entity">#$2</span>')
    .replace(/(^|\s)@([A-Za-z0-9_.]+)/g, '$1<span class="entity">@$2</span>')
}

function igCarouselMarkup(slides) {
  if (!slides.length) return ''
  if (slides.length === 1) {
    return `<div class="ig-media-panel"><div class="ig-slide">${slides[0]}</div></div>`
  }
  const panelSlides = slides.map((markup) => `<div class="ig-slide">${markup}</div>`).join('')
  const dots = slides.map((_, index) => (
    `<button type="button" class="ig-dot${index === 0 ? ' active' : ''}" data-index="${index}" aria-label="第 ${index + 1} 张"></button>`
  )).join('')
  const chevronPrev = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 9 12l5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  const chevronNext = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 15 12l-5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  return `<div class="ig-media-shell">
    <div class="ig-media-panel" tabindex="0">${panelSlides}</div>
    <button type="button" class="ig-nav ig-nav-prev" aria-label="上一张">${chevronPrev}</button>
    <button type="button" class="ig-nav ig-nav-next" aria-label="下一张">${chevronNext}</button>
    <div class="ig-dots" role="tablist">${dots}</div>
  </div>`
}

function postMarkup(post, { name, account, platform }) {
  const text = highlightEntities(escapeHtml(stripHtml(post.text || '')), platform).replace(/\n/g, '<br/>')
  const date = escapeHtml(formatDateForHtml(post.created_at || post.date || ''))
  const ts = postTimeMs(post)
  const idAttr = escapeHtml(String(post.id || ''))
  const url = post.url || ''
  const media = groupLiveMedia(post.pics || []).slice(0, 9)
  function cellMarkup(pic) {
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
  }
  const slides = media.map(cellMarkup).filter(Boolean)
  const images = slides.join('')
  const count = media.length
  const mediaClass = platform === 'twitter'
    ? `images x-media n${count}`
    : `images n${count}`

  if (platform === 'twitter') {
    return `
      <article class="post x-post" id="post-${idAttr}" data-ts="${ts}" data-id="${idAttr}">
        <div class="name">${escapeHtml(post.user_name || name)} <span class="handle">@${escapeHtml(post.screen_name || account)}</span> · ${date}</div>
        ${text ? `<p class="text">${text}</p>` : ''}
        <div class="${mediaClass}">${images}</div>
        ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">打开原文</a>` : ''}
      </article>`
  }

  if (platform === 'instagram') {
    const mediaMarkup = igCarouselMarkup(slides)
    return `
      <article class="post ig-post" id="post-${idAttr}" data-ts="${ts}" data-id="${idAttr}">
        <div class="ig-card has-media">
          ${images ? mediaMarkup : ''}
          <aside class="ig-side">
            <div class="ig-head"><span class="name">${escapeHtml(post.user_name || name)}</span> <span class="handle">@${escapeHtml(post.screen_name || account)}</span></div>
            ${text ? `<div class="ig-caption"><strong>${escapeHtml(post.user_name || name)}</strong> ${text}</div>` : '<p class="ig-caption-empty">无配文</p>'}
            <div class="meta">${date}${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">查看原文</a>` : ''}</div>
          </aside>
        </div>
      </article>`
  }

  return `
    <article class="post" id="post-${idAttr}" data-ts="${ts}" data-id="${idAttr}">
      <div class="name">${escapeHtml(post.user_name || name)}</div>
      ${text ? `<p class="text">${text}</p>` : ''}
      <div class="${mediaClass}">${images}</div>
      <div class="meta">${date}${post.source ? ` · 来自 ${escapeHtml(post.source)}` : ''}${url ? ` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">原文</a>` : ''}</div>
    </article>`
}

export function buildArchiveHtml({ posts, userName, handle, platform, theme }) {
  const name = userName || handle || 'user'
  const account = String(handle || '').replace(/^@/, '')
  const ordered = sortPosts(posts || [], 'newest')
  const resolvedPlatform = detectPostPlatform(ordered[0], { platform })
  const body = ordered.map((post) => postMarkup(post, { name, account, platform: resolvedPlatform })).join('\n')
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light'
  return archivePageHtml({
    userName: name,
    handle: account,
    platform: resolvedPlatform,
    body,
    count: ordered.length,
    theme: resolvedTheme,
  })
}

function sortControlsHtml() {
  return `<div class="sort" role="group" aria-label="时间顺序">
    <button type="button" data-order="newest" class="on">最新在前</button>
    <button type="button" data-order="oldest">最早在前</button>
  </div>`
}

function toolbarHtml() {
  return `<div class="toolbar">
    ${sortControlsHtml()}
    <button type="button" id="sa-theme-toggle" class="theme-btn" aria-pressed="false">深色</button>
  </div>`
}

function archivePageHtml({ userName, handle, platform, body, count, theme }) {
  const label = PLATFORM_LABELS[platform] || '存档'
  const subtitle = platform === 'weibo'
    ? `共 ${count} 条微博 · 本地存档`
    : platform === 'instagram'
    ? `@${escapeHtml(handle)} · 共 ${count} 条 Instagram · 本地存档`
    : `${count} posts · local archive`
  const initialTheme = theme === 'dark' ? 'dark' : 'light'

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${initialTheme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(userName)} · ${escapeHtml(label)}</title>
<style>
  html[data-theme='light'], html:not([data-theme]) {
    color-scheme: light;
    --bg: #f4f4f5;
    --surface: #ffffff;
    --ink: #1a1a1a;
    --muted: #6b6b6b;
    --accent: #2563eb;
    --entity: #2563eb;
    --hairline: #ebebeb;
    --edge: #d4d4d4;
    --media: #f4f4f5;
    --avatar: #a1a1aa;
    --cover: linear-gradient(180deg, #e4e4e7 0%, #d4d4d8 100%);
    --page-shadow: 0 1px 3px rgba(0,0,0,0.06);
    --page-border: none;
  }
  html[data-theme='dark'] {
    color-scheme: dark;
    --bg: #09090b;
    --surface: #09090b;
    --ink: #e4e4e7;
    --muted: #a1a1aa;
    --accent: #3b82f6;
    --entity: #3b82f6;
    --hairline: #27272a;
    --edge: #3f3f46;
    --media: #18181b;
    --avatar: #52525b;
    --cover: #27272a;
    --page-shadow: none;
    --page-border: 1px solid var(--hairline);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--ink); }
  .page { max-width: 600px; margin: 0 auto; background: var(--surface); min-height: 100vh; box-shadow: var(--page-shadow); border-inline: var(--page-border); }
  .profile { padding: 16px 16px 14px; border-bottom: 1px solid var(--hairline); }
  .band { height: 8px; background: var(--bg); }
  .avatar { width: 56px; height: 56px; border-radius: 50%; background: var(--avatar); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; }
  .profile-head { display: flex; gap: 12px; align-items: center; }
  .profile-copy { min-width: 0; }
  h1 { font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
  .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .handle { color: var(--muted); font-weight: 400; }
  .post { padding: 12px 16px; border-bottom: 1px solid var(--hairline); }
  .name { font-weight: 700; font-size: 15px; }
  .text { font-size: 15px; line-height: 1.6; margin: 6px 0 8px; }
  .text .entity { color: var(--entity); }
  .images { display: grid; gap: 4px; max-width: 360px; }
  .images.n1 { grid-template-columns: 1fr; max-width: 260px; }
  .images.n2, .images.n4 { grid-template-columns: 1fr 1fr; }
  .images.n3, .images.n5, .images.n6, .images.n7, .images.n8, .images.n9 { grid-template-columns: 1fr 1fr 1fr; }
  .ig-post { padding: 0; }
  .ig-card { display: flex; min-height: 320px; max-height: 520px; }
  .ig-media-shell { position: relative; flex: 1.15; min-width: 0; background: #000; }
  .ig-media-panel { flex: 1.15; min-width: 0; background: #000; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .ig-media-panel::-webkit-scrollbar { display: none; }
  .ig-media-shell .ig-media-panel { flex: 1; width: 100%; }
  .ig-slide { flex: 0 0 100%; scroll-snap-align: start; aspect-ratio: 1; }
  .ig-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 30px; height: 30px; border: 0; border-radius: 50%; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,.92); color: #262626; cursor: pointer; }
  .ig-nav svg { width: 18px; height: 18px; }
  .ig-nav-prev { left: 12px; }
  .ig-nav-next { right: 12px; }
  .ig-nav[hidden] { display: none; }
  .ig-dots { position: absolute; left: 0; right: 0; bottom: 12px; display: flex; justify-content: center; gap: 4px; z-index: 2; }
  .ig-dot { width: 6px; height: 6px; border: 0; border-radius: 50%; padding: 0; background: rgba(255,255,255,.45); cursor: pointer; }
  .ig-dot.active { background: #0095f6; }
  .ig-side { flex: 0.85; min-width: 180px; max-width: 240px; border-left: 1px solid var(--hairline); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .ig-head .name { display: block; font-size: 14px; }
  .ig-head .handle { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); font-weight: 400; }
  .ig-caption { font-size: 14px; line-height: 1.55; flex: 1; overflow-y: auto; }
  .ig-caption strong { margin-right: 6px; }
  .ig-caption-empty { margin: 0; color: var(--muted); font-size: 13px; }
  .ig-media-panel .cell, .ig-slide .cell { aspect-ratio: 1; max-width: none; }
  .images.x-media { gap: 2px; max-width: 510px; border: 1px solid var(--hairline); border-radius: 16px; overflow: hidden; }
  .cell { aspect-ratio: 1; background: var(--media); overflow: hidden; position: relative; }
  .images.x-media .cell { aspect-ratio: auto; min-height: 140px; }
  img, video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cell.live video { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
  .cell.live:hover video, .cell.live video.on { opacity: 1; }
  .cell .live { position: absolute; left: 6px; bottom: 6px; height: 18px; padding: 0 6px; border-radius: 4px; background: rgba(0,0,0,.55); color: #fff; font-size: 10px; font-weight: 700; letter-spacing: .04em; line-height: 18px; }
  .meta { font-size: 12px; color: var(--muted); }
  a { color: var(--accent); text-decoration: none; font-size: 13px; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
  .sort { display: flex; gap: 8px; }
  .sort button, .theme-btn { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--edge); background: var(--surface); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
  .sort button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
  .theme-btn[aria-pressed='true'] { color: var(--ink); }
</style>
</head>
<body>
<div class="page">
  <div class="profile">
    <div class="profile-head">
      <div class="avatar">${escapeHtml(userName.slice(0, 1))}</div>
      <div class="profile-copy">
        <h1>${escapeHtml(userName)}</h1>
        <div class="sub">${subtitle}</div>
      </div>
    </div>
    ${toolbarHtml()}
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
  var THEME_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  function normalizeTheme(value) { return value === 'dark' ? 'dark' : 'light'; }
  function applyTheme(theme) {
    theme = normalizeTheme(theme);
    document.documentElement.dataset.theme = theme;
    var btn = document.getElementById('sa-theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '浅色' : '深色';
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }
  function initTheme() {
    var embedded = normalizeTheme(document.documentElement.getAttribute('data-theme'));
    var stored = localStorage.getItem(THEME_KEY);
    var theme = (stored === 'dark' || stored === 'light') ? stored : embedded;
    if (!stored) localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }
  initTheme();
  var themeBtn = document.getElementById('sa-theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

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
  function scrollToHash() {
    var hash = (location.hash || '').replace(/^#/, '');
    if (!hash) return;
    var el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  scrollToHash();
  window.addEventListener('hashchange', scrollToHash);

  function initIgCarousels() {
    document.querySelectorAll('.ig-media-shell').forEach(function (shell) {
      var panel = shell.querySelector('.ig-media-panel');
      var slideEls = panel ? panel.querySelectorAll('.ig-slide') : [];
      var dots = shell.querySelectorAll('.ig-dot');
      var prev = shell.querySelector('.ig-nav-prev');
      var next = shell.querySelector('.ig-nav-next');
      if (!panel || slideEls.length < 2) return;
      var index = 0;
      function syncChrome(nextIndex) {
        index = nextIndex;
        dots.forEach(function (dot, dotIndex) {
          dot.classList.toggle('active', dotIndex === index);
        });
        if (prev) prev.hidden = index <= 0;
        if (next) next.hidden = index >= slideEls.length - 1;
      }
      function goTo(nextIndex, smooth) {
        var target = Math.max(0, Math.min(slideEls.length - 1, nextIndex));
        panel.scrollTo({ left: target * panel.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
        syncChrome(target);
      }
      if (prev) prev.addEventListener('click', function () { goTo(index - 1, true); });
      if (next) next.addEventListener('click', function () { goTo(index + 1, true); });
      dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          goTo(Number(dot.getAttribute('data-index')) || 0, true);
        });
      });
      panel.addEventListener('scroll', function () {
        var width = panel.clientWidth || 1;
        var nextIndex = Math.round(panel.scrollLeft / width);
        if (nextIndex !== index) syncChrome(nextIndex);
      }, { passive: true });
      goTo(0, false);
    });
  }
  initIgCarousels();
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
    theme: browseTheme.value,
  })
  return window.electronAPI.saveHtml({
    userDir,
    html,
    filename: 'index.html',
  })
}
