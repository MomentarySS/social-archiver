import { describe, expect, it } from 'vitest'
import { sortPosts, postTimeMs } from './postTime.js'

const T1 = '2024-01-15T10:00:00Z'
const T2 = '2024-06-20T14:30:00Z'
const T3 = '2024-12-01T08:00:00Z'

describe('postTimeMs', () => {
  it('parses ISO date strings', () => {
    expect(postTimeMs({ created_at: T1 })).toBe(new Date(T1).getTime())
    expect(postTimeMs({ date: T2 })).toBe(new Date(T2).getTime())
  })

  it('parses unix timestamps (seconds)', () => {
    const ts = Math.floor(new Date(T1).getTime() / 1000)
    expect(postTimeMs({ created_at: String(ts) })).toBe(new Date(T1).getTime())
  })

  it('parses unix timestamps (milliseconds)', () => {
    const ms = new Date(T1).getTime()
    expect(postTimeMs({ created_at: String(ms) })).toBe(ms)
  })

  it('returns 0 for missing data', () => {
    expect(postTimeMs({})).toBe(0)
    expect(postTimeMs({ created_at: '' })).toBe(0)
  })
})

describe('sortPosts', () => {
  it('sorts newest first by default', () => {
    const posts = [
      { id: 'c', created_at: T1 },
      { id: 'a', created_at: T3 },
      { id: 'b', created_at: T2 },
    ]
    const result = sortPosts(posts, 'newest')
    expect(result.map((p: { id: string }) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts oldest first when order is "oldest"', () => {
    const posts = [
      { id: 'c', created_at: T1 },
      { id: 'a', created_at: T3 },
      { id: 'b', created_at: T2 },
    ]
    const result = sortPosts(posts, 'oldest')
    expect(result.map((p: { id: string }) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate the original array', () => {
    const posts = [
      { id: 'c', created_at: T1 },
      { id: 'a', created_at: T3 },
    ]
    sortPosts(posts, 'newest')
    expect(posts[0].id).toBe('c')
  })

  it('handles empty array', () => {
    expect(sortPosts([], 'newest')).toEqual([])
  })

  it('handles null/undefined input gracefully', () => {
    expect(sortPosts(null as any, 'newest')).toEqual([])
    expect(sortPosts(undefined as any, 'newest')).toEqual([])
  })

  it('stable-sort: does not move equal timestamps relative to each other', () => {
    // Two posts with identical timestamps; sort should be stable (original order preserved)
    const posts = [
      { id: 'first', created_at: T1 },
      { id: 'second', created_at: T1 },
      { id: 'third', created_at: T2 },
    ]
    const result = sortPosts(posts, 'newest')
    // T2 (newest) should be first; the two T1 posts keep their relative order
    expect(result[0].id).toBe('third')
    // 'zz' sorts after 'aa' with localeCompare(numeric:true) → zz comes after aa
    // in the tiebreak, 'aa' (first) stays before 'zz' (second)
    expect(result[1].id).toBe('second')
    expect(result[2].id).toBe('first')
  })
})
