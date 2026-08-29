import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-expect-error CommonJS helper
import { exportUserJson } from '../../electron-export-json.js'

describe('export json', () => {
  it('exports posts into a single json file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-json-'))
    const userDir = path.join(tmp, 'u1')
    const postsDir = path.join(userDir, '_posts', '2024-06-15')
    fs.mkdirSync(postsDir, { recursive: true })
    fs.writeFileSync(path.join(postsDir, '123.json'), JSON.stringify({
      id: '123',
      date: '2024-06-15',
      platform: 'weibo',
      text: '测试',
    }), 'utf8')
    const result = exportUserJson(userDir, '')
    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
    expect(fs.readdirSync(userDir).some((f) => f.startsWith('export-u1-') && f.endsWith('.json'))).toBe(true)
  })
})
