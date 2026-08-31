import { PLATFORM_LABELS, normalizePlatform } from '../constants'

export function platformCookieKey(platform) {
  if (platform === 'weibo' || platform === 'instagram') return platform
  return 'twitter'
}

export function cookieForPlatform(settings, platform) {
  const cookies = settings?.cookies || {}
  return cookies[platformCookieKey(platform)] || ''
}

export function userCookieKey(platform, userId) {
  return `${platform}:${userId}`
}

export function cookieForUser(settings, platform, userId) {
  const perUser = settings?.cookies?.per_user?.[userCookieKey(platform, userId)]
  if (perUser) return perUser
  return cookieForPlatform(settings, platform)
}

export function hasUsableCookie(platform, cookie) {
  const value = String(cookie || '').trim()
  if (!value) return false
  if (platform === 'weibo') {
    return /\bSUB=/.test(value) || (!value.includes('=') && !value.includes(';'))
  }
  if (platform === 'twitter') {
    return /(?:^|;\s*)auth_token=/i.test(value) && /(?:^|;\s*)ct0=/i.test(value)
  }
  if (platform === 'instagram') {
    return /(?:^|;\s*)sessionid=/i.test(value) || (!value.includes('=') && !value.includes(';'))
  }
  return true
}

export function maskCookie(cookie) {
  const value = String(cookie || '').trim()
  if (!value) return ''
  if (value.length <= 12) return '••••'
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

export function perUserCookiesForPlatform(settings, platform) {
  const prefix = `${platform}:`
  const perUser = settings?.cookies?.per_user || {}
  return Object.entries(perUser)
    .filter(([key, value]) => key.startsWith(prefix) && value)
    .map(([, value]) => String(value))
}

export function effectivePlatformCookie(settings, platform) {
  const platformCookie = cookieForPlatform(settings, platform)
  if (platformCookie) return platformCookie
  return perUserCookiesForPlatform(settings, platform)[0] || ''
}

export function cookieInventory(settings) {
  const cookies = settings?.cookies || {}
  const platformRows = [
    { platform: 'weibo', label: PLATFORM_LABELS.weibo },
    { platform: 'twitter', label: PLATFORM_LABELS.twitter },
    { platform: 'instagram', label: PLATFORM_LABELS.instagram },
  ].map((row) => {
    const platformValue = cookies[row.platform] || ''
    const userValues = perUserCookiesForPlatform(settings, row.platform)
    const value = platformValue || userValues[0] || ''
    const sourceUserId = !platformValue && userValues[0]
      ? (Object.entries(cookies.per_user || {}).find(([, v]) => v === userValues[0])?.[0]?.split(':')[1] || '')
      : ''
    return {
      kind: 'platform',
      platform: row.platform,
      label: row.label,
      userId: '',
      key: row.platform,
      value,
      sourceUserId,
    }
  })
  const userRows = Object.entries(cookies.per_user || {}).map(([key, value]) => {
    const idx = key.indexOf(':')
    const platform = normalizePlatform(idx >= 0 ? key.slice(0, idx) : key)
    const userId = idx >= 0 ? key.slice(idx + 1) : ''
    return {
      kind: 'user',
      platform,
      label: `${PLATFORM_LABELS[platform] || platform} @${userId}`,
      userId,
      key,
      value: String(value || ''),
    }
  })
  return { platformRows, userRows }
}

export async function patchSettings(partial) {
  if (!window.electronAPI) return
  await window.electronAPI.saveSettings(partial)
}

export async function savePlatformCookie(platform, cookie) {
  if (!window.electronAPI) return
  await patchSettings({ cookies: { [platformCookieKey(platform)]: cookie || '' } })
}

export async function saveUserCookie(platform, userId, cookie) {
  if (!window.electronAPI) return
  await patchSettings({
    cookies: {
      per_user: { [userCookieKey(platform, userId)]: cookie || '' },
    },
  })
}

export async function clearPlatformCookie(platform) {
  await savePlatformCookie(platform, '')
}

export async function clearUserCookie(platform, userId) {
  await saveUserCookie(platform, userId, '')
}
