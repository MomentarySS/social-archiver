import { describe, expect, it } from 'vitest'
import { normalizeUserId, userIdPlaceholder, formatUserIdPreview, hasInvalidHandleChars } from './userId.js'

describe('normalizeUserId', () => {
  it('strips leading @ for instagram', () => {
    expect(normalizeUserId('@taeyeon_ss', 'instagram')).toBe('taeyeon_ss')
  })

  it('converts spaces to underscore for instagram handles', () => {
    expect(normalizeUserId('taeyeon ss', 'instagram')).toBe('taeyeon_ss')
  })

  it('preserves underscores for instagram handles', () => {
    expect(normalizeUserId('taeyeon_ss', 'instagram')).toBe('taeyeon_ss')
  })

  it('collapses repeated underscores', () => {
    expect(normalizeUserId('taeyeon__ss', 'instagram')).toBe('taeyeon_ss')
  })

  it('does not rewrite weibo numeric ids', () => {
    expect(normalizeUserId('123 456', 'weibo')).toBe('123 456')
  })

  it('strips trailing underscores for instagram handles', () => {
    expect(normalizeUserId('taeyeon_ss_', 'instagram')).toBe('taeyeon_ss')
  })

  it('formats preview with visible space markers', () => {
    expect(formatUserIdPreview('taeyeon ss')).toBe('taeyeon·ss')
    expect(formatUserIdPreview('taeyeon_ss')).toBe('taeyeon_ss')
  })

  it('detects invalid handle spaces', () => {
    expect(hasInvalidHandleChars('taeyeon ss', 'instagram')).toBe(true)
    expect(hasInvalidHandleChars('taeyeon_ss', 'instagram')).toBe(false)
  })

  it('extracts X handle from profile URL', () => {
    expect(normalizeUserId('https://x.com/elonmusk', 'twitter')).toBe('elonmusk')
    expect(normalizeUserId('https://twitter.com/elonmusk?s=20', 'twitter')).toBe('elonmusk')
    expect(normalizeUserId('x.com/@amd', 'twitter')).toBe('amd')
  })

  it('extracts Instagram handle from profile URL', () => {
    expect(normalizeUserId('https://www.instagram.com/taeyeon_ss/', 'instagram')).toBe('taeyeon_ss')
    expect(normalizeUserId('instagram.com/taeyeon_ss/reels', 'instagram')).toBe('taeyeon_ss')
  })

  it('extracts Weibo UID from profile URL', () => {
    expect(normalizeUserId('https://weibo.com/u/1234567890', 'weibo')).toBe('1234567890')
    expect(normalizeUserId('https://m.weibo.cn/profile/1195230310', 'weibo')).toBe('1195230310')
    expect(normalizeUserId('weibo.com/1195230310', 'weibo')).toBe('1195230310')
  })

  it('does not treat another platform URL as this platform id', () => {
    expect(normalizeUserId('https://x.com/elonmusk', 'weibo')).toBe('https://x.com/elonmusk')
    expect(normalizeUserId('https://weibo.com/u/123', 'instagram')).toBe('https://weibo.com/u/123')
  })

  it('ignores X reserved paths', () => {
    expect(normalizeUserId('https://x.com/home', 'twitter')).toBe('https://x.com/home')
    expect(normalizeUserId('https://x.com/i/web/status/1', 'twitter')).toBe('https://x.com/i/web/status/1')
  })
})
