export function escapeHtml(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightText(text: string, query: string) {
  const q = String(query || '').trim()
  const safe = escapeHtml(text)
  if (!q) return safe
  const re = new RegExp(`(${escapeRegex(q)})`, 'gi')
  return safe.replace(re, '<mark class="sa-search-mark">$1</mark>')
}

export function highlightSnippet(text: string, query: string, maxLen = 120) {
  const q = String(query || '').trim()
  const plain = String(text || '')
  if (!q) return highlightText(plain.slice(0, maxLen), '')
  const lower = plain.toLowerCase()
  const lowerQ = q.toLowerCase()
  const idx = lower.indexOf(lowerQ)
  if (idx < 0) return highlightText(plain.slice(0, maxLen), q)
  const start = Math.max(0, idx - 40)
  const end = Math.min(plain.length, idx + q.length + 60)
  let snippet = plain.slice(start, end)
  if (start > 0) snippet = `…${snippet}`
  if (end < plain.length) snippet = `${snippet}…`
  return highlightText(snippet, q)
}

export function highlightInHtml(html: string, query: string) {
  const q = String(query || '').trim()
  if (!q || !html) return html
  const re = new RegExp(`(${escapeRegex(q)})`, 'gi')
  return html.replace(re, '<mark class="sa-search-mark">$1</mark>')
}
