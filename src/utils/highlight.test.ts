import { describe, expect, it } from 'vitest'
import { highlightSnippet, highlightText } from './highlight.ts'

describe('highlight', () => {
  it('wraps matched text in mark tags', () => {
    const html = highlightText('你好世界', '世界')
    expect(html).toContain('<mark class="sa-search-mark">世界</mark>')
  })

  it('builds snippet with highlight', () => {
    const html = highlightSnippet('这是一段关于 Social Archiver 的测试文本', 'Archiver')
    expect(html).toContain('sa-search-mark')
    expect(html).toContain('Archiver')
  })
})
