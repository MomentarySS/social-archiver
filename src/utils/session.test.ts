import { describe, expect, it } from 'vitest'
import {
  userCookieKey,
  cookieForUser,
  cookieForPlatform,
  hasUsableCookie,
} from './session.js'

const mockSettings = (cookies: Record<string, unknown>) => ({ cookies })

describe('userCookieKey', () => {
  it('formats key as platform:userId', () => {
    expect(userCookieKey('twitter', 'amd')).toBe('twitter:amd')
    expect(userCookieKey('instagram', 'john')).toBe('instagram:john')
    expect(userCookieKey('weibo', '123456')).toBe('weibo:123456')
  })
})

describe('cookieForUser', () => {
  it('returns per-user cookie when present', () => {
    const settings = mockSettings({
      per_user: { 'twitter:amd': 'token_amd', 'instagram:john': 'session_john' },
    }) as any
    expect(cookieForUser(settings, 'twitter', 'amd')).toBe('token_amd')
    expect(cookieForUser(settings, 'instagram', 'john')).toBe('session_john')
  })

  it('falls back to platform cookie when per-user not found', () => {
    // Mock has platform-level 'instagram' cookie but not per_user for 'anyone'
    const settings = mockSettings({
      instagram: 'platform_ig_cookie',
      per_user: { 'instagram:john': 'session_john' },
    }) as any
    // 'instagram:anyone' is not in per_user, so falls back to platform instagram cookie
    expect(cookieForUser(settings, 'instagram', 'anyone')).toBe('platform_ig_cookie')
  })

  it('returns empty string when neither per-user nor platform cookie exists', () => {
    const settings = mockSettings({}) as any
    expect(cookieForUser(settings, 'twitter', 'anyone')).toBe('')
  })
})

describe('cookieForPlatform', () => {
  it('returns the platform cookie', () => {
    const settings = mockSettings({ twitter: 'tok123', weibo: 'wb456' }) as any
    expect(cookieForPlatform(settings, 'twitter')).toBe('tok123')
    expect(cookieForPlatform(settings, 'weibo')).toBe('wb456')
  })

  it('returns empty string when platform cookie not set', () => {
    const settings = mockSettings({}) as any
    expect(cookieForPlatform(settings, 'twitter')).toBe('')
  })
})

describe('hasUsableCookie', () => {
  it('returns true for non-empty cookie strings', () => {
    expect(hasUsableCookie('twitter', 'auth_token=abc')).toBe(true)
    expect(hasUsableCookie('instagram', 'sessionid=xyz')).toBe(true)
    expect(hasUsableCookie('weibo', 'some_cookie_value')).toBe(true)
  })

  it('returns false for empty or falsy values', () => {
    expect(hasUsableCookie('twitter', '')).toBe(false)
    expect(hasUsableCookie('twitter', undefined as any)).toBe(false)
    expect(hasUsableCookie('instagram', '   ')).toBe(false)
  })

  it('returns false for strings without required cookie marker', () => {
    // Twitter requires auth_token marker
    expect(hasUsableCookie('twitter', 'just_some_text')).toBe(false)
    // Instagram requires sessionid marker
    expect(hasUsableCookie('instagram', 'cookie_without_sessionid')).toBe(false)
    // Cookie must be > 8 chars (weibo)
    expect(hasUsableCookie('weibo', 'short=12')).toBe(false)
    expect(hasUsableCookie('weibo', 'A=123456')).toBe(false) // exactly 8 chars — not > 8
    expect(hasUsableCookie('weibo', 'A=1234567')).toBe(true) // 9 chars
  })
})
