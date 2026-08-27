export function platformCookieKey(platform) {
  if (platform === 'weibo' || platform === 'instagram') return platform
  return 'twitter'
}

export function cookieForPlatform(settings, platform) {
  const cookies = settings?.cookies || {}
  return cookies[platformCookieKey(platform)] || ''
}

export function hasUsableCookie(platform, cookie) {
  const value = String(cookie || '').trim()
  if (!value) return false
  if (platform === 'twitter') return /(?:^|;\s*)auth_token=/.test(value)
  if (platform === 'instagram') return /(?:^|;\s*)sessionid=/.test(value)
  return value.length > 8
}

export async function patchSettings(partial) {
  if (!window.electronAPI) return
  const current = await window.electronAPI.getSettings()
  await window.electronAPI.saveSettings({ ...current, ...partial })
}

export async function savePlatformCookie(platform, cookie) {
  if (!window.electronAPI || !cookie) return
  const current = await window.electronAPI.getSettings()
  const cookies = { ...(current.cookies || {}) }
  cookies[platformCookieKey(platform)] = cookie
  await window.electronAPI.saveSettings({ ...current, cookies })
}
