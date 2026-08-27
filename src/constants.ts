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
