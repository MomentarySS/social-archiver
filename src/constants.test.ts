import { describe, expect, it } from 'vitest'
import { normalizePlatform } from './constants'

describe('normalizePlatform', () => {
  it('maps twitter and x to twitter', () => {
    expect(normalizePlatform('twitter')).toBe('twitter')
    expect(normalizePlatform('x')).toBe('twitter')
    expect(normalizePlatform('X')).toBe('twitter')
  })

  it('maps instagram and weibo', () => {
    expect(normalizePlatform('instagram')).toBe('instagram')
    expect(normalizePlatform('weibo')).toBe('weibo')
  })

  it('uses fallback when value is empty', () => {
    expect(normalizePlatform('', 'twitter')).toBe('twitter')
    expect(normalizePlatform(undefined, 'instagram')).toBe('instagram')
    expect(normalizePlatform(null)).toBe('weibo')
  })

  it('does not treat a truthy weibo/instagram value as twitter', () => {
    expect(normalizePlatform('weibo', 'twitter')).toBe('weibo')
    expect(normalizePlatform('instagram', 'twitter')).toBe('instagram')
  })
})
