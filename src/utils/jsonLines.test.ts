import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createJsonLineParser } = require('../../json-lines.js')
const { applySettingsPatch } = require('../../settings-merge.js')

describe('createJsonLineParser', () => {
  it('reassembles JSON split across chunks', () => {
    const events: unknown[] = []
    const raw: string[] = []
    const parser = createJsonLineParser((evt: unknown) => events.push(evt), (line: string) => raw.push(line))
    parser.push('{"type":"do')
    parser.push('ne","posts":2}\n')
    expect(events).toEqual([{ type: 'done', posts: 2 }])
    expect(raw).toEqual([])
  })

  it('flushes a trailing line without newline', () => {
    const events: unknown[] = []
    const parser = createJsonLineParser((evt: unknown) => events.push(evt))
    parser.push('{"type":"status","msg":"ok"}')
    expect(events).toEqual([])
    parser.flush()
    expect(events).toEqual([{ type: 'status', msg: 'ok' }])
  })

  it('forwards non-JSON as raw text', () => {
    const raw: string[] = []
    const parser = createJsonLineParser(() => {}, (line: string) => raw.push(line))
    parser.push('not json\n')
    expect(raw).toEqual(['not json'])
  })
})

describe('applySettingsPatch', () => {
  it('merges cookies without dropping sibling keys', () => {
    const next = applySettingsPatch(
      { output_dir: 'D:/a', cookies: { weibo: 'SUB=1', per_user: { 'twitter:amd': 't1' } } },
      { cookies: { twitter: 'auth_token=x' } },
    )
    expect(next.output_dir).toBe('D:/a')
    expect(next.cookies.weibo).toBe('SUB=1')
    expect(next.cookies.twitter).toBe('auth_token=x')
    expect(next.cookies.per_user['twitter:amd']).toBe('t1')
  })

  it('deletes a per-user cookie when patched to empty', () => {
    const next = applySettingsPatch(
      { cookies: { per_user: { 'weibo:1': 'SUB=1', 'weibo:2': 'SUB=2' } } },
      { cookies: { per_user: { 'weibo:1': '' } } },
    )
    expect(next.cookies.per_user['weibo:1']).toBeUndefined()
    expect(next.cookies.per_user['weibo:2']).toBe('SUB=2')
  })

  it('keeps cookies when patching unrelated fields', () => {
    const next = applySettingsPatch(
      { cookies: { weibo: 'SUB=1' }, concurrent: 3 },
      { concurrent: 5 },
    )
    expect(next.concurrent).toBe(5)
    expect(next.cookies.weibo).toBe('SUB=1')
  })
})
