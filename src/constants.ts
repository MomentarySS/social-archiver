export const PLATFORMS = ['twitter', 'weibo', 'instagram'] as const
export type Platform = typeof PLATFORMS[number]

export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'X',
  weibo: '微博',
  instagram: 'Instagram',
}

export const PLATFORM_COOKIE_KEYS: Record<Platform, string> = {
  twitter: 'twitter',
  weibo: 'weibo',
  instagram: 'instagram',
}

export function normalizePlatform(value?: string | null, fallback: Platform = 'weibo'): Platform {
  const p = String(value || fallback || '').toLowerCase()
  if (p === 'twitter' || p === 'x') return 'twitter'
  if (p === 'instagram') return 'instagram'
  if (p === 'weibo') return 'weibo'
  return fallback
}
