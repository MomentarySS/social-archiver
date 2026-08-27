import { describe, expect, it } from 'vitest'
import { detectSkin } from './archiveHtml.js'

describe('detectSkin', () => {
  it('returns twitter for platform twitter', () => {
    expect(detectSkin([], 'twitter')).toBe('twitter')
  })

  it('returns twitter for platform x', () => {
    expect(detectSkin([], 'x')).toBe('twitter')
  })

  it('returns instagram for platform instagram', () => {
    expect(detectSkin([], 'instagram')).toBe('instagram')
  })

  it('returns weibo for platform weibo', () => {
    expect(detectSkin([], 'weibo')).toBe('weibo')
  })

  it('returns twitter for x.com URL in first post', () => {
    expect(detectSkin([{ id: '1', url: 'https://x.com/user/status/123' }], '')).toBe('twitter')
  })

  it('returns twitter for twitter.com URL in first post', () => {
    expect(detectSkin([{ id: '1', url: 'https://twitter.com/user/status/123' }], '')).toBe('twitter')
  })

  it('returns instagram for instagram.com URL in first post', () => {
    expect(detectSkin([{ id: '1', url: 'https://instagram.com/p/abc' }], '')).toBe('instagram')
  })

  it('returns weibo as default fallback', () => {
    expect(detectSkin([{ id: '1', url: '' }], '')).toBe('weibo')
  })

  it('prefers explicit platform over URL detection', () => {
    expect(detectSkin([{ id: '1', url: 'https://x.com/user/status/123' }], 'instagram')).toBe('instagram')
  })
})
