import {
  PLATFORMS,
  PLATFORM_LABELS,
  PLATFORM_COOKIE_KEYS,
  normalizePlatform,
  type Platform,
} from '../constants'

export interface PlatformAdapter {
  id: Platform
  label: string
  cookieKey: string
  userIdHint: string
  cookieHint: string
}

export const PLATFORM_ADAPTERS: Record<Platform, PlatformAdapter> = {
  twitter: {
    id: 'twitter',
    label: PLATFORM_LABELS.twitter,
    cookieKey: PLATFORM_COOKIE_KEYS.twitter,
    userIdHint: '如 elonmusk',
    cookieHint: 'auth_token + ct0',
  },
  weibo: {
    id: 'weibo',
    label: PLATFORM_LABELS.weibo,
    cookieKey: PLATFORM_COOKIE_KEYS.weibo,
    userIdHint: '如 1234567890',
    cookieHint: '含 SUB 的 Cookie',
  },
  instagram: {
    id: 'instagram',
    label: PLATFORM_LABELS.instagram,
    cookieKey: PLATFORM_COOKIE_KEYS.instagram,
    userIdHint: '如 username',
    cookieHint: 'sessionid',
  },
}

export function getPlatformAdapter(platform?: string | null, fallback: Platform = 'weibo'): PlatformAdapter {
  return PLATFORM_ADAPTERS[normalizePlatform(platform, fallback)]
}

export function listPlatformAdapters(): PlatformAdapter[] {
  return PLATFORMS.map((id) => PLATFORM_ADAPTERS[id])
}

export { PLATFORMS, PLATFORM_LABELS, normalizePlatform, type Platform }
