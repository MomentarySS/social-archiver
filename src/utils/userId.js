/** Normalize platform user handles before cache / save. */

const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\uFEFF]/g
const UNICODE_UNDERSCORES = /[\uFF3F\u2017\uFE33\uFE34\u02CD\u02F8]/g

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com'])
const IG_HOSTS = new Set(['instagram.com', 'instagr.am'])
const WEIBO_HOSTS = new Set(['weibo.com', 'm.weibo.cn', 'weibo.cn'])

const X_RESERVED = new Set([
  'home', 'explore', 'search', 'i', 'intent', 'hashtag', 'share', 'compose',
  'messages', 'notifications', 'settings', 'tos', 'privacy', 'login', 'signup',
])
const IG_RESERVED = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'tv',
  'about', 'legal', 'developer',
])

function parseMaybeUrl(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return new URL(withScheme)
  } catch {
    return null
  }
}

/** Extract a user id from a profile URL when the host matches the selected platform. */
export function extractUserIdFromUrl(value, platform) {
  const url = parseMaybeUrl(value)
  if (!url) return ''
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  if (!parts.length) return ''

  if (platform === 'twitter' || platform === 'x') {
    if (!X_HOSTS.has(host)) return ''
    const first = parts[0]
    if (!first || X_RESERVED.has(first.toLowerCase())) return ''
    return first.replace(/^@+/, '')
  }

  if (platform === 'instagram') {
    if (!IG_HOSTS.has(host)) return ''
    const first = parts[0]
    if (!first || IG_RESERVED.has(first.toLowerCase())) return ''
    return first.replace(/^@+/, '')
  }

  if (platform === 'weibo') {
    if (!WEIBO_HOSTS.has(host)) return ''
    if ((parts[0] === 'u' || parts[0] === 'profile') && /^\d+$/.test(parts[1] || '')) {
      return parts[1]
    }
    if (/^\d+$/.test(parts[0])) return parts[0]
    return ''
  }

  return ''
}

export function normalizeUserId(value, platform) {
  let text = String(value || '').trim()
  if (!text) return ''

  const fromUrl = extractUserIdFromUrl(text, platform)
  if (fromUrl) text = fromUrl

  text = text.replace(/^@+/, '')

  if (platform === 'instagram' || platform === 'twitter' || platform === 'x') {
    text = text
      .replace(UNICODE_UNDERSCORES, '_')
      .replace(UNICODE_SPACES, ' ')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  return text
}

export function userIdPlaceholder(platform) {
  if (platform === 'instagram') return '用户名或 instagram.com/xxx'
  if (platform === 'twitter' || platform === 'x') return '用户名或 x.com/xxx'
  return 'UID 或 weibo.com/u/数字'
}

/** Visible preview: middle dot for spaces so users can spot bad handles. */
export function formatUserIdPreview(value) {
  return String(value || '')
    .replace(/ /g, '·')
    .replace(/\t/g, '→')
}

export function hasInvalidHandleChars(value, platform) {
  const text = String(value || '')
  if (!text) return false
  if (platform === 'instagram' || platform === 'twitter' || platform === 'x') {
    return /\s/.test(text)
  }
  return false
}
