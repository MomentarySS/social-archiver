export const OPEN_TAB_EVENT = 'sa:open-tab'
export const OPEN_POST_EVENT = 'sa:open-post'

export interface OpenPostDetail {
  userDir: string
  postId: string
  highlightQuery?: string
}

export function requestOpenTab(tab: 'download' | 'browse' | 'settings') {
  window.dispatchEvent(new CustomEvent(OPEN_TAB_EVENT, { detail: { tab } }))
}

export function requestOpenPost(detail: OpenPostDetail) {
  requestOpenTab('browse')
  window.dispatchEvent(new CustomEvent(OPEN_POST_EVENT, { detail }))
}
