import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-expect-error CommonJS helper
import { exportUserMarkdown, postMarkdown, buildTags } from '../../electron-export-md.js'

describe('export markdown', () => {
  it('builds front matter, tags, and media links', () => {
    const md = postMarkdown({
      id: '123',
      date: '2024-06-15',
      platform: 'weibo',
      kind: 'text',
      url: 'https://weibo.com/1/123',
      text: '你好<br/>世界 #测试',
      pics: [{ date_folder: '2024-06-15', filename: '123_1.jpg', type: 'image' }],
    }, 'C:/archives/weibo/u1')
    expect(md).toContain('id: "123"')
    expect(md).toContain('title: "你好 世界 #测试"')
    expect(md).toContain('kind: "text"')
    expect(md).toContain('tags:')
    expect(md).toContain('  - social-archiver')
    expect(md).toContain('  - weibo')
    expect(md).toContain('  - 测试')
    expect(md).toContain('你好')
    expect(md).toContain('世界')
    expect(md).toContain('../../2024-06-15/123_1.jpg')
  })

  it('collects tags from platform and kind', () => {
    const tags = buildTags({ platform: 'twitter', kind: 'reply', text: '#AI' })
    expect(tags).toContain('social-archiver')
    expect(tags).toContain('twitter')
    expect(tags).toContain('reply')
    expect(tags).toContain('AI')
  })

  it('exports files into export-md/{year}/{date}/ directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-md-'))
    const userDir = path.join(tmp, 'u1')
    const postsDir = path.join(userDir, '_posts', '2024-06-15')
    fs.mkdirSync(postsDir, { recursive: true })
    fs.writeFileSync(path.join(postsDir, '123.json'), JSON.stringify({
      id: '123',
      date: '2024-06-15',
      platform: 'weibo',
      text: '测试',
      pics: [],
    }), 'utf8')
    const result = exportUserMarkdown(userDir, '')
    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(fs.existsSync(path.join(userDir, 'export-md', '2024', '2024-06-15', '123.md'))).toBe(true)
  })
})
