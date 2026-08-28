import { describe, expect, it } from 'vitest'
import { localAssetUrl } from './assetUrl.js'

describe('localAssetUrl', () => {
  it('returns empty for missing path', () => {
    expect(localAssetUrl('')).toBe('')
    expect(localAssetUrl(undefined)).toBe('')
  })

  it('encodes the filesystem path in the custom protocol', () => {
    const url = localAssetUrl('D:\\archives\\weibo\\123\\_avatar.jpg')
    expect(url.startsWith('social-archiver://asset/?path=')).toBe(true)
    expect(url).toContain(encodeURIComponent('D:\\archives\\weibo\\123\\_avatar.jpg'))
  })
})
