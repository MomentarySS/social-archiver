import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { CookieValidationStore, DEFAULT_TTL_MS } = require('../electron/cookie-validation.js')

describe('CookieValidationStore', () => {
  it('returns false for an unknown cookie', () => {
    const store = new CookieValidationStore()
    expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(false)
  })

  it('returns true within the window after markValid', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
    expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(true)
  })

  it('treats cookies with the same content as the same entry', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
    expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(true)
  })

  it('returns false for a different cookie value under the same key', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
    expect(store.isFresh('twitter', 'alice', 'auth_token=x; ct0=y')).toBe(false)
  })

  it('expires entries past the TTL', () => {
    vi.useFakeTimers()
    try {
      const store = new CookieValidationStore(1_000)
      store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
      expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(true)
      vi.advanceTimersByTime(1_500)
      expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('honors per-call ttlMs override when shorter than the default', () => {
    vi.useFakeTimers()
    try {
      const store = new CookieValidationStore(60_000)
      store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
      vi.advanceTimersByTime(5)
      expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b', 10)).toBe(true)
      expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b', 3)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('invalidate clears only the matching platform', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
    store.markValid('instagram', 'bob', 'sessionid=x')
    store.invalidatePlatform('twitter')
    expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(false)
    expect(store.isFresh('instagram', 'bob', 'sessionid=x')).toBe(true)
  })

  it('invalidate clears only the matching user on a platform', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('twitter', 'alice', 'auth_token=a; ct0=b')
    store.markValid('twitter', 'bob', 'auth_token=c; ct0=d')
    store.invalidate('twitter', 'alice')
    expect(store.isFresh('twitter', 'alice', 'auth_token=a; ct0=b')).toBe(false)
    expect(store.isFresh('twitter', 'bob', 'auth_token=c; ct0=d')).toBe(true)
  })

  it('ignores empty inputs gracefully', () => {
    const store = new CookieValidationStore(60_000)
    store.markValid('', 'alice', 'sessionid=x')
    store.markValid('instagram', '', '')
    expect(store.isFresh('', '', '')).toBe(false)
  })

  it('default TTL is 30 minutes', () => {
    expect(DEFAULT_TTL_MS).toBe(30 * 60 * 1000)
  })
})