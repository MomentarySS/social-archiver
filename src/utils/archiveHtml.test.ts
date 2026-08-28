import { describe, expect, it } from 'vitest'
import { buildArchiveHtml } from './archiveHtml.js'
import { detectPostPlatform } from './postPlatform.js'

describe('detectPostPlatform', () => {
  it('returns twitter for platform twitter', () => {
    expect(detectPostPlatform({}, { platform: 'twitter' })).toBe('twitter')
  })

  it('returns twitter for platform x', () => {
    expect(detectPostPlatform({}, { platform: 'x' })).toBe('twitter')
  })

  it('returns instagram for platform instagram', () => {
    expect(detectPostPlatform({}, { platform: 'instagram' })).toBe('instagram')
  })

  it('returns weibo for platform weibo', () => {
    expect(detectPostPlatform({}, { platform: 'weibo' })).toBe('weibo')
  })

  it('returns twitter for x.com URL in first post', () => {
    expect(detectPostPlatform({ url: 'https://x.com/user/status/123' })).toBe('twitter')
  })

  it('returns instagram for instagram.com URL in first post', () => {
    expect(detectPostPlatform({ url: 'https://instagram.com/p/abc' })).toBe('instagram')
  })

  it('returns weibo as default fallback', () => {
    expect(detectPostPlatform({ url: '' })).toBe('weibo')
  })

  it('prefers explicit platform over URL detection', () => {
    expect(detectPostPlatform(
      { url: 'https://x.com/user/status/123', platform: 'instagram' },
      { platform: 'instagram' },
    )).toBe('instagram')
  })
})

describe('buildArchiveHtml', () => {
  it('renders instagram posts with handle and unified theme tokens', () => {
    const html = buildArchiveHtml({
      posts: [{
        id: '1',
        platform: 'instagram',
        user_name: 'Ada',
        screen_name: 'ada',
        text: 'hello @bob #tag',
        url: 'https://www.instagram.com/p/abc',
      }],
      userName: 'Ada',
      handle: 'ada',
      platform: 'instagram',
      theme: 'light',
    })
    expect(html).toContain('@ada')
    expect(html).toContain('查看原文')
    expect(html).toContain('--accent: #2563eb')
    expect(html).toContain('class="entity"')
    expect(html).toContain('id="sa-theme-toggle"')
    expect(html).not.toContain('来自')
  })

  it('embeds dark theme when requested', () => {
    const html = buildArchiveHtml({
      posts: [{ id: '1', platform: 'weibo', text: 'hi' }],
      userName: 'Test',
      handle: 'test',
      platform: 'weibo',
      theme: 'dark',
    })
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('--bg: #09090b')
  })
})
