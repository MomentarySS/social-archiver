import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-expect-error CommonJS helper
import { buildFeedXml, exportUserRss } from '../../electron-rss.js'

describe('export rss', () => {
  it('builds valid rss xml', () => {
    const xml = buildFeedXml({
      title: 'Demo',
      link: 'https://example.com',
      description: 'test feed',
      posts: [{
        id: '1',
        title: 'Hello',
        description: 'World',
        link: 'https://example.com/1',
        pubDateMs: Date.parse('2024-06-15T10:00:00Z'),
        platform: 'weibo',
      }],
    })
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('<title>Hello</title>')
    expect(xml).toContain('<category>weibo</category>')
  })

  it('exports feed.xml into user directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-rss-'))
    const userDir = path.join(tmp, 'u1')
    const postsDir = path.join(userDir, '_posts', '2024-06-15')
    fs.mkdirSync(postsDir, { recursive: true })
    fs.writeFileSync(path.join(postsDir, '123.json'), JSON.stringify({
      id: '123',
      date: '2024-06-15',
      platform: 'weibo',
      text: 'RSS 测试',
      url: 'https://weibo.com/1/123',
    }), 'utf8')
    const result = exportUserRss(userDir, '')
    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(fs.existsSync(path.join(userDir, 'feed.xml'))).toBe(true)
  })
})
