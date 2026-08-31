/** Normalize platform user handles before cache / save. */

const UNICODE_SPACES = /[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\uFEFF]/g
const UNICODE_UNDERSCORES = /[\uFF3F\u2017\uFE33\uFE34\u02CD\u02F8]/g

export function normalizeUserId(value, platform) {
  let text = String(value || '').trim()
  if (!text) return ''

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
  if (platform === 'instagram') return '如 taeyeon_ss'
  if (platform === 'twitter' || platform === 'x') return '如 elonmusk'
  return '如 1234567890'
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
