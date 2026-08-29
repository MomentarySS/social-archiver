import { describe, expect, it } from 'vitest'
import { getPlatformAdapter, listPlatformAdapters } from '../platforms/registry'

describe('platform registry', () => {
  it('lists all adapters', () => {
    expect(listPlatformAdapters().map((item) => item.id)).toEqual(['twitter', 'weibo', 'instagram'])
  })

  it('resolves adapter by id', () => {
    expect(getPlatformAdapter('instagram').label).toBe('Instagram')
  })
})
