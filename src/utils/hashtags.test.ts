import { describe, expect, it } from 'vitest'
import {
  collectHashtagsFromPosts,
  extractHashtags,
  filterPostsByHashtag,
} from './hashtags.js'

describe('hashtags', () => {
  it('extracts weibo-style topics', () => {
    expect(extractHashtags('今天 #旅行日记# 很开心')).toEqual(['旅行日记'])
  })

  it('extracts generic hash tags', () => {
    expect(extractHashtags('hello #photo and #日常')).toEqual(['日常', 'photo'])
  })

  it('collects and sorts hashtag counts', () => {
    const posts = [
      { text: '#A# 第一次' },
      { text: '#B# 第二次' },
      { text: '#A# 又一次' },
    ]
    expect(collectHashtagsFromPosts(posts)).toEqual([
      { tag: 'A', count: 2 },
      { tag: 'B', count: 1 },
    ])
  })

  it('filters posts by selected hashtag', () => {
    const posts = [
      { id: '1', text: '#foo# one' },
      { id: '2', text: 'plain' },
      { id: '3', text: '#bar# two' },
    ]
    expect(filterPostsByHashtag(posts, 'foo').map((p) => p.id)).toEqual(['1'])
  })
})
