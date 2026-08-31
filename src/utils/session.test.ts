import { describe, expect, it } from 'vitest'
import { hasUsableCookie } from './session.js'

describe('hasUsableCookie', () => {
  it('accepts weibo SUB cookie or bare token', () => {
    expect(hasUsableCookie('weibo', 'SUB=abc')).toBe(true)
    expect(hasUsableCookie('weibo', 'abc123')).toBe(true)
    expect(hasUsableCookie('weibo', '')).toBe(false)
  })

  it('requires twitter auth_token and ct0', () => {
    expect(hasUsableCookie('twitter', 'auth_token=a; ct0=b')).toBe(true)
    expect(hasUsableCookie('twitter', 'auth_token=a')).toBe(false)
    expect(hasUsableCookie('twitter', 'ct0=b')).toBe(false)
  })

  it('accepts instagram sessionid or bare token', () => {
    expect(hasUsableCookie('instagram', 'sessionid=abc')).toBe(true)
    expect(hasUsableCookie('instagram', 'abc123')).toBe(true)
    expect(hasUsableCookie('instagram', '')).toBe(false)
  })
})
