import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  scanArchives,
  loadPostsFromUserDir,
  loadAllPosts,
  isTwitterDerivativeUser,
  twitterDisplayName,
} = require('../electron-archives.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(__dirname, 'fixtures/archive')
const weiboUserDir = path.join(fixtureRoot, 'weibo', 'fixture_user')

describe('electron-archives (fixture IPC chain)', () => {
  it('scan-archives lists users with platform and display metadata', () => {
    const users = scanArchives(fixtureRoot)
    expect(users.length).toBeGreaterThanOrEqual(2)
    const weibo = users.find((u) => u.name === 'fixture_user')
    expect(weibo).toBeTruthy()
    expect(weibo.platform).toBe('weibo')
    expect(weibo.displayName).toContain('测试用户')
    expect(weibo.path).toBe(weiboUserDir)
  })

  it('get-posts loads and sorts posts newest first with archive labels', () => {
    const posts = loadPostsFromUserDir(weiboUserDir)
    expect(posts).toHaveLength(2)
    expect(posts[0].id).toBe('1002')
    expect(posts[1].id).toBe('1001')
    expect(posts[0]._archiveUserDir).toBe(weiboUserDir)
    expect(posts[0]._archiveUserLabel).toBe('测试用户')
    expect(posts[0].user_name).toBe('测试用户')
  })

  it('get-all-posts merges users across platforms', () => {
    const posts = loadAllPosts(fixtureRoot)
    expect(posts.length).toBeGreaterThanOrEqual(3)
    const platforms = new Set(posts.map((p) => p.platform))
    expect(platforms.has('weibo')).toBe(true)
    expect(platforms.has('twitter')).toBe(true)
  })

  it('scan-archives brief mode returns scheduler fields only', () => {
    const users = scanArchives(fixtureRoot, { brief: true })
    const weibo = users.find((u) => u.name === 'fixture_user')
    expect(weibo).toMatchObject({
      name: 'fixture_user',
      path: weiboUserDir,
      platform: 'weibo',
    })
    expect(weibo.displayName).toBeUndefined()
  })

  it('twitter derivative user helpers', () => {
    expect(isTwitterDerivativeUser('alice--bookmarks')).toBe(true)
    expect(twitterDisplayName(
      { name: 'alice--bookmarks', platform: 'twitter' },
      { platform: 'twitter', baseUserId: 'alice' },
    )).toContain('书签')
  })
})
