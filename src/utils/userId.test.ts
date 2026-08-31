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
})
