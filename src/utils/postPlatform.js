import { normalizePlatform } from '../constants'

export function detectPostPlatform(post, fallbackUser) {
  const fromPost = String(post?.platform || '').toLowerCase()
  if (fromPost) return normalizePlatform(fromPost)

  const fromUser = String(fallbackUser?.platform || '').toLowerCase()
  if (fromUser) return normalizePlatform(fromUser)

  const url = post?.url || ''
  if (/x\.com|twitter\.com/i.test(url)) return 'twitter'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return 'weibo'
}
