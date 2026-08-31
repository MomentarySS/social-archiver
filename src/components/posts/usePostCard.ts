import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { groupLiveMedia } from '../../utils/livePhoto.js'
import { localAssetUrl } from '../../utils/assetUrl.js'
import { detectPostPlatform } from '../../utils/postPlatform.js'
import type { Pic, Post } from '../../electron-api.d.ts'

import { highlightInHtml } from '../../utils/highlight.ts'

export function usePostCard(props: { post: Post; highlightQuery?: string }) {
  const viewerVisible = ref(false)
  const viewerIndex = ref(0)
  const expandedIndex = ref<number | null>(null)
  const stillUrls = ref<string[]>([])
  const videoSrcUrls = ref<string[]>([])
  const posterUrls = ref<string[]>([])
  const videoUrls = ref<string[]>([])
  const avatarUrl = ref('')
  const expandVideo = ref<HTMLVideoElement | null>(null)
  const lightboxVideo = ref<HTMLVideoElement | null>(null)
  const brokenLive = ref<Set<number>>(new Set())
  const brokenVideo = ref<Set<number>>(new Set())

  const mediaItems = computed(() => groupLiveMedia(props.post.pics || []))

  const mediaSlots = computed(() => mediaItems.value.map((pic: Pic, idx: number) => ({ pic, idx })))

  watch(
    () => props.post.id,
    () => {
      expandedIndex.value = null
      viewerVisible.value = false
      brokenLive.value = new Set()
      brokenVideo.value = new Set()
    },
  )

  watch(
    mediaItems,
    (pics) => {
      stillUrls.value = (pics || []).map((pic: Pic) => {
        if (pic.type === 'video') return ''
        return localAssetUrl(pic.abs_path)
      })
      videoSrcUrls.value = (pics || []).map((pic: Pic) => {
        if (pic.type !== 'video') return ''
        const filePath = pic.playback_abs_path || pic.abs_path
        return localAssetUrl(filePath)
      })
      posterUrls.value = (pics || []).map((pic: Pic) => (
        pic.poster_abs_path ? localAssetUrl(pic.poster_abs_path) : ''
      ))
      videoUrls.value = (pics || []).map((pic: Pic) => (
        pic.type === 'livephoto' ? localAssetUrl(motionVideoPath(pic)) : ''
      ))
    },
    { immediate: true, deep: true },
  )

  watch(
    () => props.post.avatar_path,
    (path) => {
      avatarUrl.value = localAssetUrl(path)
    },
    { immediate: true },
  )

  const platform = computed(() => detectPostPlatform(props.post))

  const postDomId = computed(() => {
    const id = String(props.post.id || '').trim()
    return id ? `post-${id}` : ''
  })

  const displayName = computed(() =>
    props.post.user_name || props.post.screen_name || props.post.user_id || '用户',
  )

  const handle = computed(() =>
    String(props.post.screen_name || props.post.user_id || '').replace(/^@/, ''),
  )

  const isReply = computed(() => props.post.kind === 'reply' || (props.post.original === false && props.post.kind === 'reply'))

  const replyTo = computed(() => String(props.post.in_reply_to_user || '').replace(/^@/, ''))

  const isQuote = computed(() => props.post.kind === 'quote')

  const quotedFrom = computed(() => String(props.post.quoted_from_user || '').replace(/^@/, ''))

  const isPinned = computed(() => Boolean(props.post.pinned))

  const isCarousel = computed(() =>
    platform.value === 'instagram'
    && (props.post.kind === 'carousel' || Number(props.post.carousel_count || 0) > 1),
  )

  const carouselCount = computed(() =>
    Number(props.post.carousel_count || mediaItems.value.length || 0),
  )

  const isStory = computed(() => platform.value === 'instagram' && props.post.kind === 'story')

  const isReel = computed(() => platform.value === 'instagram' && props.post.kind === 'reel')

  const isBookmark = computed(() => props.post.kind === 'bookmark')

  const isLike = computed(() => props.post.kind === 'like')

  const initial = computed(() => displayName.value.slice(0, 1).toUpperCase())

  const mediaCount = computed(() => Math.min(mediaItems.value.length, 9))

  const mediaClass = computed(() => `count-${mediaCount.value}`)

  const xMediaClass = computed(() => {
    const n = mediaItems.value.length
    if (n <= 1) return 'x-one'
    if (n === 2) return 'x-two'
    if (n === 3) return 'x-three'
    return 'x-four'
  })

  const parsedDate = computed(() => parsePostDate(props.post.created_at || props.post.date || ''))

  const weiboTime = computed(() => formatWeiboTime(parsedDate.value, props.post.created_at || props.post.date || ''))

  const igTime = computed(() => formatInstagramTime(parsedDate.value, props.post.created_at || props.post.date || ''))

  const xTime = computed(() => formatXTime(parsedDate.value, props.post.created_at || props.post.date || ''))

  const weiboText = computed(() => {
    const html = formatRichText(props.post.text || '', platform.value === 'instagram' ? 'instagram' : 'weibo')
    const q = props.highlightQuery?.trim()
    return q ? highlightInHtml(html, q) : html
  })

  const xText = computed(() => {
    const html = formatRichText(props.post.text || '', 'twitter')
    const q = props.highlightQuery?.trim()
    return q ? highlightInHtml(html, q) : html
  })

  const viewerStill = computed(() => stillUrls.value[viewerIndex.value] || '')
  const viewerMotion = computed(() => {
    const pic = mediaItems.value[viewerIndex.value]
    if (!pic || pic.type !== 'livephoto') return ''
    return videoUrls.value[viewerIndex.value] || ''
  })

  function motionVideoPath(pic: Pic) {
    if (pic.video_playback_abs_path) return pic.video_playback_abs_path
    if (pic.video_playback_filename && pic.abs_path) {
      return pic.abs_path.replace(/[^\\/]+$/, pic.video_playback_filename)
    }
    return videoPath(pic)
  }

  function videoPath(pic: Pic) {
    if (pic.video_abs_path) return pic.video_abs_path
    if (pic.abs_path && pic.video_filename) {
      return pic.abs_path.replace(/[^\\/]+$/, pic.video_filename)
    }
    return ''
  }

  function cellLabel(pic: Pic) {
    if (pic.type === 'livephoto') return '实况图'
    if (pic.type === 'video') return '播放视频'
    return '查看图片'
  }

  function playLive(event: Event) {
    startLive((event.currentTarget as HTMLElement).querySelector('video.live-motion') as HTMLVideoElement | null)
  }

  function stopLive(event: Event) {
    const video = (event.currentTarget as HTMLElement).querySelector('video.live-motion') as HTMLVideoElement | null
    if (!video) return
    video.pause()
    video.currentTime = 0
    video.classList.remove('on')
  }

  function isPlayableLive(index: number) {
    const pic = mediaItems.value[index]
    return Boolean(
      pic
      && pic.type === 'livephoto'
      && videoUrls.value[index]
      && !brokenLive.value.has(index),
    )
  }

  function markLiveBroken(index: number) {
    if (index == null || brokenLive.value.has(index)) return
    const next = new Set(brokenLive.value)
    next.add(index)
    brokenLive.value = next
  }

  function markVideoBroken(index: number) {
    if (index == null || brokenVideo.value.has(index)) return
    const next = new Set(brokenVideo.value)
    next.add(index)
    brokenVideo.value = next
  }

  async function openLocalFile(filePath?: string) {
    if (!filePath) return
    try {
      if (window.electronAPI?.openLocalPath) {
        await window.electronAPI.openLocalPath(filePath)
      }
    } catch (e) { /* ignore */ }
  }

  function startLive(video: HTMLVideoElement | null) {
    if (!video || !video.src) return
    video.muted = true
    video.playsInline = true
    video.classList.add('on')
    const play = video.play()
    if (play && typeof play.catch === 'function') play.catch(() => {})
  }

  function expandWeibo(index: number) {
    expandedIndex.value = index
  }

  function collapseExpand() {
    const video = expandVideo.value
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    expandedIndex.value = null
  }

  function openViewer(index: number) {
    viewerIndex.value = index
    viewerVisible.value = true
  }

  function closeViewer() {
    const video = lightboxVideo.value
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    viewerVisible.value = false
  }

  function onViewerKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (viewerVisible.value) closeViewer()
      else if (expandedIndex.value !== null) collapseExpand()
      return
    }
    if (!viewerVisible.value) return
    if (event.key === 'ArrowRight') {
      const next = nextImageIndex(viewerIndex.value, 1)
      if (next >= 0) viewerIndex.value = next
    }
    if (event.key === 'ArrowLeft') {
      const prev = nextImageIndex(viewerIndex.value, -1)
      if (prev >= 0) viewerIndex.value = prev
    }
  }

  function nextImageIndex(from: number, step: number) {
    const pics = mediaItems.value
    for (let i = from + step; i >= 0 && i < pics.length; i += step) {
      if (pics[i].type !== 'video') return i
    }
    return -1
  }

  watch(expandedIndex, async (index) => {
    if (index === null) return
    await nextTick()
    startLive(expandVideo.value)
  })

  watch([viewerVisible, viewerIndex], async ([open]) => {
    if (!open) return
    await nextTick()
    startLive(lightboxVideo.value)
  })

  watch([viewerVisible, expandedIndex], ([lightbox, expanded]) => {
    window.removeEventListener('keydown', onViewerKey)
    if (lightbox || expanded !== null) window.addEventListener('keydown', onViewerKey)
  })

  onUnmounted(() => window.removeEventListener('keydown', onViewerKey))

  function openLink(url: string) {
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  function bindExpandVideo(el: Element | ComponentPublicInstance | null) {
    expandVideo.value = el as HTMLVideoElement | null
  }

  function bindLightboxVideo(el: Element | ComponentPublicInstance | null) {
    lightboxVideo.value = el as HTMLVideoElement | null
  }

  return {
    viewerVisible,
    viewerIndex,
    expandedIndex,
    stillUrls,
    videoSrcUrls,
    posterUrls,
    videoUrls,
    avatarUrl,
    expandVideo,
    lightboxVideo,
    brokenLive,
    brokenVideo,
    mediaItems,
    mediaSlots,
    platform,
    postDomId,
    displayName,
    handle,
    isReply,
    replyTo,
    isQuote,
    quotedFrom,
    isPinned,
    isCarousel,
    carouselCount,
    isStory,
    isReel,
    isBookmark,
    isLike,
    initial,
    mediaCount,
    mediaClass,
    xMediaClass,
    weiboTime,
    igTime,
    xTime,
    weiboText,
    xText,
    viewerStill,
    viewerMotion,
    motionVideoPath,
    videoPath,
    cellLabel,
    playLive,
    stopLive,
    isPlayableLive,
    markLiveBroken,
    markVideoBroken,
    openLocalFile,
    expandWeibo,
    collapseExpand,
    openViewer,
    closeViewer,
    bindExpandVideo,
    bindLightboxVideo,
    openLink,
  }
}

function parsePostDate(raw: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d
  return null
}

function formatWeiboTime(d: Date | null, fallback: string) {
  if (!d) return stripTags(fallback)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatInstagramTime(d: Date | null, fallback: string) {
  if (!d) return stripTags(fallback)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function formatXTime(d: Date | null, fallback: string) {
  if (!d) return stripTags(fallback)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (d.getFullYear() === now.getFullYear()) {
    return `${months[d.getMonth()]} ${d.getDate()}`
  }
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function stripTags(html: string) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatRichText(raw: string, kind: 'weibo' | 'twitter' | 'instagram') {
  let text = stripTags(raw)
  text = escapeHtml(text)
  if (kind === 'weibo') {
    text = text.replace(/#([^#\n]{1,40})#/g, '<span class="wb-topic">#$1#</span>')
    text = text.replace(/@([A-Za-z0-9_\u4e00-\u9fff-]+)/g, '<span class="wb-at">@$1</span>')
  } else if (kind === 'instagram') {
    text = text.replace(/(^|\s)#([A-Za-z0-9_\u4e00-\u9fff]+)/g, '$1<span class="ig-topic">#$2</span>')
    text = text.replace(/(^|\s)@([A-Za-z0-9_.]+)/g, '$1<span class="ig-at">@$2</span>')
  } else {
    text = text.replace(/(^|\s)#([A-Za-z0-9_\u4e00-\u9fff]+)/g, '$1<span class="x-hash">#$2</span>')
    text = text.replace(/(^|\s)@([A-Za-z0-9_]+)/g, '$1<span class="x-at">@$2</span>')
  }
  return text.replace(/\n/g, '<br/>')
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
