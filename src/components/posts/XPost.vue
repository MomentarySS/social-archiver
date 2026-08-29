<script setup lang="ts">
import type { Post } from '../../electron-api.d.ts'
import { usePostCard } from './usePostCard'
import PostLightbox from './PostLightbox.vue'
import './postCard.css'

const props = defineProps<{
  post: Post
  highlightQuery?: string
}>()

const {
  postDomId,
  avatarUrl,
  initial,
  displayName,
  handle,
  isReply,
  replyTo,
  isQuote,
  quotedFrom,
  isPinned,
  isBookmark,
  isLike,
  xTime,
  xText,
  mediaItems,
  xMediaClass,
  mediaSlots,
  cellLabel,
  openViewer,
  brokenVideo,
  videoSrcUrls,
  posterUrls,
  markVideoBroken,
  openLocalFile,
  stillUrls,
  openLink,
  viewerVisible,
  viewerStill,
  viewerMotion,
  viewerIndex,
  bindLightboxVideo,
  isPlayableLive,
  markLiveBroken,
  closeViewer,
} = usePostCard(props)
</script>

<template>
  <article :id="postDomId" class="x-post">
    <button class="x-avatar" type="button" tabindex="-1">
      <img v-if="avatarUrl" :src="avatarUrl" alt="" />
      <span v-else>{{ initial }}</span>
    </button>
    <div class="x-body">
      <div class="x-head">
        <span class="x-name">{{ displayName }}</span>
        <span class="x-handle">@{{ handle }}</span>
        <span v-if="isReply" class="x-reply-badge">回复 @{{ replyTo }}</span>
        <span v-if="isQuote" class="x-quote-badge">引用自 @{{ quotedFrom }}</span>
        <span v-if="isBookmark" class="x-archive-badge">书签</span>
        <span v-if="isLike" class="x-archive-badge x-like-badge">点赞</span>
        <span v-if="isPinned" class="x-pinned-badge">置顶</span>
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
          <img v-else :src="stillUrls[slot.idx] || ''" loading="lazy" alt="" />
        </div>
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
