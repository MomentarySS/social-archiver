const WEIBO_TOPIC = /#([^#\s，,。！？；;：:【】\[\]()（）<>《》「」『』]+)#?/g
const GENERIC_TAG = /#([\w\u4e00-\u9fff][\w\u4e00-\u9fff_-]{0,48})/g

function extractHashtags(text) {
  const raw = String(text || '')
  if (!raw.includes('#')) return []
  const found = new Set()
  for (const match of raw.matchAll(WEIBO_TOPIC)) {
    const tag = String(match[1] || '').trim()
    if (tag) found.add(tag)
  }
  if (!found.size) {
    for (const match of raw.matchAll(GENERIC_TAG)) {
      const tag = String(match[1] || '').trim()
      if (tag) found.add(tag)
    }
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function collectHashtagsFromPosts(posts) {
  const counts = new Map()
  for (const post of posts || []) {
    for (const tag of extractHashtags(post?.text)) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
    for (const tag of Array.isArray(post?.tags) ? post.tags : []) {
      const normalized = String(tag || '').replace(/^#/, '').trim()
      if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'))
}

function postMatchesHashtag(post, hashtag) {
  const target = String(hashtag || '').replace(/^#/, '').trim()
  if (!target) return true
  const tags = extractHashtags(post?.text)
  if (tags.some((tag) => tag === target)) return true
  const metaTags = Array.isArray(post?.tags) ? post.tags : []
  return metaTags.some((tag) => String(tag || '').replace(/^#/, '').trim() === target)
}

function filterPostsByHashtag(posts, hashtag) {
  const target = String(hashtag || '').trim()
  if (!target) return posts || []
  return (posts || []).filter((post) => postMatchesHashtag(post, target))
}

export {
  extractHashtags,
  collectHashtagsFromPosts,
  postMatchesHashtag,
  filterPostsByHashtag,
}
