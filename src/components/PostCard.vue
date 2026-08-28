<template>
  <article v-if="skin !== 'twitter'" :class="skin === 'instagram' ? 'ig-post' : 'wb-post'">
    <button class="wb-avatar" type="button" tabindex="-1">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" />
      <span v-else>{{ initial }}</span>
    </button>
    <div class="wb-body">
      <div class="wb-name-row">
        <span class="wb-name">{{ displayName }}</span>
        <span v-if="post.verified && skin === 'weibo'" class="wb-vip" title="微博认证">V</span>
        <template v-if="skin === 'instagram'">
          <span class="ig-handle">@{{ handle }}</span>
          <span class="ig-time">{{ weiboTime }}</span>
        </template>
      </div>
      <div v-if="post.text" class="wb-text" v-html="weiboText"></div>
      <div v-if="expandedIndex !== null && mediaItems[expandedIndex]" class="wb-expand">
        <div class="wb-expand-bar">
          <button type="button" @click="collapseExpand">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
            收起
          </button>
          <button type="button" @click="openViewer(expandedIndex)">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.2 10.2 13.5 13.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
            查看大图
          </button>
        </div>
        <div
          class="wb-expand-stage"
          :class="{ 'is-live': mediaItems[expandedIndex].type === 'livephoto' }"
        >
          <video
            v-if="isPlayableLive(expandedIndex)"
            ref="expandVideo"
            class="wb-expand-player"
            :poster="stillUrls[expandedIndex] || ''"
            :src="videoUrls[expandedIndex]"
            muted
            loop
            playsinline
            autoplay
            @error="markLiveBroken(expandedIndex)"
          />
          <img v-else :src="stillUrls[expandedIndex] || ''" alt="" />
          <span v-if="isPlayableLive(expandedIndex)" class="live-badge">LIVE</span>
          <button
            v-else-if="mediaItems[expandedIndex].type === 'livephoto' && brokenLive.has(expandedIndex) && videoPath(mediaItems[expandedIndex])"
            type="button"
            class="live-open"
            @click.stop="openLocalFile(videoPath(mediaItems[expandedIndex]))"
          >打开实况</button>
        </div>
      </div>
      <div
        v-else-if="mediaItems.length"
        class="wb-media"
        :class="mediaClass"
      >
        <div
          v-for="slot in mediaSlots"
          :key="slot.idx"
          class="wb-cell"
          :class="{ 'is-live': slot.pic.type === 'livephoto', 'is-video': slot.pic.type === 'video' }"
          role="button"
          tabindex="0"
          :aria-label="cellLabel(slot.pic)"
          @click="slot.pic.type === 'video' ? undefined : expandWeibo(slot.idx)"
          @pointerenter="playLive"
          @pointerleave="stopLive"
        >
          <video
            v-if="slot.pic.type === 'video' && !brokenVideo.has(slot.idx)"
            :src="stillUrls[slot.idx] || ''"
            controls
            playsinline
            preload="metadata"
            @click.stop
            @error="markVideoBroken(slot.idx)"
          />
          <div v-else-if="slot.pic.type === 'video'" class="video-fallback" @click.stop>
            <p>该视频编码在窗口内无法播放，请使用系统播放器打开</p>
            <button type="button" @click="openLocalFile(slot.pic.abs_path)">用系统播放器打开</button>
          </div>
          <template v-else>
            <img :src="stillUrls[slot.idx] || ''" loading="lazy" alt="" />
            <video
              v-if="isPlayableLive(slot.idx)"
              class="live-motion"
              :src="videoUrls[slot.idx]"
              muted
              loop
              playsinline
              preload="none"
              @error="markLiveBroken(slot.idx)"
            />
            <span v-if="isPlayableLive(slot.idx)" class="live-badge">LIVE</span>
            <button
              v-else-if="slot.pic.type === 'livephoto' && brokenLive.has(slot.idx) && videoPath(slot.pic)"
              type="button"
              class="live-open"
              @click.stop="openLocalFile(videoPath(slot.pic))"
            >打开实况</button>
          </template>
        </div>
      </div>
      <div v-if="skin !== 'instagram'" class="wb-meta">
        <span>{{ weiboTime }}</span>
        <span v-if="post.source">来自 {{ post.source }}</span>
        <a
          v-if="post.url"
          class="wb-open"
          :href="post.url"
          @click.prevent="openLink(post.url)"
        >查看原文</a>
      </div>
      <div v-else class="ig-meta">
        <a
          v-if="post.url"
          class="ig-open"
          :href="post.url"
          @click.prevent="openLink(post.url)"
        >查看原文</a>
      </div>
    </div>
  </article>

  <article v-else class="x-post">
    <button class="x-avatar" type="button" tabindex="-1">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" />
      <span v-else>{{ initial }}</span>
    </button>
    <div class="x-body">
      <div class="x-head">
        <span class="x-name">{{ displayName }}</span>
        <span class="x-handle">@{{ handle }}</span>
        <span class="x-dot">·</span>
        <span class="x-time">{{ xTime }}</span>
        <a
          v-if="post.url"
          class="x-open"
          :href="post.url"
          @click.prevent="openLink(post.url)"
        >打开原文</a>
      </div>
      <div v-if="post.text" class="x-text" v-html="xText"></div>
      <div
        v-if="mediaItems.length"
        class="x-media"
        :class="xMediaClass"
      >
        <div
          v-for="slot in mediaSlots"
          :key="slot.idx"
          class="x-cell"
          :class="{ 'is-video': slot.pic.type === 'video' }"
          role="button"
          tabindex="0"
          :aria-label="cellLabel(slot.pic)"
          @click="slot.pic.type === 'video' ? undefined : openViewer(slot.idx)"
        >
          <video
            v-if="slot.pic.type === 'video' && !brokenVideo.has(slot.idx)"
            :src="stillUrls[slot.idx] || ''"
            controls
            playsinline
            preload="metadata"
            @click.stop
            @error="markVideoBroken(slot.idx)"
          />
          <div v-else-if="slot.pic.type === 'video'" class="video-fallback" @click.stop>
            <p>该视频编码在窗口内无法播放，请使用系统播放器打开</p>
            <button type="button" @click="openLocalFile(slot.pic.abs_path)">用系统播放器打开</button>
          </div>
          <img v-else :src="stillUrls[slot.idx] || ''" loading="lazy" alt="" />
        </div>
      </div>
    </div>
  </article>

  <Teleport to="body">
    <div
      v-if="viewerVisible && viewerStill"
      class="sa-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="查看图片"
      @click.self="closeViewer"
    >
      <button class="sa-lightbox-close" type="button" @click="closeViewer">关闭</button>
      <div class="sa-lightbox-stage">
        <video
          v-if="viewerMotion && isPlayableLive(viewerIndex)"
          ref="lightboxVideo"
          class="sa-lightbox-player"
          :poster="viewerStill"
          :src="viewerMotion"
          muted
          loop
          playsinline
          autoplay
          @error="markLiveBroken(viewerIndex)"
        />
        <img v-else :src="viewerStill" alt="" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { groupLiveMedia } from '../utils/livePhoto.js'
import { localAssetUrl } from '../utils/assetUrl.js'

interface Pic {
  filename?: string
  abs_path?: string
  original_url?: string
  type?: string
  video_filename?: string
  video_url?: string
  video_abs_path?: string
}

interface Post {
  id?: string
  platform?: string
  user_id?: string
  user_name?: string
  screen_name?: string
  text?: string
  created_at?: string
  date?: string
  url?: string
  source?: string
  verified?: boolean
  avatar_path?: string
  reposts?: number
  comments?: number
  likes?: number
  pics?: Pic[]
}

const props = defineProps<{
  post: Post
}>()

const viewerVisible = ref(false)
const viewerIndex = ref(0)
const expandedIndex = ref<number | null>(null)
const stillUrls = ref<string[]>([])
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
    stillUrls.value = (pics || []).map((pic: Pic) => localAssetUrl(pic.abs_path))
    videoUrls.value = (pics || []).map((pic: Pic) => (
      pic.type === 'livephoto' ? localAssetUrl(videoPath(pic)) : ''
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

const skin = computed(() => {
  const platform = (props.post.platform || '').toLowerCase()
  if (platform === 'twitter' || platform === 'x') return 'twitter'
  if (platform === 'instagram') return 'instagram'
  if (platform === 'weibo') return 'weibo'
  const url = props.post.url || ''
  if (/x\.com|twitter\.com/i.test(url)) return 'twitter'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return 'weibo'
})

const displayName = computed(() =>
  props.post.user_name || props.post.screen_name || props.post.user_id || '用户',
)

const handle = computed(() =>
  String(props.post.screen_name || props.post.user_id || '').replace(/^@/, ''),
)

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

const xTime = computed(() => formatXTime(parsedDate.value, props.post.created_at || props.post.date || ''))

const weiboText = computed(() => formatRichText(props.post.text || '', skin.value === 'instagram' ? 'instagram' : 'weibo'))

const xText = computed(() => formatRichText(props.post.text || '', 'twitter'))

const viewerStill = computed(() => stillUrls.value[viewerIndex.value] || '')
const viewerMotion = computed(() => {
  const pic = mediaItems.value[viewerIndex.value]
  if (!pic || pic.type !== 'livephoto') return ''
  return videoUrls.value[viewerIndex.value] || ''
})

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
</script>

<style scoped>
.wb-post,
.ig-post,
.x-post {
  display: flex;
  gap: 10px;
  text-align: left;
}

.wb-post {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.ig-post {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #efefef;
}

.wb-avatar,
.x-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
  background: #ffb366;
  color: #fff;
  font-weight: 700;
  font-size: 20px;
}

.ig-post .wb-avatar {
  background: #dd2a7b;
}

.wb-avatar img,
.x-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wb-body,
.ig-post .wb-body,
.x-body {
  flex: 1;
  min-width: 0;
}

.wb-name {
  color: #333;
  font-weight: 700;
  font-size: 15px;
}

.ig-post .wb-name {
  color: #262626;
}

.wb-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.ig-handle,
.ig-time {
  color: #8e8e8e;
  font-size: 13px;
  font-weight: 400;
}

.wb-vip {
  display: inline-flex;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 50%;
  background: #ff8200;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.wb-text {
  margin-top: 6px;
  font-size: 15px;
  line-height: 1.6;
  color: #333;
  word-break: break-word;
}

.wb-text :deep(.wb-topic),
.wb-text :deep(.wb-at) {
  color: #eb7350;
}

.wb-text :deep(.ig-topic),
.wb-text :deep(.ig-at) {
  color: #0095f6;
}

.wb-media {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  max-width: 360px;
}

.wb-media.count-1 {
  grid-template-columns: 1fr;
  max-width: 260px;
}

.wb-media.count-2,
.wb-media.count-4 {
  grid-template-columns: repeat(2, 1fr);
}

.wb-media.count-3,
.wb-media.count-5,
.wb-media.count-6,
.wb-media.count-7,
.wb-media.count-8,
.wb-media.count-9 {
  grid-template-columns: repeat(3, 1fr);
}

.wb-expand {
  margin-top: 8px;
  max-width: 360px;
}

.wb-expand-bar {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.wb-expand-bar button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 0;
  background: none;
  color: #636363;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.wb-expand-bar button:hover {
  color: #eb7350;
}

.wb-expand-bar svg {
  width: 14px;
  height: 14px;
}

.wb-expand-stage {
  position: relative;
  background: #f2f2f5;
}

.wb-expand-stage img,
.wb-expand-player {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  display: block;
  background: #f2f2f5;
}

.wb-cell {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 0;
  padding: 0;
  background: #f2f2f5;
  cursor: pointer;
}

.wb-cell.is-video {
  aspect-ratio: 16 / 9;
  background: #000;
  cursor: default;
}

.video-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 120px;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
  background: #111;
  text-align: center;
  font-size: 13px;
  line-height: 1.4;
}

.video-fallback p {
  margin: 0;
  color: inherit;
}

.video-fallback button,
.live-open {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: #ff8200;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.x-cell .video-fallback button {
  background: #1d9bf0;
}

.live-open {
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 1;
}

.live-motion {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  pointer-events: none;
}

.wb-cell.is-live:hover .live-motion,
.live-motion.on {
  opacity: 1;
}

.live-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 1;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 18px;
}

.wb-media.count-1 .wb-cell {
  aspect-ratio: auto;
  max-height: 320px;
}

.wb-cell img,
.wb-cell video,
.x-cell img,
.x-cell video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wb-media.count-1 .wb-cell img,
.wb-media.count-1 .wb-cell video {
  object-fit: contain;
  background: #f7f7f7;
}

.wb-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #939393;
  display: flex;
  gap: 8px;
  align-items: center;
}

.wb-open {
  color: #eb7350;
  text-decoration: none;
}

.wb-open:hover {
  text-decoration: underline;
}

.ig-meta {
  margin-top: 8px;
  font-size: 12px;
}

.ig-open {
  color: #0095f6;
  text-decoration: none;
}

.ig-open:hover {
  text-decoration: underline;
}

.ig-post .wb-text {
  color: #262626;
}

.ig-post .video-fallback button,
.ig-post .live-open {
  background: #0095f6;
}

.x-post {
  padding: 12px 16px;
  border-bottom: 1px solid #2f3336;
  background: #000;
}

.x-avatar {
  width: 40px;
  height: 40px;
  background: #536471;
}

.x-head {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 15px;
  line-height: 1.3;
}

.x-name {
  color: #e7e9ea;
  font-weight: 700;
}

.x-handle,
.x-dot,
.x-time {
  color: #71767b;
}

.x-open {
  margin-left: auto;
  color: #1d9bf0;
  font-size: 13px;
  text-decoration: none;
}

.x-open:hover {
  text-decoration: underline;
}

.x-text {
  margin-top: 4px;
  font-size: 15px;
  line-height: 1.5;
  color: #e7e9ea;
  word-break: break-word;
}

.x-text :deep(.x-hash),
.x-text :deep(.x-at) {
  color: #1d9bf0;
}

.x-media {
  margin-top: 12px;
  border: 1px solid #2f3336;
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  gap: 2px;
  max-width: 510px;
}

.x-one {
  grid-template-columns: 1fr;
}

.x-two {
  grid-template-columns: 1fr 1fr;
}

.x-three {
  grid-template-columns: 1.2fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.x-three .x-cell:first-child {
  grid-row: 1 / 3;
}

.x-four {
  grid-template-columns: 1fr 1fr;
}

.x-cell {
  min-height: 128px;
  max-height: 510px;
  border: 0;
  padding: 0;
  background: #16181c;
  cursor: pointer;
}

.x-cell.is-video {
  cursor: default;
}

.x-one .x-cell {
  min-height: 200px;
}

.x-one .x-cell img,
.x-one .x-cell video {
  object-fit: contain;
  max-height: 510px;
}

.sa-lightbox {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.88);
}

.sa-lightbox-stage {
  position: relative;
  max-width: 96vw;
  max-height: 96vh;
}

.sa-lightbox-stage img,
.sa-lightbox-player {
  max-width: 96vw;
  max-height: 96vh;
  object-fit: contain;
  display: block;
}

.sa-lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #1d9bf0;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
