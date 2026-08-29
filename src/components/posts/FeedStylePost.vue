<script setup lang="ts">
import type { Post } from '../../electron-api.d.ts'
import { usePostCard } from './usePostCard'
import PostLightbox from './PostLightbox.vue'
import './postCard.css'

const props = defineProps<{
  post: Post
  platform: 'weibo' | 'instagram'
  highlightQuery?: string
}>()

const {
  postDomId,
  avatarUrl,
  initial,
  displayName,
  isQuote,
  quotedFrom,
  isPinned,
  isCarousel,
  carouselCount,
  isStory,
  isReel,
  handle,
  weiboTime,
  weiboText,
  expandedIndex,
  mediaItems,
  collapseExpand,
  openViewer,
  isPlayableLive,
  bindExpandVideo,
  bindLightboxVideo,
  stillUrls,
  videoUrls,
  markLiveBroken,
  videoPath,
  openLocalFile,
  mediaClass,
  mediaSlots,
  cellLabel,
  expandWeibo,
  playLive,
  stopLive,
  brokenVideo,
  markVideoBroken,
  videoSrcUrls,
  posterUrls,
  brokenLive,
  openLink,
  viewerVisible,
  viewerStill,
  viewerMotion,
  viewerIndex,
  closeViewer,
} = usePostCard(props)
</script>

<template>
  <article :id="postDomId" :class="platform === 'instagram' ? 'ig-post' : 'wb-post'">
    <button class="wb-avatar" type="button" tabindex="-1">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" />
      <span v-else>{{ initial }}</span>
    </button>
    <div class="wb-body">
      <div class="wb-name-row">
        <span class="wb-name">{{ displayName }}</span>
        <span v-if="post.verified && platform === 'weibo'" class="wb-vip" title="微博认证">V</span>
        <span v-if="isQuote" class="sa-quote-badge">引用自 @{{ quotedFrom }}</span>
        <span v-if="isPinned" class="sa-pinned-badge">置顶</span>
        <span v-if="isCarousel" class="ig-carousel-badge">轮播 {{ carouselCount }}</span>
        <span v-if="isStory" class="ig-story-badge">Story</span>
        <span v-if="isReel" class="ig-reel-badge">Reel</span>
        <template v-if="platform === 'instagram'">
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
            :ref="bindExpandVideo"
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
            :src="videoSrcUrls[slot.idx] || ''"
            :poster="posterUrls[slot.idx] || ''"
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
      <div v-if="platform !== 'instagram'" class="wb-meta">
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

  <PostLightbox
    :viewer-visible="viewerVisible"
    :viewer-still="viewerStill"
    :viewer-motion="viewerMotion"
    :viewer-index="viewerIndex"
    :on-lightbox-video="bindLightboxVideo"
    :is-playable-live="isPlayableLive"
    :mark-live-broken="markLiveBroken"
    :close-viewer="closeViewer"
  />
</template>
